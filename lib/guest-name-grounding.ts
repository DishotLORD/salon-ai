/**
 * "Is this name one the guest actually typed?"
 *
 * The old guard asked a weaker question and let a real crossover through. A
 * guest typed "RoNIN NARRRR"; the concierge — which had a different customer's
 * profile injected into its prompt — booked "Ronald Arauho" instead, then
 * confirmed a third spelling. The guard passed it because it (a) compared only
 * the FIRST word of the proposed name, (b) as a substring, and (c) against every
 * message in the thread, including the assistant's own. So the model wrote
 * "Ronald", read its own output back, and accepted itself as evidence.
 *
 * The rule here: a name is grounded only if the guest's OWN messages contain it,
 * whole, as consecutive words. The assistant's turns are not evidence. Removing
 * the returning-guest lookup removes where the foreign name came from; this
 * removes the guard's ability to be fooled by it.
 *
 * Kept free of imports so it can be unit-tested directly. Plausibility
 * (`isPlausibleGuestName`) is a separate question and stays with its own module;
 * the booking path asks both.
 */

export type GroundingMessage = { role: string; content: string }

/**
 * Case- and punctuation-insensitive word sequence, padded with spaces so a
 * containment test matches whole words only. Keeps letters and digits from any
 * script — a Cyrillic or accented name has to survive this — and collapses
 * everything else, so "RoNIN, NARRRR!" and "ronin narrrr" compare equal.
 */
function wordSequence(text: string): string {
  return ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
}

/** Only what the guest wrote. Assistant turns are never evidence about the guest. */
export function guestOwnText(messages: GroundingMessage[]): string {
  return messages
    .filter((m) => m?.role === 'user' && typeof m.content === 'string')
    .map((m) => m.content)
    .join(' ')
}

/**
 * True when `name` appears, in full and in order, in what the guest themselves
 * wrote. A name the guest never typed is not theirs to book under.
 */
export function isNameGroundedInGuestMessages(
  name: string,
  messages: GroundingMessage[],
): boolean {
  if (typeof name !== 'string') return false
  const candidate = wordSequence(name).trim()
  if (!candidate) return false
  return wordSequence(guestOwnText(messages)).includes(` ${candidate} `)
}

/**
 * Grounding alone is not enough: a guest who types "my number is 403-555-0134"
 * has grounded that string, and the model has been known to hand it back as
 * guest_name. `isPlausibleGuestName` rejects bare digits but not ones separated
 * by dashes, dots, parentheses or a leading +.
 *
 * A name has to contain letters, and must not be mostly digits.
 */
export function looksLikeContactNotName(name: string): boolean {
  if (typeof name !== 'string') return true
  const letters = (name.match(/\p{L}/gu) ?? []).length
  const digits = (name.match(/\p{Nd}/gu) ?? []).length
  if (letters === 0) return true
  if (digits >= letters) return true
  // "name@example.com" is an address, whatever letters it contains.
  if (/@/.test(name)) return true
  return false
}
