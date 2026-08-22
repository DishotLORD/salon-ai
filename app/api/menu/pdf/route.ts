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
  MENU_EMBEDDING_TOTAL_BUDGET_MS,
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
import { chunkMenuText, chunksCoverSource, menuCharacterCount } from '@/lib/menu-chunking'
import {
  MENU_PDF_MIME_TYPE,
  MENU_RETENTION_FAILED_MESSAGE,
  removeOrphanedOriginal,
  retainOriginalPdf,
  safeOriginalFilename,
} from '@/lib/menu-pdf-retention'
import { normalizeMenuText } from '@/lib/menu-ocr-normalize'
import { checkRateLimit } from '@/lib/rate-limit'
import { businessIdFromUrl, declaredBodyTooLarge } from '@/lib/upload-guard'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessOwner } from '@/lib/verify-business-owner'

export const maxDuration = 120 // 2 minutes for OCR of large PDFs

/**
 * How long this route may spend on work, leaving the rest of `maxDuration` to
 * finish cleanly.
 *
 * Every expensive step shares this one absolute deadline: rendering, Vision,
 * embeddings. Giving each phase its own budget does not bound the request —
 * OCR could take a minute and embeddings would still start a fresh seventy
 * seconds, and the platform's own 120-second kill would arrive first.
 *
 * That kill is the outcome to avoid, not a fallback. It stops the function
 * mid-flight, so `release()` never runs, the lease stays `indexing`, and the
 * venue cannot upload again until the ten-minute stale window expires — over a
 * request that merely ran long. The fifteen seconds held back here are for
 * retiring the lease, serialising a response and runtime overhead.
 */
export const REQUEST_WORK_BUDGET_MS = 105_000

/** Kept clear for cleanup after the deadline; never spent on model calls. */
export const REQUEST_CLEANUP_RESERVE_MS = 5_000

/**
 * Below this there is no point starting an expensive call: it cannot finish,
 * and starting it only guarantees an abort and a wasted request.
 */
export const MIN_PHASE_BUDGET_MS = 2_000


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
async function ocrPdf(buffer: Buffer, budgetMs: number): Promise<string> {
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

  /*
   * Bounded by the route's own deadline rather than by the platform's.
   * Unbounded, a slow Vision call runs until Vercel kills the function, which
   * skips `release()` and leaves the venue locked out for the stale window.
   */
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), budgetMs)
  try {
    const response = await openai.chat.completions.create(
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content }],
        max_tokens: 16384,
      },
      // One retry policy, and it is the caller's. The SDK retries twice by
      // default, which would multiply this call's cost and its wall time
      // against a deadline computed without it.
      { signal: controller.signal, maxRetries: 0 },
    )
    return response.choices[0].message.content?.trim() ?? ''
  } finally {
    clearTimeout(timer)
  }
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
  /** One absolute deadline, shared by rendering, Vision and embeddings. */
  const requestDeadline = Date.now() + REQUEST_WORK_BUDGET_MS
  /** What is safely left for an expensive phase, cleanup already set aside. */
  const remainingBudgetMs = () =>
    requestDeadline - Date.now() - REQUEST_CLEANUP_RESERVE_MS

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

  /*
   * Indexing admission, before anything expensive. Cheap to refuse, and it
   * keeps a venue from spending its own OCR and embedding budget in a loop.
   */
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

  /*
   * Take the upload lease here — before the body is buffered, before extraction,
   * before OCR — and not after the text is in hand.
   *
   * Created later, there was a window minutes wide in which no record of the
   * upload existed: the owner could delete their menu while OCR was still
   * running, the delete would succeed because it saw no indexing job, and the
   * upload would then finish and activate — putting back the menu they had just
   * removed. The lease is what makes DELETE answer 409 for the whole time an
   * upload is in flight.
   *
   * Authorization is already done: this is only reached for a verified owner of
   * an existing venue, so no lease is ever taken on someone else's behalf.
   */
  const { data: documentId, error: beginError } = await supabaseAdmin.rpc('begin_menu_indexing', {
    p_business_id: business_id,
  })
  if (beginError || typeof documentId !== 'string') {
    const busy = /menu_processing/.test(beginError?.message ?? '')
    console.error('[menu-index] lease failed:', beginError?.message ?? 'no document id')
    return NextResponse.json(
      {
        error: busy ? MENU_INDEX_BUSY_MESSAGE : MENU_INDEX_FAILED_MESSAGE,
        code: busy ? 'menu_processing' : 'index_begin_failed',
      },
      { status: busy ? 409 : 500 },
    )
  }

  /*
   * Every exit from here on goes through `release`, which retires the lease
   * before answering. Scattering the cleanup across a dozen branches is how one
   * of them gets forgotten and a venue is locked out for the stale window over
   * a bad PDF header.
   */
  const release = async (response: NextResponse): Promise<NextResponse> => {
    const { error } = await supabaseAdmin.rpc('fail_menu_document', {
      p_document_id: documentId,
      p_business_id: business_id,
    })
    if (error) console.error('[menu-index] could not retire the lease:', error.message)
    return response
  }

  // A malformed multipart body threw straight out of the handler, so a truncated
  // upload came back as a 500 with a stack trace instead of "try again".
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return release(
      NextResponse.json(
        { error: 'Could not read the upload. Please choose the file again.' },
        { status: 400 },
      ),
    )
  }

  const file = formData.get('file')
  const forceOcr = formData.get('force_ocr') === '1' || formData.get('force_ocr') === 'true'

  if (!(file instanceof Blob))
    return release(NextResponse.json({ error: 'file required' }, { status: 400 }))

  if (file.size > MENU_PDF_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1)
    return release(NextResponse.json(
      {
        error: `That PDF is ${mb} MB — the limit is ${MENU_PDF_MAX_MB} MB. Export it at a lower resolution, or upload the food and drink menus separately.`,
      },
      { status: 413 },
    ))
  }
  if (file.size === 0) {
    return release(NextResponse.json({ error: 'That file is empty.' }, { status: 400 }))
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  /*
   * Trust the bytes, not the name or the browser's guess at a MIME type. A .docx
   * renamed to .pdf used to get all the way through parsing and Vision before
   * failing with something unhelpful about rendering.
   */
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return release(NextResponse.json(
      { error: 'That does not look like a PDF. Export the menu as a PDF and try again.' },
      { status: 415 },
    ))
  }

  /*
   * Retain the original before a single byte of it is interpreted.
   *
   * Deliberately after every cheap rejection — ownership, size, and the %PDF-
   * signature — so Storage is never called for a file we already know we will
   * refuse. And deliberately before extraction, because the point of keeping
   * the original is that it survives whatever the pipeline makes of it: a
   * version that fails at OCR still has the file its owner uploaded, which is
   * exactly the case where someone will want to look at it.
   *
   * The bytes go up exactly as received. Re-rendering or normalising them would
   * make the retained file evidence of our edit rather than of their upload,
   * and the digest beside it would attest to the wrong thing.
   */
  const retained = await retainOriginalPdf(supabaseAdmin, buffer, business_id, documentId)
  if (!retained.ok) {
    return release(NextResponse.json(
      { error: MENU_RETENTION_FAILED_MESSAGE, code: 'original_upload_failed' },
      { status: 502 },
    ))
  }

  const { error: attachError } = await supabaseAdmin.rpc('attach_menu_document_original', {
    p_document_id: documentId,
    p_business_id: business_id,
    p_storage_path: retained.path,
    p_filename: safeOriginalFilename((file as File).name),
    p_mime_type: MENU_PDF_MIME_TYPE,
    p_size_bytes: retained.size,
    p_sha256: retained.sha256,
  })
  if (attachError) {
    /*
     * The object exists but nothing points at it, so it is unreachable and
     * would sit in the bucket forever. This is the one case where deleting is
     * right — the file was written by this request, moments ago, and was never
     * recorded. An original that *was* attached is never removed, not even when
     * its document later fails.
     */
    console.error('[menu-retention] attach failed:', attachError.message)
    await removeOrphanedOriginal(supabaseAdmin, retained.path)
    return release(NextResponse.json(
      { error: MENU_RETENTION_FAILED_MESSAGE, code: 'original_attach_failed' },
      { status: 500 },
    ))
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
      return release(NextResponse.json({ error: INVALID_PDF_MESSAGE }, { status: 422 }))
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
      return release(NextResponse.json(
        {
          error: ocrCoverageMessage(coverage),
          code: coverage.reason,
          totalPages: coverage.reason === 'ocr_page_limit' ? coverage.totalPages : null,
          maxOcrPages: MENU_OCR_MAX_PAGES,
        },
        { status: 422 },
      ))
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
        return release(NextResponse.json(
          {
            error: OCR_UNAVAILABLE_MESSAGE,
            code: 'ocr_unavailable',
            maxOcrPages: MENU_OCR_MAX_PAGES,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(ocrBudget.retryAfterSec ?? 600) },
          },
        ))
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
      const ocrBudgetMs = remainingBudgetMs()
      if (ocrBudgetMs < MIN_PHASE_BUDGET_MS) {
        return release(NextResponse.json(
          { error: MENU_INDEX_FAILED_MESSAGE, code: 'request_timeout' },
          { status: 504 },
        ))
      }
      const ocrText = await ocrPdf(buffer, ocrBudgetMs)
      const trimmed = ocrText.trim()
      if (trimmed) {
        text = trimmed
        usedOcr = true
      } else if (!textBeforeOcr) {
        text = ''
      } else if (parsedPdfLikelyIncomplete(textBeforeOcr, pageCount)) {
        return release(NextResponse.json(
          {
            error:
              'Vision OCR returned no text for this PDF. Try exporting the menu as images or a different PDF.',
          },
          { status: 422 },
        ))
      }
    } catch (err) {
      // Our own deadline, not a fault in the file — say so, and never leak the
      // library's text to the owner.
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'APIUserAbortError')) {
        console.error('[pdf] OCR aborted at the request deadline')
        return release(NextResponse.json(
          { error: MENU_INDEX_FAILED_MESSAGE, code: 'request_timeout' },
          { status: 504 },
        ))
      }
      const msg = pdfReadErrorMessage(err)
      console.error('[pdf] OCR error:', err instanceof Error ? err.message : err)
      if (isInvalidPdfError(err)) {
        return release(NextResponse.json({ error: INVALID_PDF_MESSAGE }, { status: 422 }))
      }
      if (!textBeforeOcr) {
        return release(NextResponse.json({ error: msg }, { status: 422 }))
      }
      if (parsedPdfLikelyIncomplete(textBeforeOcr, pageCount)) {
        return release(NextResponse.json({ error: msg }, { status: 422 }))
      }
      console.warn('[pdf] Keeping text-layer extraction after OCR failure (parse looked complete)')
      text = textBeforeOcr
    }
  }

  if (!text) {
    return release(NextResponse.json(
      { error: 'No text found in this PDF even after OCR.' },
      { status: 422 },
    ))
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
    return release(NextResponse.json(
      { error: 'No text found in this PDF even after OCR.' },
      { status: 422 },
    ))
  }

  let chunks
  try {
    chunks = chunkMenuText(menuText, { source: usedOcr ? 'pdf_ocr' : 'pdf_text' })
  } catch (err) {
    console.error('[menu-index] chunking failed:', err instanceof Error ? err.message : err)
    return release(NextResponse.json(
      { error: MENU_INDEX_FAILED_MESSAGE, code: 'chunking_failed' },
      { status: 422 },
    ))
  }

  if (chunks.length === 0 || !chunksCoverSource(menuText, chunks)) {
    // A chunker that silently drops a page is the failure this design exists to
    // avoid; cheap to prove it did not, and fatal if it did.
    console.error('[menu-index] chunk coverage check failed for', business_id)
    return release(NextResponse.json(
      { error: MENU_INDEX_FAILED_MESSAGE, code: 'chunking_failed' },
      { status: 422 },
    ))
  }

  // Before embeddings, before any document row: an oversized menu costs nothing.
  if (chunks.length > MENU_MAX_CHUNKS_SYNC) {
    return release(NextResponse.json(
      {
        error: MENU_TOO_LARGE_MESSAGE,
        code: 'menu_too_large',
      },
      { status: 422 },
    ))
  }

  const { error: prepareError } = await supabaseAdmin.rpc('prepare_menu_document', {
    p_document_id: documentId,
    p_business_id: business_id,
    p_source: usedOcr ? 'pdf_ocr' : 'pdf_text',
    // Characters, as PostgreSQL counts them. String.length would report 9 for
    // the pizza line "🍕22 🍕16" that PostgreSQL calls 7, and activation's
    // length check would reject a perfectly good menu.
    p_char_count: menuCharacterCount(menuText),
  })
  if (prepareError) {
    /*
     * Ignoring this bought embeddings for a document that activation was
     * always going to refuse — the venue paid for a model call whose result
     * could never be published.
     */
    console.error('[menu-index] prepare failed:', prepareError.message)
    return release(NextResponse.json(
      { error: MENU_INDEX_FAILED_MESSAGE, code: 'prepare_failed' },
      { status: 500 },
    ))
  }

  /*
   * Whatever is left of the shared deadline, capped by the embedding phase's
   * own ceiling. The 70 seconds is a maximum, not a fresh allowance handed out
   * regardless of how long OCR already took.
   */
  const embeddingBudgetMs = Math.min(MENU_EMBEDDING_TOTAL_BUDGET_MS, remainingBudgetMs())
  if (embeddingBudgetMs < MIN_PHASE_BUDGET_MS) {
    return release(NextResponse.json(
      { error: MENU_INDEX_FAILED_MESSAGE, code: 'request_timeout' },
      { status: 504 },
    ))
  }

  const embedded = await embedMenuChunks(openai, chunks, { totalBudgetMs: embeddingBudgetMs })
  if (!embedded.ok) {
    return release(NextResponse.json(
      { error: MENU_INDEX_FAILED_MESSAGE, code: `embedding_${embedded.reason}` },
      { status: embedded.reason === 'timeout' ? 504 : 502 },
    ))
  }

  const rows = buildChunkRows(chunks, embedded.embeddings, business_id, documentId)
  for (let i = 0; i < rows.length; i += MENU_CHUNK_INSERT_BATCH) {
    const { error } = await supabaseAdmin
      .from('menu_chunks')
      .insert(rows.slice(i, i + MENU_CHUNK_INSERT_BATCH))
    if (error) {
      console.error('[menu-index] chunk insert failed:', error.message)
      return release(NextResponse.json(
        { error: MENU_INDEX_FAILED_MESSAGE, code: 'chunk_insert_failed' },
        { status: 500 },
      ))
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
    return release(NextResponse.json(
      { error: MENU_INDEX_FAILED_MESSAGE, code: 'activation_failed' },
      { status: 500 },
    ))
  }

  return NextResponse.json({
    text: menuText,
    pages,
    usedOcr,
    // Present only when OCR ran, and equal to `pages` by construction: the
    // coverage gate above refuses anything it cannot read end to end.
    ...(usedOcr ? { ocrPages: ocrPageCount } : {}),
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
