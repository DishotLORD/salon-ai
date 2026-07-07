import path from 'path'
import { pathToFileURL } from 'url'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export const maxDuration = 120 // 2 minutes for OCR of large PDFs

import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessOwner } from '@/lib/verify-business-owner'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ── OCR: render PDF pages to PNGs, send to GPT-4o Vision ─────────────────────
async function ocrPdf(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const pdfDist = path.join(process.cwd(), 'node_modules', 'pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(pdfDist, 'legacy', 'build', 'pdf.worker.mjs'),
  ).href

  const dirUrl = (sub: string) => pathToFileURL(path.join(pdfDist, sub) + path.sep).href

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getDocument = (pdfjsLib as any).getDocument as (p: Record<string, unknown>) => { promise: Promise<any> }

  const doc = await getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: dirUrl('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: dirUrl('standard_fonts'),
    wasmUrl: dirUrl('wasm'),
  }).promise

  const MAX_PAGES = 10
  const pageCount = Math.min(doc.numPages, MAX_PAGES)
  const pageImages: string[] = []
  const canvasFactory = doc.canvasFactory as {
    create: (w: number, h: number) => { canvas: { toBuffer: (mime: string) => Buffer }; context: unknown }
  }

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2.5 })
    const w = Math.ceil(viewport.width)
    const h = Math.ceil(viewport.height)
    const { canvas, context } = canvasFactory.create(w, h)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page as any).render({ canvasContext: context, viewport }).promise
    pageImages.push(canvas.toBuffer('image/png').toString('base64'))
    page.cleanup()
  }

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
 * pdf-parse often returns only headings (dish names) while prices and descriptions
 * live in a different layer, custom encodings, or outlines. If the string looks
 * like a priced menu but barely contains digits / price-like tokens, fall back to vision OCR.
 */
function parsedPdfLikelyIncomplete(text: string, pageCount: number): boolean {
  const t = text.trim()
  if (!t) return true

  const lines = t.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 2)
  if (lines.length === 0) return true

  // One real menu page almost always yields more text than a stray footer line
  // (e.g. only "Gluten free buns available $4" from pdf-parse).
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

// ── POST /api/menu/pdf ────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const formData = await request.formData()
  const business_id = formData.get('business_id')
  const file = formData.get('file')
  const forceOcr = formData.get('force_ocr') === '1' || formData.get('force_ocr') === 'true'

  if (typeof business_id !== 'string' || !business_id)
    return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  if (!(file instanceof Blob))
    return NextResponse.json({ error: 'file required' }, { status: 400 })

  const check = await verifyOwner(business_id)
  if (check instanceof NextResponse) return check

  const buffer = Buffer.from(await file.arrayBuffer())

  // Try text extraction first (fast, free)
  let text = ''
  let pages = 0
  let usedOcr = false

  try {
    const result = await pdfParse(buffer)
    text = result.text.trim()
    pages = result.numpages
  } catch {
    // parsing failed, will fall through to OCR
  }

  const pageCount = pages || 1
  const parseIncomplete = () => parsedPdfLikelyIncomplete(text, pageCount)
  const shouldOcr = !text || forceOcr || parseIncomplete()

  // Scanned PDFs, empty text layer, or "titles only" extraction → vision OCR
  if (shouldOcr) {
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
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[pdf] OCR error:', msg)
      if (!textBeforeOcr) {
        return NextResponse.json(
          { error: `Could not read this PDF. Error: ${msg}` },
          { status: 422 },
        )
      }
      if (parsedPdfLikelyIncomplete(textBeforeOcr, pageCount)) {
        return NextResponse.json(
          {
            error: `PDF vision read failed (${msg}). This often happens if the server cannot run PDF rendering; redeploy with current dependencies or try another file.`,
          },
          { status: 422 },
        )
      }
      console.warn('[pdf] Keeping pdf-parse text after OCR failure (parse looked complete)')
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
