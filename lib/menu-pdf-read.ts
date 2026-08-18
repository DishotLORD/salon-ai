/**
 * Read a menu PDF on the server without depending on browser globals.
 *
 * pdf.js assumes a browser geometry stack. On Node it tries to load
 * `@napi-rs/canvas` via `createRequire(import.meta.url)` and copy DOMMatrix /
 * ImageData / Path2D onto globalThis. Under Next on Vercel that require
 * resolves against a bundled chunk URL and fails, so the next line in pdf.js —
 * `new DOMMatrix()` — throws "DOMMatrix is not defined" before any page is
 * rendered. Installing the native constructors from *our* dependency first
 * (listed in serverExternalPackages) removes that browser-only dependency.
 */

import path from 'path'
import { pathToFileURL } from 'url'

import { MENU_OCR_MAX_PAGES } from '@/lib/menu-ocr-coverage'

import {
  DOMMatrix as NapiDOMMatrix,
  ImageData as NapiImageData,
  Path2D as NapiPath2D,
} from '@napi-rs/canvas'

export const INVALID_PDF_MESSAGE =
  'That PDF could not be read. Export it again from your design tool and try once more.'

const DOMMATRIX_HINT = /DOMMatrix is not defined/i

let polyfillsEnsured = false

/** Install Node canvas globals before any pdf.js import. Idempotent. */
export function ensureNodePdfPolyfills(): void {
  if (polyfillsEnsured) return
  polyfillsEnsured = true

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any
  if (typeof g.DOMMatrix !== 'function') g.DOMMatrix = NapiDOMMatrix
  if (typeof g.ImageData !== 'function') g.ImageData = NapiImageData
  if (typeof g.Path2D !== 'function') g.Path2D = NapiPath2D
}

type PdfJsDocument = {
  numPages: number
  canvasFactory: {
    create: (w: number, h: number) => {
      canvas: { toBuffer: (mime: string) => Buffer }
      context: unknown
    }
  }
  getPage: (n: number) => Promise<{
    getViewport: (opts: { scale: number }) => { width: number; height: number }
    getTextContent: () => Promise<{ items: Array<{ str?: string }> }>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render: (opts: { canvasContext: unknown; viewport: unknown }) => { promise: Promise<void> }
    cleanup: () => void
  }>
  destroy: () => Promise<void>
}

async function loadPdfJs() {
  ensureNodePdfPolyfills()
  return import('pdfjs-dist/legacy/build/pdf.mjs')
}

function pdfDistPaths() {
  const pdfDist = path.join(process.cwd(), 'node_modules', 'pdfjs-dist')
  const dirUrl = (sub: string) => pathToFileURL(path.join(pdfDist, sub) + path.sep).href
  return {
    workerSrc: pathToFileURL(path.join(pdfDist, 'legacy', 'build', 'pdf.worker.mjs')).href,
    cMapUrl: dirUrl('cmaps'),
    standardFontDataUrl: dirUrl('standard_fonts'),
    wasmUrl: dirUrl('wasm'),
  }
}

async function openPdfDocument(buffer: Buffer): Promise<PdfJsDocument> {
  const pdfjsLib = await loadPdfJs()
  const paths = pdfDistPaths()
  pdfjsLib.GlobalWorkerOptions.workerSrc = paths.workerSrc

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getDocument = (pdfjsLib as any).getDocument as (p: Record<string, unknown>) => {
    promise: Promise<PdfJsDocument>
  }

  return getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: paths.cMapUrl,
    cMapPacked: true,
    standardFontDataUrl: paths.standardFontDataUrl,
    wasmUrl: paths.wasmUrl,
  }).promise
}

/** True when pdf.js rejected the bytes as a broken PDF. */
export function isInvalidPdfError(err: unknown): boolean {
  if (!err) return false
  const name = typeof err === 'object' && err && 'name' in err ? String((err as { name?: string }).name) : ''
  const message = err instanceof Error ? err.message : String(err)
  if (DOMMATRIX_HINT.test(message)) return false
  if (name === 'InvalidPDFException' || name === 'PasswordException') return true
  return /invalid pdf|invalid root|bad xref|invalid pdf structure|missing pdf header|xref entry/i.test(
    message,
  )
}

export function pdfReadErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (DOMMATRIX_HINT.test(message)) {
    // Should be unreachable after ensureNodePdfPolyfills; never leak the browser
    // global name to the owner.
    return 'Could not render this PDF on the server. Please try again, or paste the menu text into Settings → Menu.'
  }
  if (isInvalidPdfError(err)) return INVALID_PDF_MESSAGE
  return `Could not read this PDF. ${message}`
}

/**
 * Extract the text layer. Empty string means a scanned/image-only PDF — the
 * caller should fall through to vision OCR, same as before.
 */
export async function extractPdfTextLayer(
  buffer: Buffer,
): Promise<{ text: string; pages: number }> {
  const doc = await openPdfDocument(buffer)
  try {
    const parts: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const line = content.items
        .map((item) => (typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean)
        .join(' ')
        .trim()
      if (line) parts.push(line)
      page.cleanup()
    }
    return { text: parts.join('\n').trim(), pages: doc.numPages }
  } finally {
    await doc.destroy().catch(() => {
      /* ignore */
    })
  }
}

/**
 * How many pages the document has, without reading any of them.
 *
 * `extractPdfTextLayer` already reports this, but it reports it on success, and
 * the caller needs the count precisely when extraction has failed — that is the
 * path where a document of unknown length used to be handed to OCR and assumed
 * short. Same `openPdfDocument`, so the pdf.js polyfill setup is not duplicated.
 */
export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const doc = await openPdfDocument(buffer)
  try {
    return doc.numPages
  } finally {
    await doc.destroy().catch(() => {
      /* ignore */
    })
  }
}

/** Render pages to PNG base64 for GPT-4o Vision OCR. */
export async function renderPdfPagesToPngBase64(
  buffer: Buffer,
  opts: { maxPages?: number; scale?: number } = {},
): Promise<string[]> {
  const maxPages = opts.maxPages ?? MENU_OCR_MAX_PAGES
  const scale = opts.scale ?? 2.5
  const doc = await openPdfDocument(buffer)
  try {
    const pageCount = Math.min(doc.numPages, maxPages)
    const pageImages: string[] = []
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale })
      const w = Math.ceil(viewport.width)
      const h = Math.ceil(viewport.height)
      const { canvas, context } = doc.canvasFactory.create(w, h)
      await page.render({ canvasContext: context, viewport }).promise
      pageImages.push(canvas.toBuffer('image/png').toString('base64'))
      page.cleanup()
    }
    return pageImages
  } finally {
    await doc.destroy().catch(() => {
      /* ignore */
    })
  }
}
