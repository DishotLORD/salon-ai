import { NextResponse } from 'next/server'
import OpenAI from 'openai'

import { MENU_PDF_MAX_BYTES, MENU_PDF_MAX_MB } from '@/lib/menu-pdf-limits'
import {
  MENU_OCR_MAX_PAGES,
  OCR_UNAVAILABLE_MESSAGE,
  decideOcrCoverage,
  ocrCoverageMessage,
} from '@/lib/menu-ocr-coverage'
import {
  extractPdfTextLayer,
  getPdfPageCount,
  INVALID_PDF_MESSAGE,
  isInvalidPdfError,
  pdfReadErrorMessage,
  renderPdfPagesToPngBase64,
} from '@/lib/menu-pdf-read'
import {
  MENU_CHUNK_INSERT_BATCH,
  MENU_INDEX_BUSY_MESSAGE,
  MENU_INDEX_FAILED_MESSAGE,
  MENU_INDEX_LIMIT_PER_HOUR,
  MENU_INDEX_WINDOW_MS,
  MENU_MAX_CHUNKS_SYNC,
  MENU_TOO_LARGE_MESSAGE,
  buildChunkRows,
  embedMenuChunks,
  menuIndexRateLimitKey,
} from '@/lib/menu-indexing'
import { chunkMenuText, chunksCoverSource } from '@/lib/menu-chunking'
import { normalizeMenuText } from '@/lib/menu-ocr-normalize'
import { checkRateLimit } from '@/lib/rate-limit'
import { businessIdFromUrl, declaredBodyTooLarge } from '@/lib/upload-guard'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessOwner } from '@/lib/verify-business-owner'

export const maxDuration = 120 // 2 minutes for OCR of large PDFs


/**
 * OCR renders pages at 2.5× and sends them to GPT-4o Vision with a 16k-token
 * budget. That is the single most expensive request this product can make, and
 * re-uploading the same menu a few times in a row is a normal thing for someone
 * to do while fiddling with settings. Capped per venue.
 */
const OCR_LIMIT_PER_HOUR = 12

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ── OCR: render PDF pages to PNGs, send to GPT-4o Vision ─────────────────────
/**
 * Only ever called once coverage has been established, so `MENU_OCR_MAX_PAGES`
 * here is a ceiling that the document is already known to fit inside — not a
 * silent truncation point.
 */
async function ocrPdf(buffer: Buffer): Promise<string> {
  const pageImages = await renderPdfPagesToPngBase64(buffer, {
    maxPages: MENU_OCR_MAX_PAGES,
    scale: 2.5,
  })

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
  /** How many pages OCR actually covered; only set once coverage is proven. */
  let ocrPageCount = 0

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

  /*
   * Why OCR is wanted decides what may happen if it cannot run, so the two
   * reasons are kept apart rather than collapsed into one boolean.
   *
   * `textLayerUnusable` means what we have is missing or known to be partial —
   * headings without prices, a page of footers. Nothing downstream may save it.
   * `forceOcr` on top of a text layer that already looks complete is a
   * preference, not a defect, and falling back to that complete text is safe.
   */
  const textLayerUnusable = !text || parseIncomplete()
  const shouldOcr = textLayerUnusable || forceOcr

  /*
   * Coverage, decided before a single page is rendered.
   *
   * This gate exists because OCR used to run to its page ceiling on a document
   * of any length, and whatever came back replaced the extracted text and was
   * saved behind a 200 — a 60-page menu became a 10-page one, and nothing said
   * so. Refusing here rather than after the render also means an oversized
   * document never spends the venue's OCR budget or two minutes of function
   * time on work that must be thrown away.
   *
   * Note this sits inside `shouldOcr`. A long PDF whose text layer is complete
   * never reaches it: extraction reads every page, so a 100-page searchable
   * menu is saved in full, exactly as before.
   */
  if (shouldOcr) {
    let totalPages: number | null = pages > 0 ? pages : null
    if (totalPages === null) {
      /*
       * Extraction threw, so the count never got out. Ask for it directly
       * rather than assuming the document is short — that assumption is the
       * one that produced a ten-page menu from a sixty-page file.
       */
      try {
        totalPages = await getPdfPageCount(buffer)
      } catch (err) {
        console.error(
          '[pdf] page count failed:',
          err instanceof Error ? err.message : err,
        )
        totalPages = null
      }
    }

    const coverage = decideOcrCoverage(totalPages)
    if (!coverage.ok) {
      // Nothing is written on this path, so whatever menu the venue already had
      // is still theirs. The file is not called invalid — it is longer than one
      // OCR pass can honestly read.
      return NextResponse.json(
        {
          error: ocrCoverageMessage(coverage),
          code: coverage.reason,
          totalPages: coverage.reason === 'ocr_page_limit' ? coverage.totalPages : null,
          maxOcrPages: MENU_OCR_MAX_PAGES,
        },
        { status: 422 },
      )
    }
    ocrPageCount = coverage.ocrPages
    /*
     * The count is now known for certain, including on the path where
     * extraction threw and it had to be fetched. Adopting it here keeps the
     * success response honest: `pages` is the document's real length rather
     * than the 0 that extraction left behind, and it equals `ocrPages`.
     */
    pages = coverage.ocrPages
  }

  /*
   * OCR is the expensive path, so it gets a budget.
   *
   * Running out of it is only survivable when there is already a complete text
   * layer to fall back on. This branch used to keep any non-empty text, which
   * meant a document whose extraction was judged *incomplete* — the very reason
   * OCR was wanted — got saved anyway the moment the budget ran dry: headings
   * with no prices, stored as the venue's menu, behind a 200. That is the same
   * defect this PR exists to remove, reached by a different route.
   */
  let ocrAllowed = true
  if (shouldOcr) {
    const ocrBudget = await checkRateLimit(`menu-ocr:${business_id}`, OCR_LIMIT_PER_HOUR, 3_600_000)
    if (!ocrBudget.allowed) {
      if (textLayerUnusable) {
        // Nothing readable and nothing safe to fall back on. Refuse and leave
        // whatever menu the venue already had in place.
        return NextResponse.json(
          {
            error: OCR_UNAVAILABLE_MESSAGE,
            code: 'ocr_unavailable',
            maxOcrPages: MENU_OCR_MAX_PAGES,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(ocrBudget.retryAfterSec ?? 600) },
          },
        )
      }
      // Only `force_ocr` asked for this, and the text layer already looks
      // complete — handing that back is a real menu, not a partial one.
      console.warn('[pdf] OCR budget spent for', business_id, '— keeping the complete text layer')
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

  /*
   * From here the menu is indexed before it is published.
   *
   * `businesses.menu_pdf_text` used to be written the moment text existed. It
   * is now written only inside activate_menu_document, in the same transaction
   * that flips the new document to active — so the stored text and the indexed
   * document are always the same upload. Writing them apart is how a venue ends
   * up with two current menus: the owner reads the new one in Settings while
   * retrieval still serves the old, or the reverse, and neither is a menu
   * anybody chose.
   *
   * Every refusal below therefore leaves the previous menu exactly as it was.
   */
  const menuText = normalizeMenuText(text)
  if (!menuText) {
    return NextResponse.json(
      { error: 'No text found in this PDF even after OCR.' },
      { status: 422 },
    )
  }

  let chunks
  try {
    chunks = chunkMenuText(menuText, { source: usedOcr ? 'pdf_ocr' : 'pdf_text' })
  } catch (err) {
    console.error('[menu-index] chunking failed:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: MENU_INDEX_FAILED_MESSAGE, code: 'chunking_failed' },
      { status: 422 },
    )
  }

  if (chunks.length === 0 || !chunksCoverSource(menuText, chunks)) {
    // A chunker that silently drops a page is the failure this design exists to
    // avoid; cheap to prove it did not, and fatal if it did.
    console.error('[menu-index] chunk coverage check failed for', business_id)
    return NextResponse.json(
      { error: MENU_INDEX_FAILED_MESSAGE, code: 'chunking_failed' },
      { status: 422 },
    )
  }

  // Before embeddings, before any document row: an oversized menu costs nothing.
  if (chunks.length > MENU_MAX_CHUNKS_SYNC) {
    return NextResponse.json(
      {
        error: MENU_TOO_LARGE_MESSAGE,
        code: 'menu_too_large',
        chunks: chunks.length,
        maxChunks: MENU_MAX_CHUNKS_SYNC,
      },
      { status: 422 },
    )
  }

  const indexBudget = await checkRateLimit(
    menuIndexRateLimitKey(business_id),
    MENU_INDEX_LIMIT_PER_HOUR,
    MENU_INDEX_WINDOW_MS,
  )
  if (!indexBudget.allowed) {
    return NextResponse.json(
      { error: MENU_INDEX_BUSY_MESSAGE, code: 'menu_index_rate_limited' },
      { status: 429, headers: { 'Retry-After': String(indexBudget.retryAfterSec ?? 600) } },
    )
  }

  // Opens the job under a row lock, or refuses because one is already running.
  const { data: documentId, error: beginError } = await supabaseAdmin.rpc('begin_menu_indexing', {
    p_business_id: business_id,
    p_source: usedOcr ? 'pdf_ocr' : 'pdf_text',
    p_char_count: menuText.length,
  })
  if (beginError || typeof documentId !== 'string') {
    const busy = /menu_processing/.test(beginError?.message ?? '')
    console.error('[menu-index] begin failed:', beginError?.message ?? 'no document id')
    return NextResponse.json(
      {
        error: busy ? MENU_INDEX_BUSY_MESSAGE : MENU_INDEX_FAILED_MESSAGE,
        code: busy ? 'menu_processing' : 'index_begin_failed',
      },
      { status: busy ? 409 : 500 },
    )
  }

  /** Retire the half-built document so the venue is not locked out. */
  const abandon = async () => {
    const { error } = await supabaseAdmin.rpc('fail_menu_document', {
      p_document_id: documentId,
      p_business_id: business_id,
    })
    if (error) console.error('[menu-index] could not mark document failed:', error.message)
  }

  const embedded = await embedMenuChunks(openai, chunks)
  if (!embedded.ok) {
    await abandon()
    return NextResponse.json(
      { error: MENU_INDEX_FAILED_MESSAGE, code: `embedding_${embedded.reason}` },
      { status: embedded.reason === 'timeout' ? 504 : 502 },
    )
  }

  const rows = buildChunkRows(chunks, embedded.embeddings, business_id, documentId)
  for (let i = 0; i < rows.length; i += MENU_CHUNK_INSERT_BATCH) {
    const { error } = await supabaseAdmin
      .from('menu_chunks')
      .insert(rows.slice(i, i + MENU_CHUNK_INSERT_BATCH))
    if (error) {
      console.error('[menu-index] chunk insert failed:', error.message)
      await abandon()
      return NextResponse.json(
        { error: MENU_INDEX_FAILED_MESSAGE, code: 'chunk_insert_failed' },
        { status: 500 },
      )
    }
  }

  /*
   * Activation counts the rows itself and refuses a document that is short,
   * miscounted or missing an embedding, then moves the active flag and the
   * legacy text together. Until this returns, the venue's menu is the old one.
   */
  const { error: activateError } = await supabaseAdmin.rpc('activate_menu_document', {
    p_document_id: documentId,
    p_business_id: business_id,
    p_expected_chunks: chunks.length,
    p_menu_text: menuText,
  })
  if (activateError) {
    console.error('[menu-index] activation failed:', activateError.message)
    await abandon()
    return NextResponse.json(
      { error: MENU_INDEX_FAILED_MESSAGE, code: 'activation_failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    text: menuText,
    pages,
    usedOcr,
    // Present only when OCR ran, and equal to `pages` by construction: the
    // coverage gate above refuses anything it cannot read end to end.
    ...(usedOcr ? { ocrPages: ocrPageCount } : {}),
    indexedChunks: chunks.length,
  })
}

// ── DELETE /api/menu/pdf ──────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const body = (await request.json()) as { business_id?: string }
  const { business_id } = body

  if (typeof business_id !== 'string' || !business_id)
    return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const check = await verifyOwner(business_id)
  if (check instanceof NextResponse) return check

  /*
   * One transaction, under the same row lock the upload takes. Clearing the
   * text on its own would let an upload that is mid-flight finish afterwards
   * and activate — bringing back the menu the owner just deleted, with nobody
   * having asked for it. The function refuses while a live job exists instead.
   */
  const { error } = await supabaseAdmin.rpc('delete_active_menu', {
    p_business_id: business_id,
  })
  if (error) {
    const busy = /menu_processing/.test(error.message)
    console.error('[menu-index] delete failed:', error.message)
    return NextResponse.json(
      {
        error: busy ? MENU_INDEX_BUSY_MESSAGE : MENU_INDEX_FAILED_MESSAGE,
        code: busy ? 'menu_processing' : 'delete_failed',
      },
      { status: busy ? 409 : 500 },
    )
  }
  return NextResponse.json({ ok: true })
}
