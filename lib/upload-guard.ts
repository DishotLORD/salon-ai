/**
 * Cheap checks that run before an upload's body is read.
 *
 * `request.formData()` buffers the whole multipart body. The menu-PDF route
 * called it first and authorized afterwards, so an anonymous request could make
 * the server hold a full upload in memory before being told 403. The expensive
 * part — OCR through GPT-4o Vision — was always behind the authorization check,
 * so this was bandwidth and memory rather than money; it was still work done for
 * someone with no business asking for it.
 *
 * Authentication needs no body at all. Authorization needs to know which venue,
 * which is why that id travels in the query string: it is a tenant identifier,
 * already public in every widget embed URL, and putting it there is what lets
 * both checks finish before a byte of the upload is read.
 *
 * Import-free so it can be unit-tested directly.
 */

/**
 * Room for multipart framing: boundaries, per-part headers, filename. Real
 * overhead is a few hundred bytes; a megabyte of slack means a legitimate upload
 * at exactly the limit is never turned away by this pre-check, while a body
 * wildly over it still dies early. The precise limit is enforced afterwards
 * against the parsed file's own size.
 */
export const MULTIPART_OVERHEAD_ALLOWANCE_BYTES = 1024 * 1024

/**
 * True when the declared body size cannot possibly hold a file within the limit.
 *
 * Advisory only: Content-Length is the client's claim and a chunked upload has
 * none. A missing or unparseable header means "cannot tell" — never "reject".
 */
export function declaredBodyTooLarge(
  contentLength: string | number | null | undefined,
  maxFileBytes: number,
  overheadAllowance = MULTIPART_OVERHEAD_ALLOWANCE_BYTES,
): boolean {
  if (contentLength == null || contentLength === '') return false
  const declared = typeof contentLength === 'number' ? contentLength : Number(contentLength)
  if (!Number.isFinite(declared) || declared < 0) return false
  return declared > maxFileBytes + overheadAllowance
}

/**
 * The venue this upload is for, from the request URL.
 *
 * Returns null rather than throwing on a malformed URL — the caller answers 400,
 * which is the same thing it would say for a missing id.
 */
export function businessIdFromUrl(url: string): string | null {
  try {
    const value = new URL(url).searchParams.get('business_id')?.trim()
    return value ? value : null
  } catch {
    return null
  }
}
