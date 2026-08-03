/**
 * Email as typed, turned into email as Supabase will accept it.
 *
 * The sign-in form handed `email` straight to `signInWithPassword`, untrimmed
 * and unnormalized, so whatever the field contained is what Supabase judged.
 * That is how a perfectly ordinary "test@test.com" came back rejected: the
 * address had picked up something invisible.
 *
 * The usual sources are all silent. A phone keyboard adds a trailing space after
 * autocomplete. Copying an address out of a rendered email, a PDF or a chat
 * message brings a zero-width space, a non-breaking space or a directional mark
 * with it. None of them are visible in the input, and `\s` in JavaScript does
 * not match U+200B, U+200E or U+FEFF — so a regex written with `[^\s@]+` calls
 * the address valid while the server calls it malformed. The guest sees a
 * correct address rejected and has no way to tell why.
 *
 * So the invisible characters are removed rather than merely rejected: the guest
 * cannot see them, and asking them to fix something they cannot see is not a
 * fix. What remains is trimmed, lowercased, and only then judged.
 *
 * Import-free so it can be unit-tested directly.
 */

/**
 * Characters with no width that survive `trim()` and slip through `\s`.
 * Zero-width space/non-joiner/joiner, word joiner, BOM, soft hyphen, and the
 * left/right-to-right marks that come with text copied from bidirectional
 * documents.
 */
const INVISIBLE = /[\u200B-\u200F\u2060\uFEFF\u00AD]/g

/**
 * Whitespace beyond ASCII: non-breaking space, the en/em family, narrow and
 * ideographic spaces. Collapsed to a plain space so `trim()` can see them and an
 * interior one still invalidates the address rather than being hidden.
 */
const UNICODE_SPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g

/**
 * Deliberately the same shape the sign-up form uses, applied to the normalized
 * value: a local part, an @, a domain with at least one dot and a two-character
 * final label. Not RFC 5322 — that grammar accepts addresses no provider issues,
 * and the authority here is Supabase, which this only has to agree with.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Longer than any real address; a guard against pathological input. */
const MAX_EMAIL_LENGTH = 254

export function stripInvisibleCharacters(value: string): string {
  return value.replace(INVISIBLE, '')
}

/**
 * What should actually be sent to Supabase. Lowercased because addresses are
 * matched case-insensitively and the sign-up path already stores them that way —
 * without it, "Test@test.com" and "test@test.com" are one account that cannot
 * always find itself.
 */
export function normalizeAuthEmail(raw: string): string {
  if (typeof raw !== 'string') return ''
  return stripInvisibleCharacters(raw).replace(UNICODE_SPACE, ' ').trim().toLowerCase()
}

export function isValidAuthEmail(raw: string): boolean {
  const email = normalizeAuthEmail(raw)
  return email.length > 0 && email.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(email)
}

export type AuthEmailCheck = {
  ok: boolean
  /** Normalized value — send this, not the raw field. */
  email: string
  /** Guest-facing text, or null when there is nothing to say yet. */
  message: string | null
}

/**
 * An empty field says nothing: the guest has not started, and a form that shouts
 * before anyone types is noise.
 */
export function checkAuthEmail(raw: string): AuthEmailCheck {
  const email = normalizeAuthEmail(raw)

  if (!email) return { ok: false, email: '', message: null }

  if (email.length > MAX_EMAIL_LENGTH) {
    return { ok: false, email, message: 'That email address is too long.' }
  }

  if (!EMAIL_RE.test(email)) {
    return { ok: false, email, message: 'Enter a valid email address, like name@example.com.' }
  }

  return { ok: true, email, message: null }
}
