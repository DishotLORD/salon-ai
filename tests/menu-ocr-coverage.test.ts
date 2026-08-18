import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  MENU_OCR_MAX_PAGES,
  OCR_UNAVAILABLE_MESSAGE,
  decideOcrCoverage,
  ocrCoverageMessage,
} from '../lib/menu-ocr-coverage.ts'

const ROUTE = readFileSync(
  new URL('../app/api/menu/pdf/route.ts', import.meta.url),
  'utf8',
)
const READER = readFileSync(
  new URL('../lib/menu-pdf-read.ts', import.meta.url),
  'utf8',
)

/**
 * OCR rendered up to its page ceiling on a document of any length, and whatever
 * came back replaced the extracted text and was written to
 * `businesses.menu_pdf_text` behind an HTTP 200. A 60-page scan became a
 * 10-page menu with no error, no warning and no way for the owner to tell —
 * and the concierge then answered questions about a menu it had seen the front
 * of. These tests pin the invariant that replaced it: OCR either covers the
 * whole document or nothing is saved.
 */

describe('coverage is decided from the page count alone', () => {
  it('a document inside the ceiling is fully covered', () => {
    assert.deepEqual(decideOcrCoverage(1), { ok: true, ocrPages: 1 })
    assert.deepEqual(decideOcrCoverage(8), { ok: true, ocrPages: 8 })
  })

  it('the boundary: the ceiling itself is allowed', () => {
    assert.deepEqual(decideOcrCoverage(MENU_OCR_MAX_PAGES), {
      ok: true,
      ocrPages: MENU_OCR_MAX_PAGES,
    })
    assert.deepEqual(decideOcrCoverage(10), { ok: true, ocrPages: 10 })
  })

  it('the boundary: one page past the ceiling is refused', () => {
    // 10 allowed / 11 rejected is the whole contract; anything vaguer here and
    // the off-by-one comes back as a silently truncated menu.
    assert.deepEqual(decideOcrCoverage(MENU_OCR_MAX_PAGES + 1), {
      ok: false,
      reason: 'ocr_page_limit',
      totalPages: 11,
    })
  })

  it('a long document is refused rather than partly read', () => {
    assert.deepEqual(decideOcrCoverage(60), {
      ok: false,
      reason: 'ocr_page_limit',
      totalPages: 60,
    })
    assert.deepEqual(decideOcrCoverage(100), {
      ok: false,
      reason: 'ocr_page_limit',
      totalPages: 100,
    })
  })

  it('an unknown page count is refused, never assumed short', () => {
    // The assumption "probably fits" is exactly what produced a ten-page menu
    // from a sixty-page file.
    for (const raw of [null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2.5]) {
      assert.deepEqual(
        decideOcrCoverage(raw as number | null | undefined),
        { ok: false, reason: 'ocr_unknown_page_count' },
        String(raw),
      )
    }
  })

  it('the ceiling is one named constant, not a literal', () => {
    assert.equal(MENU_OCR_MAX_PAGES, 10)
    // Raising it would move the cliff, not remove it.
    assert.ok(Number.isInteger(MENU_OCR_MAX_PAGES) && MENU_OCR_MAX_PAGES > 0)
  })

  it('a caller may pass its own ceiling, and the boundary moves with it', () => {
    assert.deepEqual(decideOcrCoverage(4, 4), { ok: true, ocrPages: 4 })
    assert.deepEqual(decideOcrCoverage(5, 4), {
      ok: false,
      reason: 'ocr_page_limit',
      totalPages: 5,
    })
  })
})

describe('the refusal tells the owner what actually happened', () => {
  const refusal = decideOcrCoverage(60)
  const message = ocrCoverageMessage(refusal)

  it('names the document length and the coverage limit', () => {
    assert.match(message, /60 pages/)
    assert.match(message, new RegExp(`${MENU_OCR_MAX_PAGES} pages`))
  })

  it('says plainly that nothing was saved and the old menu stands', () => {
    // The owner's first question is whether they have just destroyed their menu.
    assert.match(message, /[Nn]othing was saved/)
    assert.match(message, /menu is unchanged/)
  })

  it('does not call the file invalid, because it is not', () => {
    assert.doesNotMatch(message, /invalid|corrupt|broken|not a PDF/i)
  })

  it('offers the route that does work at any length', () => {
    assert.match(message, /text-searchable/)
  })

  it('never suggests splitting the menu across uploads', () => {
    /*
     * A venue has one `businesses.menu_pdf_text`, so a second upload replaces
     * the first. Advising someone to upload their food and drink menus
     * separately would talk them into deleting one with the other — advice that
     * destroys data is worse than no advice.
     */
    for (const text of [
      message,
      ocrCoverageMessage(decideOcrCoverage(null)),
      OCR_UNAVAILABLE_MESSAGE,
    ]) {
      assert.doesNotMatch(text, /separate|separately|split|two documents|shorter documents/i)
    }
  })

  it('the unavailable-OCR message states the cause, the loss and the way out', () => {
    assert.match(OCR_UNAVAILABLE_MESSAGE, /image reading/)
    assert.match(OCR_UNAVAILABLE_MESSAGE, /[Nn]othing was saved/)
    assert.match(OCR_UNAVAILABLE_MESSAGE, /menu is unchanged/)
    assert.match(OCR_UNAVAILABLE_MESSAGE, /text-searchable|Settings/)
    assert.doesNotMatch(OCR_UNAVAILABLE_MESSAGE, /invalid|corrupt/i)
  })

  it('the unknown-count refusal says the same three things', () => {
    const unknown = ocrCoverageMessage(decideOcrCoverage(null))
    assert.match(unknown, /[Nn]othing was saved/)
    assert.match(unknown, /menu is unchanged/)
    assert.doesNotMatch(unknown, /invalid|corrupt/i)
  })

  it('a successful decision has no message to give', () => {
    assert.equal(ocrCoverageMessage(decideOcrCoverage(5)), '')
  })
})

describe('the route cannot reach the write with partial OCR', () => {
  const at = (pattern: RegExp) => ROUTE.search(pattern)

  const shouldOcr = at(/const shouldOcr =/)
  const coverageGate = at(/const coverage = decideOcrCoverage\(totalPages\)/)
  const refusal = at(/code: coverage\.reason/)
  const ocrBudget = at(/checkRateLimit\(`menu-ocr:/)
  const ocrCall = at(/await ocrPdf\(buffer\)/)
  const dbUpdate = at(/\.update\(\{ menu_pdf_text: text \}\)/)

  it('every landmark is present', () => {
    for (const [name, i] of Object.entries({
      shouldOcr,
      coverageGate,
      refusal,
      ocrBudget,
      ocrCall,
      dbUpdate,
    })) {
      assert.ok(i >= 0, `${name} missing from the route`)
    }
  })

  it('coverage is decided before OCR runs', () => {
    assert.ok(coverageGate < ocrCall)
  })

  it('coverage is decided before the write', () => {
    // The only `menu_pdf_text` write in the route, and it sits downstream of
    // the gate — so a refused document cannot reach it.
    assert.ok(coverageGate < dbUpdate)
    const writes = ROUTE.match(/\.update\(\{ menu_pdf_text: text \}\)/g) ?? []
    assert.equal(writes.length, 1, 'exactly one write path to guard')
  })

  it('coverage is decided before the venue spends its OCR budget', () => {
    // An oversized document should not cost the venue a rate-limit slot or two
    // minutes of function time for work that must be discarded.
    assert.ok(coverageGate < ocrBudget)
  })

  it('the refusal returns 422 and returns, rather than falling through', () => {
    const block = ROUTE.slice(refusal - 400, refusal + 400)
    assert.match(block, /return NextResponse\.json\(/)
    assert.match(block, /status: 422/)
  })

  it('the gate only applies when OCR is actually needed', () => {
    // A long searchable PDF must never be refused: extraction reads every page,
    // so it never enters this branch at all.
    assert.ok(shouldOcr < coverageGate)
    assert.match(ROUTE, /if \(shouldOcr\) \{[\s\S]{0,1600}decideOcrCoverage\(totalPages\)/)
  })

  it('the render ceiling is the shared constant, not a literal 10', () => {
    assert.match(ROUTE, /maxPages: MENU_OCR_MAX_PAGES/)
    assert.doesNotMatch(ROUTE, /maxPages: 10/)
    assert.doesNotMatch(READER, /maxPages = opts\.maxPages \?\? 10/)
    assert.match(READER, /opts\.maxPages \?\? MENU_OCR_MAX_PAGES/)
  })

  it('an unresolved page count reaches the gate as null, not as a guess', () => {
    assert.match(ROUTE, /totalPages = await getPdfPageCount\(buffer\)/)
    assert.match(ROUTE, /totalPages = null/)
    // `pages || 1` is fine for the heuristic, but must not become a page count.
    assert.doesNotMatch(ROUTE, /decideOcrCoverage\(pageCount\)/)
  })

  it('the refusal carries machine-readable detail beside the human text', () => {
    const block = ROUTE.slice(refusal - 400, refusal + 400)
    assert.match(block, /error: ocrCoverageMessage\(coverage\)/)
    assert.match(block, /code: coverage\.reason/)
    assert.match(block, /maxOcrPages: MENU_OCR_MAX_PAGES/)
  })

  it('ocrPages is only reported when OCR actually ran', () => {
    assert.match(ROUTE, /\.\.\.\(usedOcr \? \{ ocrPages: ocrPageCount \} : \{\}\)/)
  })
})

describe('behaviour preserved for documents that already worked', () => {
  it('nothing truncates the extracted text', () => {
    // The fix must not become "save the first N characters instead".
    assert.doesNotMatch(ROUTE, /text\.slice\(|text\.substring\(|substr\(/)
  })

  it('the text layer still reads every page', () => {
    assert.match(READER, /for \(let i = 1; i <= doc\.numPages; i\+\+\)/)
  })

  it('page counting reuses the shared pdf.js setup', () => {
    assert.match(READER, /export async function getPdfPageCount/)
    const opens = READER.match(/await openPdfDocument\(buffer\)/g) ?? []
    assert.equal(opens.length, 3, 'text layer, page count, render — one helper each')
    assert.doesNotMatch(READER, /getDocument\([\s\S]{0,80}getPdfPageCount/)
  })

  it('the OCR budget, invalid-PDF and size paths are untouched', () => {
    assert.match(ROUTE, /checkRateLimit\(`menu-ocr:\$\{business_id\}`, OCR_LIMIT_PER_HOUR, 3_600_000\)/)
    assert.match(ROUTE, /status: 429/)
    assert.match(ROUTE, /INVALID_PDF_MESSAGE/)
    assert.match(ROUTE, /MENU_PDF_MAX_BYTES/)
  })

  it('an exhausted budget refuses on an unusable text layer, never falls back to it', () => {
    /*
     * The fallback used to keep any non-empty text. `textLayerUnusable` is what
     * separates "we have a real menu and force_ocr was only a preference" from
     * "what we have is partial", and only the first may be handed back.
     */
    assert.match(ROUTE, /const textLayerUnusable = !text \|\| parseIncomplete\(\)/)
    assert.match(ROUTE, /const shouldOcr = textLayerUnusable \|\| forceOcr/)
    assert.match(ROUTE, /if \(textLayerUnusable\) \{[\s\S]{0,600}status: 429/)
    assert.match(ROUTE, /code: 'ocr_unavailable'/)
    // The old condition keyed on emptiness alone and let partial text through.
    assert.doesNotMatch(ROUTE, /if \(!text\) \{[\s\S]{0,400}status: 429/)
  })

  it('the 429 keeps its Retry-After', () => {
    assert.match(ROUTE, /'Retry-After': String\(ocrBudget\.retryAfterSec \?\? 600\)/)
  })

  it('the resolved page count replaces the one extraction failed to report', () => {
    // Otherwise a successful OCR could answer `pages: 0, ocrPages: 8`.
    assert.match(ROUTE, /pages = coverage\.ocrPages/)
  })

  it('authorization still precedes body buffering', () => {
    const auth = ROUTE.search(/const check = await verifyOwner\(business_id\)/)
    const buffered = ROUTE.search(/await request\.formData\(\)/)
    assert.ok(auth >= 0 && auth < buffered)
  })
})
