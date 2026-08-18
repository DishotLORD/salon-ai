import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  extractPdfTextLayer,
  INVALID_PDF_MESSAGE,
  isInvalidPdfError,
  pdfReadErrorMessage,
  RENDER_FAILED_MESSAGE,
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

/**
 * A menu designed in a layout tool is mostly clipped vector art, and that is the
 * path that broke.
 *
 * The app declared `@napi-rs/canvas` ^1.0.0 while pdfjs-dist 5.7 declares
 * ^0.1.100 as its own optional dependency, so npm installed both. The polyfill
 * installed `Path2D` from the 1.x copy, pdf.js drew on a context from the 0.1.x
 * copy, and every clip or fill that crossed that boundary threw
 * "Value is none of these types `String`, `Path`" out of CanvasGraphics —
 * before Vision was ever called. A real restaurant menu could not be uploaded
 * at all, and the owner was shown the library's own exception text.
 *
 * tests/fixtures/pdf-clip-path.pdf is synthetic — generated for this repository,
 * no content from any real menu — and reproduces the failure on 1.0.0 and 1.0.7
 * while passing on 0.1.100. If the versions ever diverge again, this fails.
 */
describe('a clip/path-heavy PDF renders for the OCR path', () => {
  const fixture = () =>
    readFileSync(new URL('./fixtures/pdf-clip-path.pdf', import.meta.url))

  it('is a real PDF, and a small one', () => {
    const pdf = fixture()
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-')
    assert.ok(pdf.length < 64 * 1024, `fixture is ${pdf.length} bytes; keep it small`)
  })

  it('renders at the production scale without throwing', async () => {
    const images = await renderPdfPagesToPngBase64(fixture(), { maxPages: 10, scale: 2.5 })
    assert.equal(images.length, 1, 'one page in, one image out')
    assert.ok(images[0]!.length > 1000)
  })

  it('produces a decodable PNG of non-trivial size', async () => {
    const images = await renderPdfPagesToPngBase64(fixture(), { maxPages: 1, scale: 2.5 })
    const png = Buffer.from(images[0]!, 'base64')
    // Signature rather than pixels: this proves a real image was encoded without
    // asserting anything that a renderer version bump would legitimately change.
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    assert.ok(width > 1000 && height > 1000, `got ${width}x${height}`)
    assert.ok(png.length > 10_000, `got ${png.length} bytes`)
  })

  it('scales with the requested factor', async () => {
    const [small] = await renderPdfPagesToPngBase64(fixture(), { maxPages: 1, scale: 1 })
    const [large] = await renderPdfPagesToPngBase64(fixture(), { maxPages: 1, scale: 2.5 })
    const w = (b64: string) => Buffer.from(b64, 'base64').readUInt32BE(16)
    assert.ok(w(large!) > w(small!))
  })
})

describe('render failures reach the owner without library internals', () => {
  /** The exact exception the version mismatch produced. */
  const NATIVE_RENDER_ERROR = new Error('Value is none of these types `String`, `Path`, ')

  it('is not mistaken for an invalid PDF — the file was fine', () => {
    assert.equal(isInvalidPdfError(NATIVE_RENDER_ERROR), false)
  })

  it('returns the sanitized render message', () => {
    assert.equal(pdfReadErrorMessage(NATIVE_RENDER_ERROR), RENDER_FAILED_MESSAGE)
  })

  it('leaks no implementation detail whatsoever', () => {
    const msg = pdfReadErrorMessage(NATIVE_RENDER_ERROR)
    for (const forbidden of [
      'String`, `Path',
      'Path2D',
      'CanvasGraphics',
      '@napi-rs/canvas',
      'napi',
      'pdf.js',
      'pdfjs',
      'consumePath',
      'DOMMatrix',
    ]) {
      assert.equal(msg.includes(forbidden), false, `message leaked ${forbidden}`)
    }
    assert.doesNotMatch(msg, /\bat .+:\d+:\d+/, 'message looks like a stack frame')
  })

  it('says nothing was saved, so the owner knows their menu survived', () => {
    assert.match(RENDER_FAILED_MESSAGE, /[Nn]othing was saved/)
    assert.match(RENDER_FAILED_MESSAGE, /menu is unchanged/)
    assert.doesNotMatch(RENDER_FAILED_MESSAGE, /invalid|corrupt|broken/i)
  })

  it('an arbitrary internal failure is sanitized the same way', () => {
    assert.equal(pdfReadErrorMessage(new Error('ENOENT: no such file or directory')), RENDER_FAILED_MESSAGE)
    assert.equal(pdfReadErrorMessage('some raw string thrown by a native binding'), RENDER_FAILED_MESSAGE)
  })

  it('invalid PDFs still get the invalid-PDF message, unchanged', () => {
    const invalid = new Error('Invalid PDF structure')
    assert.equal(isInvalidPdfError(invalid), true)
    assert.equal(pdfReadErrorMessage(invalid), INVALID_PDF_MESSAGE)
  })
})

describe('one canvas generation, shared with pdf.js', () => {
  it('the app and pdfjs-dist agree on @napi-rs/canvas', async () => {
    // The whole bug in one assertion: two generations meant Path2D objects
    // crossed a package boundary pdf.js could not accept.
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { dependencies: Record<string, string> }
    const declared = pkg.dependencies['@napi-rs/canvas']
    assert.equal(declared, '0.1.100', 'pin exactly; pdfjs-dist 5.7 declares ^0.1.100')
    assert.doesNotMatch(declared, /^\^?1\./, 'the 1.x line is incompatible with pdf.js 5.7')
  })
})
