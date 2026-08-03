/**
 * Recognising the database refusing a second business for one owner.
 *
 * Onboarding guarded against duplicates by selecting first and inserting if
 * nothing came back. That is a check, not a lock: two tabs, a double-tapped
 * button or a retried request can both pass it and both insert. Only the
 * database can actually decide, and when it does the right response is not an
 * error message — the venue the owner was trying to create already exists, so
 * load it and continue where they left off.
 *
 * Import-free so it can be unit-tested directly.
 */

/** PostgreSQL: unique_violation. */
export const UNIQUE_VIOLATION = '23505'

export type PostgrestLikeError = {
  code?: string | null
  message?: string | null
  details?: string | null
}

/**
 * True when this error means "a business already exists for this user".
 *
 * Matched on the SQLSTATE first, because that is the part no wording change can
 * move. The text is only consulted to confirm the conflict was about `user_id`
 * and not some other unique column — a duplicate on a different constraint is a
 * real failure and must keep surfacing as one.
 */
export function isDuplicateBusinessError(
  error: PostgrestLikeError | null | undefined,
): boolean {
  if (!error) return false
  if (error.code !== UNIQUE_VIOLATION) return false
  const haystack = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()
  // An empty message with the right code is still a unique violation on the only
  // unique column this insert touches, so treat it as ours.
  if (!haystack.trim()) return true
  return haystack.includes('user_id')
}
