/**
 * Tidy the transcription without editing the menu.
 *
 * The line between the two is the whole point. Vision sometimes wraps its
 * answer in a Markdown fence, which is an artefact of the reply and not part of
 * anyone's menu — that comes off. Everything inside is a restaurant's prices and
 * ingredients, and it stays exactly as transcribed.
 *
 * That restraint is deliberate, and validation against a real menu is what
 * settled it. On a designed pub menu the pizza prices are drawn as decorative
 * slice glyphs, and Vision returned them as emoji with the dollar sign dropped:
 * `🍕22 🍕16`. It is tempting to put the `$` back. Do not. The number that looks
 * like a price might be a size, a table number, or the "350" in a dish name, and
 * a concierge that quotes an invented price to a guest has done real damage —
 * far more than one that reads a slightly odd line back verbatim. The block is
 * kept as evidence of what was actually on the page, and anything that wants to
 * reason about prices can do so downstream, where it can be checked.
 */

/** A fence that opens the text and closes it, optionally tagged (```text). */
const OUTER_FENCE = /^```[^\n]*\n([\s\S]*?)\n?```$/

/**
 * Normalize a transcription for storage and chunking.
 *
 * Trims the ends, removes one outer Markdown fence if the whole reply is
 * wrapped in it, and normalizes line endings. Nothing else: no price repair, no
 * spelling correction, no case changes, no collapsing of the blank lines that
 * separate one dish from the next — those blank lines are the structure the
 * chunker relies on.
 */
export function normalizeMenuText(raw: string): string {
  if (typeof raw !== 'string') return ''
  // CRLF would otherwise leave a stray \r on every line and defeat blank-line
  // detection on Windows-produced text.
  const unified = raw.replace(/\r\n?/g, '\n')
  const trimmed = unified.trim()
  const fenced = OUTER_FENCE.exec(trimmed)
  // Only an outer fence, and only the outer one — a fence that opens and closes
  // mid-menu is content, not packaging.
  return fenced ? fenced[1].trim() : trimmed
}
