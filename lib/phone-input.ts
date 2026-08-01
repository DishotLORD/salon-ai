/**
 * Phone entry for the guest widget.
 *
 * Kept import-free so it can be unit-tested directly, and kept in one place
 * because the field has three jobs that used to be tangled together: decide
 * which keystrokes are allowed, present the number back to the guest, and say
 * whether what they have typed is a usable number.
 *
 * The rule everything hangs off is E.164: at most 15 digits. The previous mask
 * enforced that in some branches and not others — a 20-digit paste came back as
 * a bare 15-digit run with no separators and no complaint — and nothing ever
 * told the guest what was wrong. A restaurant that cannot call a guest back has
 * a booking it cannot honour, so a wrong number needs to fail loudly at the
 * moment it is typed.
 */

/** E.164 allows 15 digits. Anything longer is a paste, not a phone number. */
export const PHONE_MAX_DIGITS = 15
/**
 * Shortest plausible number. Real subscriber numbers bottom out around 7 digits
 * (local NANP); below that the guest is still mid-typing or gave a house number.
 */
export const PHONE_MIN_DIGITS = 7

/** Characters a guest may legitimately type. Everything else is dropped. */
const ALLOWED_CHARS = /[^\d+()\s-]/g

export function countPhoneDigits(value: string): number {
  return (value.match(/\d/g) ?? []).length
}

/**
 * Strip characters that never belong in a phone number, and allow `+` only as
 * the first character — "+1+44…" is a paste accident, not a number.
 */
export function sanitizePhoneInput(raw: string): string {
  if (typeof raw !== 'string') return ''
  const cleaned = raw.replace(ALLOWED_CHARS, '')
  const leadingPlus = cleaned.trimStart().startsWith('+')
  const withoutPlus = cleaned.replace(/\+/g, '')
  return leadingPlus ? `+${withoutPlus.trimStart()}` : withoutPlus
}

/**
 * Cut the string at the 15th digit while keeping the separators the guest typed.
 * Slicing the raw string instead would count brackets and spaces against the
 * limit; slicing the digits would throw their formatting away.
 */
function trimToMaxDigits(value: string, max = PHONE_MAX_DIGITS): string {
  let digits = 0
  let out = ''
  for (const ch of value) {
    if (/\d/.test(ch)) {
      if (digits >= max) break
      digits += 1
    }
    out += ch
  }
  return out
}

/**
 * What goes back into the input as the guest types.
 *
 * North-American numbers get the familiar (403) 555-0123 shape. Anything
 * starting with `+` keeps the guest's own spacing — an international number is
 * grouped differently in every country, and re-grouping it is how "+44 20 7946
 * 0958" used to turn into something its owner would not recognise.
 */
export function formatPhoneInput(raw: string): string {
  const sanitized = trimToMaxDigits(sanitizePhoneInput(raw))
  if (sanitized.trimStart().startsWith('+')) return sanitized

  const digits = sanitized.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    const local = digits.slice(1)
    return `1 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
  }
  // Past 10 digits without a `+` we cannot know the grouping, so leave the
  // digits alone rather than inventing brackets around the wrong part.
  if (digits.length > 10) return digits
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export type PhoneValidation = {
  /** Safe to submit. */
  ok: boolean
  digits: number
  /** Guest-facing text, or null when there is nothing to say yet. */
  message: string | null
}

/**
 * Empty is not an error — the guest may not have started, or may be giving an
 * email instead. Only a number that exists and cannot work gets a message.
 */
export function validatePhoneInput(raw: string): PhoneValidation {
  const sanitized = sanitizePhoneInput(typeof raw === 'string' ? raw : '')
  const digits = countPhoneDigits(sanitized)

  if (digits === 0) return { ok: false, digits: 0, message: null }

  if (digits < PHONE_MIN_DIGITS) {
    return {
      ok: false,
      digits,
      message: `That looks too short — a phone number needs at least ${PHONE_MIN_DIGITS} digits.`,
    }
  }

  if (digits > PHONE_MAX_DIGITS) {
    return {
      ok: false,
      digits,
      message: `That is ${digits} digits — a phone number can have at most ${PHONE_MAX_DIGITS}.`,
    }
  }

  return { ok: true, digits, message: null }
}
