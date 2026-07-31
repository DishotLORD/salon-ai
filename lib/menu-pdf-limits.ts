/**
 * How large a menu PDF may be, shared by the upload route and the settings form
 * so the two cannot disagree — a client that lets a file through only for the
 * server to reject it wastes a minute of someone's upload.
 *
 * Two reasons there is a cap at all. The route reads the whole file into memory
 * before looking at it, so a large one can kill the function with an opaque
 * error. And the hosting platform rejects an oversized request body *before* our
 * code runs, which surfaces as an unreadable multipart body — the least helpful
 * error possible.
 *
 * 4 MB is deliberately conservative: comfortably under any serverless body
 * limit, and still room for a two-page scanned menu. Raise it with
 * NEXT_PUBLIC_MENU_PDF_MAX_MB if the deployment target allows more — check the
 * platform's own request-body limit first, because a value above it just moves
 * the failure back out of our hands. NEXT_PUBLIC_ so the dashboard bundle and
 * the server read the same number.
 */
const DEFAULT_MAX_MB = 4

export const MENU_PDF_MAX_MB = (() => {
  const configured = Number(process.env.NEXT_PUBLIC_MENU_PDF_MAX_MB)
  return Number.isFinite(configured) && configured > 0 && configured <= 100
    ? configured
    : DEFAULT_MAX_MB
})()

export const MENU_PDF_MAX_BYTES = MENU_PDF_MAX_MB * 1024 * 1024
