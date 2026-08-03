import { NextResponse } from 'next/server'
import OpenAI from 'openai'

import { MENU_PDF_MAX_BYTES, MENU_PDF_MAX_MB } from '@/lib/menu-pdf-limits'
import {
  extractPdfTextLayer,
  INVALID_PDF_MESSAGE,
  isInvalidPdfError,
  pdfReadErrorMessage,
  renderPdfPagesToPngBase64,
} from '@/lib/menu-pdf-read'
import { checkRateLimit } from '@/lib/rate-limit'
import { businessIdFromUrl, declaredBodyTooLarge } from '@/lib/upload-guard'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessOwner } from '@/lib/verify-business-owner'

export const maxDuration = 120 // 2 minutes for OCR of large PDFs


/**
 * OCR renders ten pages at 2.5× and sends them to GPT-4o Vision with a
 * 16k-token budget. That is the single most expensive request this product can
 * make, and re-uploading the same menu a few times in a row is a normal thing
 * for someone to do while fiddling with settings. Capped per venue.
 */
const OCR_LIMIT_PER_HOUR = 12

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ── OCR: render PDF pages to PNGs, send to GPT-4o Vision ─────────────────────
async function ocrPdf(buffer: Buffer): Promise<string> {
  const pageImages = await renderPdfPagesToPngBase64(buffer, { maxPages: 10, scale: 2.5 })

  // Send pages to GPT-4o Vision
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `These are pages from a restaurant menu PDF. Transcribe EVERYTHING visible: section headers, dish names, ingredients or descriptions (small print), and prices (including currency symbols). Preserve reading order (name then description then price, as on the page). If text is in columns, read left column top-to-bottom then right column. Return plain text; group each dish with its price and any sub-lines for ingredients. Do not summarize or skip fine print.`,
    },
    ...pageImages.map((b64) => ({
      type: 'image_url' as const,
      image_url: { url: `data:image/png;base64,${b64}`, detail: 'high' as const },
    })),
  ]

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content }],
    max_tokens: 16384,
  })

  return response.choices[0].message.content?.trim() ?? ''
}

/**
 * A text layer that only has headings (dish names) while prices and descriptions
 * live in a different layer, custom encodings, or outlines. If the string looks
 * like a priced menu but barely contains digits / price-like tokens, fall back to vision OCR.
 */
function parsedPdfLikelyIncomplete(text: string, pageCount: number): boolean {
  const t = text.trim()
  if (!t) return true

  const lines = t.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 2)
  if (lines.length === 0) return true

  // One real menu page almost always yields more text than a stray footer line
  // (e.g. only "Gluten free buns available $4").
  const pages = Math.max(pageCount, 1)
  const minCharsForPages = Math.max(320, 220 * pages)
  if (t.length < minCharsForPages) return true

  // Very few non-empty lines vs page count → text layer likely missed the layout.
  if (lines.length <= 3 && t.length < 1800) return true

  const digitRuns = t.match(/\d+/g) ?? []
  const priceLike =
    t.match(
      /\$?\d{1,4}[.,]\d{2}\b|\b\d{1,3}\s*[$€£₽]|\b[$€£₽]\s*\d+|\b\d{2,3}\s*\/\s*\d{2,3}\b/g,
    ) ?? []

  const minDigitRunsForMenu = Math.max(3, Math.floor(lines.length * 0.2))
  if (lines.length >= 4 && digitRuns.length < minDigitRunsForMenu && priceLike.length < Math.max(2, Math.floor(lines.length * 0.15))) {
    return true
  }

  const charsPerPage = t.length / pages
  if (charsPerPage < 320) return true

  return false
}

// ── Auth helper ───────────────────────────────────────────────────────────────
// Owner or manager may manage the menu (matches verifyBusinessOwner semantics).
async function verifyOwner(business_id: string): Promise<true | NextResponse> {
  const allowed = await verifyBusinessOwner(business_id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return true
}

// ── POST /api/menu/pdf?business_id=… ─────────────────────────────────────────
export async function POST(request: Request) {
  /*
   * Everything down to the formData() call is deliberately body-free.
   *
   * formData() buffers the entire multipart upload. This route used to call it
   * first and authorize afterwards, so an anonymous request could make the
   * server hold a whole file in memory before being told 403. The venue id now
   * travels in the query string precisely so authorization can finish first —
   * it is a tenant identifier, already public in every widget embed URL, and
   * nothing about it is worth protecting.
   */
  const business_id = businessIdFromUrl(request.url)
  if (!business_id) {
    return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  }

  // Owner or manager, exactly as before — verifyOwner is unchanged, it just runs
  // sooner. It answers 403 for a signed-in stranger and for no session at all.
  const check = await verifyOwner(business_id)
  if (check instanceof NextResponse) return check

  /*
   * Advisory size gate, before the read rather than after it. Content-Length is
   * the client's claim and a chunked upload has none, so this only catches the
   * obvious cases; the real limit is still enforced below against the parsed
   * file's own size, which is the number that cannot be lied about.
   */
  if (declaredBodyTooLarge(request.headers.get('content-length'), MENU_PDF_MAX_BYTES)) {
    return NextResponse.json(
      {
        error: `That upload is larger than the ${MENU_PDF_MAX_MB} MB limit. Export the menu at a lower resolution, or upload the food and drink menus separately.`,
      },
      { status: 413 },
    )
  }

  // A malformed multipart body threw straight out of the handler, so a truncated
  // upload came back as a 500 with a stack trace instead of "try again".
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Could not read the upload. Please choose the file again.' },
      { status: 400 },
    )
  }

  const file = formData.get('file')
  const forceOcr = formData.get('force_ocr') === '1' || formData.get('force_ocr') === 'true'

  if (!(file instanceof Blob))
    return NextResponse.json({ error: 'file required' }, { status: 400 })

  if (file.size > MENU_PDF_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    return NextResponse.json(
      {
        error: `That PDF is ${mb} MB — the limit is ${MENU_PDF_MAX_MB} MB. Export it at a lower resolution, or upload the food and drink menus separately.`,
      },
      { status: 413 },
    )
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  /*
   * Trust the bytes, not the name or the browser's guess at a MIME type. A .docx
   * renamed to .pdf used to get all the way through parsing and Vision before
   * failing with something unhelpful about rendering.
   */
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return NextResponse.json(
      { error: 'That does not look like a PDF. Export the menu as a PDF and try again.' },
      { status: 415 },
    )
  }

  // Try text extraction first (fast, free) — pdf.js with Node canvas polyfills.
  let text = ''
  let pages = 0
  let usedOcr = false

  try {
    const result = await extractPdfTextLayer(buffer)
    text = result.text
    pages = result.pages
  } catch (err) {
    if (isInvalidPdfError(err)) {
      return NextResponse.json({ error: INVALID_PDF_MESSAGE }, { status: 422 })
    }
    // Unexpected open failure: still attempt OCR below only if we have no text.
    console.error('[pdf] text-layer extract failed:', err instanceof Error ? err.message : err)
  }

  const pageCount = pages || 1
  const parseIncomplete = () => parsedPdfLikelyIncomplete(text, pageCount)
  const shouldOcr = !text || forceOcr || parseIncomplete()

  /*
   * OCR is the expensive path, so it gets a budget. Spending it out is not
   * necessarily an error: if the free text layer produced something usable we
   * quietly hand that back instead. It is only fatal when there is nothing else.
   */
  let ocrAllowed = true
  if (shouldOcr) {
    const ocrBudget = await checkRateLimit(`menu-ocr:${business_id}`, OCR_LIMIT_PER_HOUR, 3_600_000)
    if (!ocrBudget.allowed) {
      if (!text) {
        return NextResponse.json(
          {
            error:
              'This menu needs image reading, and that has been used heavily in the last hour. Try again shortly, or paste the menu text into Settings → Menu.',
          },
          {
            status: 429,
            headers: { 'Retry-After': String(ocrBudget.retryAfterSec ?? 600) },
          },
        )
      }
      console.warn('[pdf] OCR budget spent for', business_id, '— keeping the text-layer extraction')
      ocrAllowed = false
    }
  }

  // Scanned PDFs, empty text layer, or "titles only" extraction → vision OCR
  if (shouldOcr && ocrAllowed) {
    const textBeforeOcr = text
    try {
      const ocrText = await ocrPdf(buffer)
      const trimmed = ocrText.trim()
      if (trimmed) {
        text = trimmed
        usedOcr = true
      } else if (!textBeforeOcr) {
        text = ''
      } else if (parsedPdfLikelyIncomplete(textBeforeOcr, pageCount)) {
        return NextResponse.json(
          {
            error:
              'Vision OCR returned no text for this PDF. Try exporting the menu as images or a different PDF.',
          },
          { status: 422 },
        )
      }
    } catch (err) {
      const msg = pdfReadErrorMessage(err)
      console.error('[pdf] OCR error:', err instanceof Error ? err.message : err)
      if (isInvalidPdfError(err)) {
        return NextResponse.json({ error: INVALID_PDF_MESSAGE }, { status: 422 })
      }
      if (!textBeforeOcr) {
        return NextResponse.json({ error: msg }, { status: 422 })
      }
      if (parsedPdfLikelyIncomplete(textBeforeOcr, pageCount)) {
        return NextResponse.json({ error: msg }, { status: 422 })
      }
      console.warn('[pdf] Keeping text-layer extraction after OCR failure (parse looked complete)')
      text = textBeforeOcr
    }
  }

  if (!text) {
    return NextResponse.json(
      { error: 'No text found in this PDF even after OCR.' },
      { status: 422 },
    )
  }

  const { error } = await supabaseAdmin
    .from('businesses')
    .update({ menu_pdf_text: text })
    .eq('id', business_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ text, pages, usedOcr })
}

// ── DELETE /api/menu/pdf ──────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const body = (await request.json()) as { business_id?: string }
  const { business_id } = body

  if (typeof business_id !== 'string' || !business_id)
    return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const check = await verifyOwner(business_id)
  if (check instanceof NextResponse) return check

  const { error } = await supabaseAdmin
    .from('businesses').update({ menu_pdf_text: null }).eq('id', business_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
