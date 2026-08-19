/**
 * Cut a menu into retrievable pieces without losing any of it.
 *
 * Two rules shape everything here, and both come from reading a real pub menu
 * rather than from theory.
 *
 * A dish is an atom. Vision transcribes a menu as blank-line-separated blocks —
 * name, description lines, price — and a block is exactly the unit a guest asks
 * about. Splitting one would leave a price stranded from the dish it belongs to,
 * so a block is only ever divided when it alone exceeds the hard maximum.
 *
 * A price belongs to its own block and to no other. On the menu that was
 * validated, the pizzas' prices are drawn as decorative glyphs and came back
 * without a dollar sign, so the nearest `$` after "TRIUMPH CHICKEN TIKKA" was
 * the `$5` of the GLUTEN FREE CRUST note two blocks later. Anything that
 * searches forward for a price will eventually quote that five dollars to a
 * guest. Nothing here looks past a block boundary for anything.
 */

/** Roughly a screenful of menu — enough for a section, small enough to rank. */
export const MENU_CHUNK_TARGET_CHARS = 800

/** Never exceeded except by a single indivisible block; see `splitOversized`. */
export const MENU_CHUNK_MAX_CHARS = 1600

export type MenuChunkSource = 'pdf_text' | 'pdf_ocr'

export type MenuChunk = {
  ordinal: number
  section: string | null
  content: string
}

// ─── Section detection ───────────────────────────────────────────────────────

/**
 * A decorated standalone heading: `-Dessert-`, `— Soup & Salads —`.
 * The strongest signal available, and the one the validated menu actually used.
 */
const DECORATED_HEADING = /^[-–—]\s*(.{2,48}?)\s*[-–—]$/

/** Words that mean a line is a note or an item, whatever its case. */
const NOT_A_HEADING = /\d|\$|£|€|,|\bserved\b|\bavailable\b|\badd\b|\bchoice\b|\bw\/\b/i

/**
 * Is this block a section heading?
 *
 * Deliberately hard to satisfy. On a real menu most *item* names are also in
 * capitals — CADILLAC BURGER, THE KOMBI COBB — so capitals alone say nothing,
 * and treating them as headings would file twenty dishes under the name of the
 * twenty-first. A wrong section is worse than none: `null` costs a little
 * ranking quality, while a wrong one answers "show me the desserts" with
 * burgers. When in doubt this returns null.
 */
export function detectSection(block: string): string | null {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  // A heading stands alone. Anything with a description or a price under it is
  // a dish, however it is capitalised.
  if (lines.length !== 1) return null

  const line = lines[0]
  const decorated = DECORATED_HEADING.exec(line)
  if (decorated) {
    const inner = decorated[1].trim()
    return inner.length >= 2 && !NOT_A_HEADING.test(inner) ? inner : null
  }

  // An undecorated single line can still be a heading, but only if it carries
  // nothing that suggests an item: no price, no digits, no ingredient commas.
  if (NOT_A_HEADING.test(line)) return null
  if (line.length < 3 || line.length > 48) return null
  const words = line.split(/\s+/)
  if (words.length > 5) return null
  // Requiring capitals here is safe *because* everything above has already
  // excluded priced and described blocks — what is left is a bare label.
  if (line !== line.toUpperCase() && !DECORATED_HEADING.test(line)) return null
  return line
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

/**
 * Split transcribed text into atoms.
 *
 * Blank lines are the separator, because that is what Vision produces and what
 * the page itself looks like. Text with no blank lines at all — some searchable
 * PDFs — falls back to single lines, which is coarser but never merges two
 * dishes into one atom.
 */
export function splitIntoBlocks(text: string, source: MenuChunkSource = 'pdf_ocr'): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return []

  /*
   * Searchable PDFs are a different, and honestly worse, shape.
   *
   * `extractPdfTextLayer` joins every text item on a page with a space, so its
   * output is one line per page and the only newline is a page boundary. There
   * is no blank line between dishes because there is no dish structure left to
   * find, and pretending otherwise would promise a dish+price grouping the
   * input cannot support. So the page is the atom: coarser than a dish, but
   * true. Recovering real lines needs richer extraction metadata than the
   * legacy text carries, and that is deliberately not attempted here.
   */
  if (source === 'pdf_text') {
    return normalized
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  }

  const byBlankLine = normalized
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean)
  if (byBlankLine.length > 1) return byBlankLine
  return normalized
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/**
 * Divide a block that is too large on its own.
 *
 * Only reached when one atom exceeds the hard maximum, which on a menu means a
 * page-sized run of text rather than a dish. Splits at line boundaries, then at
 * spaces, and if a single run of characters is somehow longer than the maximum
 * it is cut at the limit — because dropping the tail is the one outcome that is
 * never acceptable. Every character of the input appears in the output.
 */
function splitOversized(block: string, maxChars: number): string[] {
  const out: string[] = []
  let current = ''
  const flush = () => {
    if (current.trim()) out.push(current.trim())
    current = ''
  }
  for (const line of block.split('\n')) {
    if (line.length > maxChars) {
      flush()
      let rest = line
      while (rest.length > maxChars) {
        const window = rest.slice(0, maxChars)
        const cut = window.lastIndexOf(' ')
        const at = cut > maxChars * 0.5 ? cut : maxChars
        out.push(rest.slice(0, at).trim())
        rest = rest.slice(at).trim()
      }
      current = rest
      continue
    }
    const candidate = current ? `${current}\n${line}` : line
    if (candidate.length > maxChars) {
      flush()
      current = line
    } else {
      current = candidate
    }
  }
  flush()
  return out.filter(Boolean)
}

// ─── Chunking ────────────────────────────────────────────────────────────────

export type ChunkMenuOptions = {
  source?: MenuChunkSource
  targetChars?: number
  maxChars?: number
}

/**
 * Turn a complete menu into ordered chunks.
 *
 * Blocks accumulate until adding another would pass the target; a heading
 * starts a fresh chunk so a section's items travel with their own label, which
 * is also recorded in `section` for retrieval to filter on. The heading text
 * itself appears exactly once, in the chunk that opens its section — nothing is
 * duplicated, which is what lets `chunksCoverSource` demand an exact match
 * rather than merely a subsequence.
 */
export function chunkMenuText(text: string, options: ChunkMenuOptions = {}): MenuChunk[] {
  const targetChars = options.targetChars ?? MENU_CHUNK_TARGET_CHARS
  const maxChars = options.maxChars ?? MENU_CHUNK_MAX_CHARS

  const blocks = splitIntoBlocks(text, options.source ?? 'pdf_ocr')
  if (blocks.length === 0) return []

  const chunks: MenuChunk[] = []
  let section: string | null = null
  let buffer: string[] = []
  let bufferSection: string | null = null

  const flush = () => {
    if (buffer.length === 0) return
    const body = buffer.join('\n\n').trim()
    if (body) {
      chunks.push({ ordinal: chunks.length, section: bufferSection, content: body })
    }
    buffer = []
  }

  for (const block of blocks) {
    const heading = detectSection(block)
    if (heading) {
      // A heading opens a section: close whatever came before so the label
      // never straddles two of them.
      flush()
      section = heading
      bufferSection = heading
      buffer.push(block)
      continue
    }

    if (buffer.length === 0) bufferSection = section

    if (block.length > maxChars) {
      flush()
      for (const piece of splitOversized(block, maxChars)) {
        bufferSection = section
        chunks.push({ ordinal: chunks.length, section, content: piece })
      }
      bufferSection = section
      continue
    }

    const projected = buffer.length === 0 ? block.length : buffer.join('\n\n').length + 2 + block.length
    if (projected > maxChars || (projected > targetChars && buffer.length > 0)) {
      flush()
      bufferSection = section
    }
    buffer.push(block)
  }
  flush()

  return chunks.map((c, i) => ({ ...c, ordinal: i }))
}

/**
 * The chunks are the source, exactly — no loss, no invention, no reordering.
 *
 * Compared with whitespace removed, because chunking is free to change where
 * lines break but not what the menu says. This started as a subsequence check,
 * which was too weak to be worth running: it passed when content was duplicated,
 * reordered, or padded with text nobody uploaded. Equality catches all three,
 * and the chunker holds it because section labels live in their own column
 * rather than being copied into each chunk.
 */
export function chunksCoverSource(text: string, chunks: MenuChunk[]): boolean {
  const strip = (s: string) => s.replace(/\s+/g, '')
  const source = strip(text)
  const combined = strip(chunks.map((c) => c.content).join(''))
  return source === combined
}
