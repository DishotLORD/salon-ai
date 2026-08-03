import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  extractPdfTextLayer,
  INVALID_PDF_MESSAGE,
  isInvalidPdfError,
  pdfReadErrorMessage,
  renderPdfPagesToPngBase64,
  ensureNodePdfPolyfills,
} from '../lib/menu-pdf-read.ts'

/**
 * A one-page PDF with a real catalog / pages tree / content stream. The smoke
 * probe that surfaced DOMMatrix used `%PDF-` plus an empty trailer — that is
 * not a valid file. This one is.
 */
function buildMinimalValidPdf(text = 'Soup $12'): Buffer {
  const objs: string[] = []
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
  objs[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`
  objs[4] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (let n = 1; n <= 5; n++) {
    offsets[n] = Buffer.byteLength(body, 'latin1')
    body += `${n} 0 obj\n${objs[n]}\nendobj\n`
  }
  const xrefPos = Buffer.byteLength(body, 'latin1')
  let xref = 'xref\n0 6\n0000000000 65535 f \n'
  for (let n = 1; n <= 5; n++) {
    xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  }
  body += xref
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

/** The production smoke bytes that returned DOMMatrix before the polyfill. */
const SMOKE_INVALID_PDF = Buffer.from('%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

describe('the reported bug: menu PDF upload crashed on DOMMatrix', () => {
  it('installs Node canvas globals before pdf.js can ask for them', () => {
    ensureNodePdfPolyfills()
    assert.equal(typeof globalThis.DOMMatrix, 'function')
    assert.equal(typeof globalThis.ImageData, 'function')
    assert.equal(typeof globalThis.Path2D, 'function')
  })

  it('reads a minimal valid PDF without throwing DOMMatrix', async () => {
    const pdf = buildMinimalValidPdf('Soup $12')
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-')

    const result = await extractPdfTextLayer(pdf)
    assert.equal(result.pages, 1)
    assert.match(result.text, /Soup\s*\$12/)
  })

  it('renders that same PDF to PNG for the OCR path without DOMMatrix', async () => {
    const pdf = buildMinimalValidPdf('Steak $48')
    const images = await renderPdfPagesToPngBase64(pdf, { maxPages: 1, scale: 1 })
    assert.equal(images.length, 1)
    assert.ok(images[0]!.length > 100)
    // PNG magic in base64 starts with iVBOR…
    assert.match(images[0]!, /^iVBOR/)
  })

  it('never surfaces "DOMMatrix is not defined" as the owner-facing message', () => {
    const msg = pdfReadErrorMessage(new Error('DOMMatrix is not defined'))
    assert.equal(/DOMMatrix/i.test(msg), false)
    assert.match(msg, /Could not render|paste the menu/i)
  })
})

describe('truly invalid PDFs get a clean validation error', () => {
  it('rejects the smoke-test placeholder that only looked like a PDF', async () => {
    await assert.rejects(
      () => extractPdfTextLayer(SMOKE_INVALID_PDF),
      (err: unknown) => {
        assert.equal(isInvalidPdfError(err), true)
        assert.equal(pdfReadErrorMessage(err), INVALID_PDF_MESSAGE)
        assert.equal(/DOMMatrix/i.test(pdfReadErrorMessage(err)), false)
        return true
      },
    )
  })

  it('does not treat a missing canvas polyfill message as an invalid file', () => {
    assert.equal(isInvalidPdfError(new Error('DOMMatrix is not defined')), false)
  })
})
