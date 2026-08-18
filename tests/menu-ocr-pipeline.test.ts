import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  MENU_OCR_MAX_PAGES,
  decideOcrCoverage,
  ocrCoverageMessage,
} from '../lib/menu-ocr-coverage.ts'

/**
 * The upload pipeline's guarded shape, exercised end to end.
 *
 * The real decision function is the one under test — `decideOcrCoverage` is
 * imported, not reimplemented — while the expensive edges (page counting, the
 * Vision call, the database write) are spies, so a sixty-page document can be
 * put through the pipeline without a PDF, an OpenAI key or a database. That the
 * route has exactly this shape (gate before OCR, gate before the single
 * `menu_pdf_text` write, 422 on refusal) is pinned separately by the source
 * inspection in tests/menu-ocr-coverage.test.ts.
 *
 * What every case below is really asking is one question: can a menu that was
 * only partly read end up in the database looking complete?
 */

type Doc = {
  /** What the text layer produced, '' when it produced nothing. */
  textLayer: string
  /** Pages the text layer reported; 0 when extraction threw. */
  reportedPages: number
  /** The true length, used by the page-count probe when extraction failed. */
  truePages: number | null
  /** Whether the extracted text is judged usable as-is. */
  textLayerComplete: boolean
  forceOcr?: boolean
  /** What Vision would return, if it were reached. */
  ocrText?: string
  ocrBudgetSpent?: boolean
  pageCountThrows?: boolean
}

type Outcome = {
  status: number
  code?: string
  savedText: string | null
  usedOcr: boolean
  ocrPages?: number
  pages?: number
  /** Spies. */
  ocrRan: boolean
  updateCalled: boolean
  budgetChecked: boolean
  message?: string
}

const EXISTING_MENU = 'PREVIOUS MENU — must survive every refusal'

/** Mirrors the route's ordering; the gate itself is the real function. */
function runUpload(doc: Doc): Outcome {
  const out: Outcome = {
    status: 200,
    savedText: null,
    usedOcr: false,
    ocrRan: false,
    updateCalled: false,
    budgetChecked: false,
  }
  const db = { menu_pdf_text: EXISTING_MENU }
  const update = (text: string) => {
    out.updateCalled = true
    db.menu_pdf_text = text
    out.savedText = text
  }

  let text = doc.textLayer
  const pages = doc.reportedPages
  const shouldOcr = !text || doc.forceOcr === true || !doc.textLayerComplete

  let ocrPageCount = 0
  if (shouldOcr) {
    let totalPages: number | null = pages > 0 ? pages : null
    if (totalPages === null) {
      totalPages = doc.pageCountThrows ? null : doc.truePages
    }

    const coverage = decideOcrCoverage(totalPages)
    if (!coverage.ok) {
      out.status = 422
      out.code = coverage.reason
      out.message = ocrCoverageMessage(coverage)
      assert.equal(db.menu_pdf_text, EXISTING_MENU, 'refusal must not touch the stored menu')
      return out
    }
    ocrPageCount = coverage.ocrPages

    out.budgetChecked = true
    if (doc.ocrBudgetSpent) {
      if (!text) {
        out.status = 429
        return out
      }
      // Budget spent but the text layer gave us something: keep it.
    } else {
      out.ocrRan = true
      const ocrText = (doc.ocrText ?? '').trim()
      if (ocrText) {
        text = ocrText
        out.usedOcr = true
      }
    }
  }

  if (!text) {
    out.status = 422
    return out
  }
  update(text)
  out.pages = pages
  if (out.usedOcr) out.ocrPages = ocrPageCount
  return out
}

// ─────────────────────────────────────────────────────────────────────────────

describe('A. a long searchable PDF keeps all of its text', () => {
  const r = runUpload({
    textLayer: 'FULL 100-PAGE MENU TEXT',
    reportedPages: 100,
    truePages: 100,
    textLayerComplete: true,
  })

  it('succeeds', () => assert.equal(r.status, 200))
  it('never reaches OCR, so the page ceiling never applies', () => {
    // The refusal must not fire on length alone — a 100-page searchable menu is
    // read in full and is exactly the case the ceiling must not touch.
    assert.equal(r.ocrRan, false)
    assert.equal(r.budgetChecked, false)
  })
  it('saves the whole extraction, untruncated', () => {
    assert.equal(r.updateCalled, true)
    assert.equal(r.savedText, 'FULL 100-PAGE MENU TEXT')
    assert.equal(r.usedOcr, false)
  })
})

describe('B. a 60-page image-only PDF is refused before any OCR', () => {
  const r = runUpload({
    textLayer: '',
    reportedPages: 60,
    truePages: 60,
    textLayerComplete: false,
    ocrText: 'PAGES 1-10 ONLY',
  })

  it('answers 422 with the machine-readable reason', () => {
    assert.equal(r.status, 422)
    assert.equal(r.code, 'ocr_page_limit')
  })
  it('does not run OCR at all', () => assert.equal(r.ocrRan, false))
  it('does not write to the database', () => assert.equal(r.updateCalled, false))
  it('leaves the previous menu exactly as it was', () => assert.equal(r.savedText, null))
  it('tells the owner the length, the limit and that nothing was saved', () => {
    assert.match(r.message ?? '', /60 pages/)
    assert.match(r.message ?? '', new RegExp(`${MENU_OCR_MAX_PAGES} pages`))
    assert.match(r.message ?? '', /[Nn]othing was saved/)
  })
})

describe('C. a 60-page incomplete text layer is not saved as if complete', () => {
  const r = runUpload({
    textLayer: 'HEADINGS ONLY, NO PRICES',
    reportedPages: 60,
    truePages: 60,
    textLayerComplete: false,
    ocrText: 'PAGES 1-10 ONLY',
  })

  it('refuses rather than persisting either half-answer', () => {
    assert.equal(r.status, 422)
    assert.equal(r.code, 'ocr_page_limit')
    assert.equal(r.updateCalled, false)
  })
  it('does not quietly fall back to the incomplete extraction', () => {
    // Saving the headings-only text would be the same defect wearing a
    // different hat: a menu that looks complete and is not.
    assert.equal(r.savedText, null)
  })
})

describe('D. force_ocr on a long document is refused, not partly honoured', () => {
  const r = runUpload({
    textLayer: 'A COMPLETE 60-PAGE TEXT LAYER',
    reportedPages: 60,
    truePages: 60,
    textLayerComplete: true,
    forceOcr: true,
    ocrText: 'PAGES 1-10 ONLY',
  })

  it('refuses', () => {
    assert.equal(r.status, 422)
    assert.equal(r.code, 'ocr_page_limit')
  })
  it('runs no OCR and writes nothing', () => {
    assert.equal(r.ocrRan, false)
    assert.equal(r.updateCalled, false)
  })
})

describe('E/F/G. the boundary is exactly ten pages', () => {
  const scanned = (n: number) =>
    runUpload({
      textLayer: '',
      reportedPages: n,
      truePages: n,
      textLayerComplete: false,
      ocrText: `OCR OF ALL ${n} PAGES`,
    })

  it('F. eight pages: OCR runs and covers the document', () => {
    const r = scanned(8)
    assert.equal(r.status, 200)
    assert.equal(r.ocrRan, true)
    assert.equal(r.usedOcr, true)
    assert.equal(r.ocrPages, 8)
    assert.equal(r.savedText, 'OCR OF ALL 8 PAGES')
  })

  it('E. ten pages: still fully covered, still saved', () => {
    const r = scanned(10)
    assert.equal(r.status, 200)
    assert.equal(r.ocrPages, MENU_OCR_MAX_PAGES)
    assert.equal(r.updateCalled, true)
  })

  it('G. eleven pages: refused', () => {
    const r = scanned(11)
    assert.equal(r.status, 422)
    assert.equal(r.code, 'ocr_page_limit')
    assert.equal(r.ocrRan, false)
    assert.equal(r.updateCalled, false)
  })

  it('reported coverage always equals the document length', () => {
    // `ocrPages` is a claim about what was read. It must never exceed the
    // document, and never fall short of it either.
    for (const n of [1, 5, 9, 10]) {
      const r = scanned(n)
      assert.equal(r.ocrPages, n, `${n} pages`)
    }
  })
})

describe('H. a page count the extractor never reported is resolved, not assumed', () => {
  const r = runUpload({
    textLayer: '',
    reportedPages: 0, // extraction threw
    truePages: 60, // the probe finds the real length
    textLayerComplete: false,
    ocrText: 'PAGES 1-10 ONLY',
  })

  it('refuses on the independently resolved length', () => {
    assert.equal(r.status, 422)
    assert.equal(r.code, 'ocr_page_limit')
  })
  it('writes nothing', () => assert.equal(r.updateCalled, false))

  it('a short document with an unreported count still succeeds', () => {
    const ok = runUpload({
      textLayer: '',
      reportedPages: 0,
      truePages: 6,
      textLayerComplete: false,
      ocrText: 'OCR OF ALL 6 PAGES',
    })
    assert.equal(ok.status, 200)
    assert.equal(ok.ocrPages, 6)
  })
})

describe('I. a page count that cannot be established fails safe', () => {
  const r = runUpload({
    textLayer: '',
    reportedPages: 0,
    truePages: null,
    textLayerComplete: false,
    pageCountThrows: true,
    ocrText: 'SOME PAGES',
  })

  it('refuses with the unknown-count reason', () => {
    assert.equal(r.status, 422)
    assert.equal(r.code, 'ocr_unknown_page_count')
  })
  it('runs no OCR and preserves the previous menu', () => {
    assert.equal(r.ocrRan, false)
    assert.equal(r.updateCalled, false)
    assert.equal(r.savedText, null)
  })
})

describe('J. the OCR budget path is unchanged', () => {
  it('a short scan with no budget and no text still 429s', () => {
    const r = runUpload({
      textLayer: '',
      reportedPages: 6,
      truePages: 6,
      textLayerComplete: false,
      ocrBudgetSpent: true,
    })
    assert.equal(r.status, 429)
    assert.equal(r.updateCalled, false)
  })

  it('a short document with a usable text layer keeps it when the budget is spent', () => {
    const r = runUpload({
      textLayer: 'USABLE TEXT LAYER',
      reportedPages: 6,
      truePages: 6,
      textLayerComplete: false,
      ocrBudgetSpent: true,
    })
    assert.equal(r.status, 200)
    assert.equal(r.savedText, 'USABLE TEXT LAYER')
    assert.equal(r.usedOcr, false)
  })

  it('a long document never reaches the budget check at all', () => {
    // Refusing first means an oversized upload costs the venue nothing.
    const r = runUpload({
      textLayer: '',
      reportedPages: 60,
      truePages: 60,
      textLayerComplete: false,
    })
    assert.equal(r.budgetChecked, false)
  })
})

describe('K. a document with nothing readable is still refused', () => {
  it('empty OCR on a short scan saves nothing', () => {
    const r = runUpload({
      textLayer: '',
      reportedPages: 4,
      truePages: 4,
      textLayerComplete: false,
      ocrText: '',
    })
    assert.equal(r.status, 422)
    assert.equal(r.updateCalled, false)
  })
})

describe('the invariant, stated once', () => {
  it('no input reaches the write without full coverage', () => {
    const lengths = [1, 5, 9, 10, 11, 12, 60, 100, 0]
    for (const n of lengths) {
      for (const complete of [true, false]) {
        for (const force of [true, false]) {
          const r = runUpload({
            textLayer: complete ? 'TEXT' : '',
            reportedPages: n,
            truePages: n > 0 ? n : null,
            textLayerComplete: complete,
            forceOcr: force,
            ocrText: 'OCR TEXT',
          })
          if (r.usedOcr) {
            assert.ok(
              (r.ocrPages ?? 0) <= MENU_OCR_MAX_PAGES,
              `OCR claimed ${r.ocrPages} pages for a ${n}-page document`,
            )
            assert.equal(r.ocrPages, n, `OCR coverage must equal the document (${n})`)
          }
          if (r.updateCalled && r.usedOcr) {
            assert.ok(n <= MENU_OCR_MAX_PAGES, `a ${n}-page document was saved from partial OCR`)
          }
        }
      }
    }
  })
})
