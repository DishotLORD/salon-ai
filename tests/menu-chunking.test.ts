import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  MENU_CHUNK_MAX_CHARS,
  MENU_CHUNK_TARGET_CHARS,
  chunkMenuText,
  chunksCoverSource,
  detectSection,
  splitIntoBlocks,
} from '../lib/menu-chunking.ts'
import { normalizeMenuText } from '../lib/menu-ocr-normalize.ts'

/**
 * Shaped like the transcription a real designed pub menu produced: decorated
 * section headings, ALL-CAPS dish names, blank lines between items, and — the
 * case that matters — pizzas whose prices were drawn as glyphs and came back
 * without a dollar sign, followed by a gluten-free note that has one.
 *
 * Names and wording here are invented for this test. The *shape* is what was
 * observed, and the shape is what the chunker has to survive.
 */
const OCR_LIKE = `-Soup & Salads-

GREEN THING
Leaves, seeds, citrus dressing $15

WARM BOWL
Barley, squash, herb oil $18

-Pizza Wheels-

FIRST PIZZA
Tomato, basil, mozzarella
🍕22 🍕16

SECOND PIZZA
Ham, pineapple, mozzarella
🍕24 🍕17

GLUTEN FREE CRUST AVAILABLE $5

-Dessert-

Chocolate Cake
$8`

describe('normalizing a transcription without editing the menu', () => {
  it('removes an outer Markdown fence Vision wrapped the reply in', () => {
    const out = normalizeMenuText('```\nSOUP $8\n\nSALAD $12\n```')
    assert.equal(out, 'SOUP $8\n\nSALAD $12')
  })

  it('removes a tagged outer fence too', () => {
    assert.equal(normalizeMenuText('```text\nSOUP $8\n```'), 'SOUP $8')
  })

  it('leaves a fence that is part of the content alone', () => {
    // Only the outer wrapper is packaging; anything else is what was on the page.
    const inner = 'SOUP $8\n\n```\nnot a wrapper\n```\n\nSALAD $12'
    assert.equal(normalizeMenuText(inner), inner)
  })

  it('preserves the blank lines the chunker depends on', () => {
    const out = normalizeMenuText('A $1\n\nB $2\n\n\nC $3')
    assert.equal(out.split(/\n\s*\n/).length, 3)
  })

  it('never invents a dollar sign', () => {
    const out = normalizeMenuText('FIRST PIZZA\n🍕22 🍕16')
    assert.equal(out.includes('$'), false)
    assert.match(out, /🍕22 🍕16/)
  })

  it('does not rewrite names, case or spelling', () => {
    const odd = 'CHRYSLER CRISPY CHIKEN BURGER\nSlaw, srirача mayo $22'
    assert.equal(normalizeMenuText(odd), odd)
  })

  it('normalizes CRLF so blank-line detection still works', () => {
    assert.equal(normalizeMenuText('A $1\r\n\r\nB $2'), 'A $1\n\nB $2')
  })

  it('handles junk input without throwing', () => {
    assert.equal(normalizeMenuText(''), '')
    assert.equal(normalizeMenuText('   \n  '), '')
    assert.equal(normalizeMenuText(undefined as unknown as string), '')
  })
})

describe('section detection stays quiet unless it is sure', () => {
  it('recognises a decorated standalone heading', () => {
    assert.equal(detectSection('-Dessert-'), 'Dessert')
    assert.equal(detectSection('-Soup & Salads-'), 'Soup & Salads')
    assert.equal(detectSection('— Start Me Up —'), 'Start Me Up')
  })

  it('does NOT treat an ALL-CAPS dish name as a section', () => {
    /*
     * The trap. On a real menu most item names are capitalised — CADILLAC
     * BURGER, THE KOMBI COBB — so capitals alone prove nothing, and calling one
     * a heading files every dish after it under the name of a burger.
     */
    assert.equal(detectSection('CADILLAC BURGER\nPrime rib patty, cheddar $24'), null)
    assert.equal(detectSection('GARAGE WINGS (1 LB)\nChoice of sauce $17'), null)
  })

  it('does not promote a priced single line', () => {
    assert.equal(detectSection('GLUTEN FREE CRUST AVAILABLE $5'), null)
    assert.equal(detectSection('SOUP OF THE DAY $8'), null)
  })

  it('does not promote a line that reads like a note', () => {
    assert.equal(detectSection('Served w/ choice of fries or salad'), null)
    assert.equal(detectSection('Gluten free buns available'), null)
  })

  it('does not promote a long or wordy line', () => {
    assert.equal(detectSection('A LINE THAT GOES ON AND ON AND ON AND ON PAST ANY HEADING'), null)
  })

  it('prefers null over a guess', () => {
    for (const raw of ['', '   ', 'x', 'Mixed Case Words Here']) {
      assert.equal(detectSection(raw), null, JSON.stringify(raw))
    }
  })
})

describe('blocks are the atoms', () => {
  it('splits on blank lines', () => {
    assert.equal(splitIntoBlocks(OCR_LIKE).length, 9)
  })

  it('falls back to lines when a document has no blank lines', () => {
    // Coarser, but it never merges two dishes into one atom.
    assert.deepEqual(splitIntoBlocks('A $1\nB $2\nC $3'), ['A $1', 'B $2', 'C $3'])
  })

  it('is empty for empty input', () => {
    assert.deepEqual(splitIntoBlocks('   '), [])
  })
})

describe('chunking a transcribed menu', () => {
  const chunks = chunkMenuText(OCR_LIKE)

  it('produces ordered, non-empty chunks', () => {
    assert.ok(chunks.length > 0)
    chunks.forEach((c, i) => {
      assert.equal(c.ordinal, i)
      assert.ok(c.content.trim().length > 0)
    })
  })

  it('is deterministic', () => {
    assert.deepEqual(chunkMenuText(OCR_LIKE), chunks)
  })

  it('loses no menu content', () => {
    assert.equal(chunksCoverSource(OCR_LIKE, chunks), true)
  })

  it('keeps a dish and its price in the same chunk', () => {
    const withDish = chunks.find((c) => c.content.includes('GREEN THING'))
    assert.ok(withDish)
    assert.match(withDish!.content, /\$15/)
  })

  it('never lets a pizza borrow the gluten-free note’s $5', () => {
    /*
     * The specific failure a "nearest $ after the name" rule would produce on
     * the real menu, where the pizza prices have no dollar sign at all. If a
     * pizza block and that note ever share a chunk, the note must at least still
     * be its own block — but the price must never be attached to the pizza.
     */
    const pizza = chunks.find((c) => c.content.includes('SECOND PIZZA'))
    assert.ok(pizza)
    const block = pizza!.content
      .split(/\n\s*\n/)
      .find((b) => b.includes('SECOND PIZZA'))!
    assert.equal(block.includes('$5'), false)
    assert.match(block, /🍕24 🍕17/)
  })

  it('assigns the decorated sections and nothing else', () => {
    const sections = [...new Set(chunks.map((c) => c.section))]
    for (const s of sections) {
      if (s === null) continue
      assert.ok(['Soup & Salads', 'Pizza Wheels', 'Dessert'].includes(s), `unexpected section ${s}`)
    }
  })

  it('starts a new chunk at a section heading', () => {
    const pizzaChunk = chunks.find((c) => c.content.includes('FIRST PIZZA'))
    assert.equal(pizzaChunk?.section, 'Pizza Wheels')
    const saladChunk = chunks.find((c) => c.content.includes('GREEN THING'))
    assert.equal(saladChunk?.section, 'Soup & Salads')
  })

  it('respects the hard maximum', () => {
    for (const c of chunks) assert.ok(c.content.length <= MENU_CHUNK_MAX_CHARS)
  })
})

describe('size limits and oversized blocks', () => {
  it('packs several items toward the target rather than one per chunk', () => {
    const many = Array.from({ length: 40 }, (_, i) => `DISH ${i}\nSomething tasty $${10 + i}`).join('\n\n')
    const chunks = chunkMenuText(many)
    assert.ok(chunks.length < 40, 'should group items, not emit one chunk each')
    assert.ok(chunks.every((c) => c.content.length <= MENU_CHUNK_MAX_CHARS))
    assert.equal(chunksCoverSource(many, chunks), true)
  })

  it('splits a single block that exceeds the maximum, keeping every line', () => {
    const huge = ['GIANT SECTION', ...Array.from({ length: 200 }, (_, i) => `Line ${i} of description text`)].join('\n')
    const chunks = chunkMenuText(huge)
    assert.ok(chunks.length > 1)
    assert.ok(chunks.every((c) => c.content.length <= MENU_CHUNK_MAX_CHARS))
    assert.equal(chunksCoverSource(huge, chunks), true)
    // The tail is the part a truncating implementation would drop.
    assert.ok(chunks.some((c) => c.content.includes('Line 199')))
  })

  it('splits a single line longer than the maximum without discarding the tail', () => {
    const line = 'A'.repeat(MENU_CHUNK_MAX_CHARS * 2 + 137)
    const chunks = chunkMenuText(line)
    assert.ok(chunks.every((c) => c.content.length <= MENU_CHUNK_MAX_CHARS))
    const total = chunks.reduce((n, c) => n + c.content.length, 0)
    assert.equal(total, line.length, 'every character survives')
  })

  it('honours caller-supplied limits', () => {
    const text = Array.from({ length: 20 }, (_, i) => `ITEM ${i}\nDescription $${i}`).join('\n\n')
    const small = chunkMenuText(text, { targetChars: 60, maxChars: 120 })
    assert.ok(small.every((c) => c.content.length <= 120))
    assert.equal(chunksCoverSource(text, small), true)
  })

  it('the target sits below the maximum', () => {
    assert.ok(MENU_CHUNK_TARGET_CHARS < MENU_CHUNK_MAX_CHARS)
  })

  it('empty input yields no chunks', () => {
    assert.deepEqual(chunkMenuText(''), [])
    assert.deepEqual(chunkMenuText('   \n\n  '), [])
  })
})

describe('the coverage check actually catches loss', () => {
  it('rejects a chunk set that dropped a block', () => {
    const full = chunkMenuText(OCR_LIKE)
    assert.equal(chunksCoverSource(OCR_LIKE, full.slice(0, -1)), false)
  })

  it('rejects truncated content', () => {
    const chunks = chunkMenuText(OCR_LIKE)
    const truncated = chunks.map((c, i) => (i === 0 ? { ...c, content: c.content.slice(0, 5) } : c))
    assert.equal(chunksCoverSource(OCR_LIKE, truncated), false)
  })
})
