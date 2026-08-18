/**
 * Whether vision OCR can cover a whole PDF, decided before any of it is read.
 *
 * OCR renders pages to PNGs and sends them to GPT-4o in one request, so it has
 * always had a page ceiling. What it did not have was a check that the ceiling
 * reached the end of the document: a 60-page scan was rendered as far as the
 * limit, whatever came back replaced the extracted text outright, and that went
 * into `businesses.menu_pdf_text` behind an HTTP 200. The owner was told the
 * menu had been read. Fifty pages of it had not been, and nothing anywhere said
 * so — the concierge then answered questions about a menu it had only seen the
 * front of, which is worse than having no menu at all, because both the owner
 * and the guest believe it is complete.
 *
 * So coverage is now a decision made up front, from the page count alone, and
 * the answer is either "all of it" or "none of it". Partial OCR is not a
 * degraded result to be saved with a caveat; it is a wrong menu.
 */

/**
 * How many pages one OCR pass may cover.
 *
 * Ten pages at 2.5× with `detail: 'high'` is already the most expensive request
 * this product makes and sits inside the route's 120-second budget. Raising it
 * would not make a 60-page menu work — it would move the cliff, and the cliff
 * is the bug. Reading long documents properly needs batching across several
 * requests, which is its own change; until then this number is honest about
 * what one pass can do.
 */
export const MENU_OCR_MAX_PAGES = 10

export type OcrCoverageDecision =
  /** Every page will be rendered; the OCR result stands for the whole document. */
  | { ok: true; ocrPages: number }
  /** More pages than one pass covers. Nothing is read and nothing is saved. */
  | { ok: false; reason: 'ocr_page_limit'; totalPages: number }
  /** The page count itself is unknown, so coverage cannot be claimed either way. */
  | { ok: false; reason: 'ocr_unknown_page_count' }

/**
 * Can OCR speak for this entire document?
 *
 * `totalPages` must be a real count. Missing, zero, fractional or negative all
 * mean the same thing here — we do not know how long the document is — and a
 * document of unknown length cannot be declared covered. Guessing "probably
 * short" is exactly the assumption that produced a ten-page menu from a sixty-
 * page file.
 */
export function decideOcrCoverage(
  totalPages: number | null | undefined,
  maxPages: number = MENU_OCR_MAX_PAGES,
): OcrCoverageDecision {
  if (
    typeof totalPages !== 'number' ||
    !Number.isFinite(totalPages) ||
    !Number.isInteger(totalPages) ||
    totalPages < 1
  ) {
    return { ok: false, reason: 'ocr_unknown_page_count' }
  }
  if (totalPages > maxPages) {
    return { ok: false, reason: 'ocr_page_limit', totalPages }
  }
  return { ok: true, ocrPages: totalPages }
}

/**
 * What the owner is told when OCR would have been partial.
 *
 * Three things have to be in it: how long their document is, how much can be
 * read at once, and — the part that matters most — that nothing was saved. The
 * file is not broken and must not be described as if it were; it is longer than
 * this path can honestly handle today, and the previous menu is still in place.
 */
export function ocrCoverageMessage(decision: OcrCoverageDecision): string {
  if (decision.ok) return ''
  if (decision.reason === 'ocr_page_limit') {
    return (
      `This PDF has ${decision.totalPages} pages and needs image reading, but that currently ` +
      `covers up to ${MENU_OCR_MAX_PAGES} pages in one pass. Nothing was saved and your current ` +
      `menu is unchanged. Export the menu as a text-searchable PDF and upload it again — ` +
      `searchable PDFs are read in full however long they are.`
    )
  }
  return (
    'We could not work out how many pages this PDF has, so we could not confirm the whole menu ' +
    'would be read. Nothing was saved and your current menu is unchanged. Export the menu as a ' +
    'text-searchable PDF and upload it again.'
  )
}

/**
 * When OCR is needed but its hourly budget is spent.
 *
 * Deliberately does not suggest splitting the menu across uploads: a venue has
 * one `businesses.menu_pdf_text`, so a second upload replaces the first rather
 * than adding to it, and telling an owner otherwise would talk them into
 * deleting their own food menu with their drinks list.
 */
export const OCR_UNAVAILABLE_MESSAGE =
  'This menu needs image reading, and that has been used heavily in the last hour. Nothing was ' +
  'saved and your current menu is unchanged. Try again shortly, export the menu as a ' +
  'text-searchable PDF, or paste the menu text into Settings → Menu.'
