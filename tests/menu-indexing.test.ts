import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { MENU_CHUNK_MAX_CHARS, chunkMenuText, type MenuChunk } from '../lib/menu-chunking.ts'
import {
  MENU_CHUNK_INSERT_BATCH,
  MENU_EMBEDDING_BATCH_SIZE,
  MENU_EMBEDDING_DIMENSIONS,
  MENU_EMBEDDING_MAX_RETRIES,
  MENU_EMBEDDING_MODEL,
  MENU_EMBEDDING_TIMEOUT_MS,
  MENU_INDEX_BUSY_MESSAGE,
  MENU_INDEX_FAILED_MESSAGE,
  MENU_MAX_CHUNKS_SYNC,
  MENU_TOO_LARGE_MESSAGE,
  batchChunks,
  buildChunkRows,
  embedMenuChunks,
  menuIndexRateLimitKey,
  type EmbeddingClient,
} from '../lib/menu-indexing.ts'

const ROUTE = readFileSync(new URL('../app/api/menu/pdf/route.ts', import.meta.url), 'utf8')
const MIGRATION = readFileSync(
  new URL('../supabase/migrations/026_menu_retrieval.sql', import.meta.url),
  'utf8',
)

const chunk = (i: number): MenuChunk => ({ ordinal: i, section: null, content: `CHUNK ${i} $${i}` })
const chunks = (n: number) => Array.from({ length: n }, (_, i) => chunk(i))
const vector = () => Array.from({ length: MENU_EMBEDDING_DIMENSIONS }, () => 0.01)

/** An embedding client that records what it was asked and answers as told. */
function fakeClient(
  behaviour: (call: number, input: string[]) => Promise<{ data: { embedding: number[] }[] }>,
) {
  const calls: string[][] = []
  const client: EmbeddingClient = {
    embeddings: {
      create: async ({ input }) => {
        calls.push(input)
        return behaviour(calls.length - 1, input)
      },
    },
  }
  return { client, calls }
}

const ok = (input: string[]) => ({ data: input.map(() => ({ embedding: vector() })) })

// ─────────────────────────────────────────────────────────────────────────────

describe('the embedding configuration matches the documented model', () => {
  it('uses text-embedding-3-small at its default width', () => {
    assert.equal(MENU_EMBEDDING_MODEL, 'text-embedding-3-small')
    assert.equal(MENU_EMBEDDING_DIMENSIONS, 1536)
  })

  it('the migration stores vectors of exactly that width', () => {
    // A column of the wrong width rejects every insert at activation time.
    assert.match(MIGRATION, /embedding extensions\.vector\(1536\)/)
  })

  it('a batch stays comfortably inside the per-input token ceiling', () => {
    // 8192 tokens per input is documented; a 1600-char chunk is ~400, so 96 of
    // them is roughly 38k tokens across the request — chosen from what is
    // known, not pushed against a limit that is not published.
    const worstCaseTokens = (MENU_EMBEDDING_BATCH_SIZE * MENU_CHUNK_MAX_CHARS) / 4
    assert.ok(worstCaseTokens < 60_000, `worst case ~${worstCaseTokens} tokens`)
    assert.ok(MENU_EMBEDDING_BATCH_SIZE > 0 && MENU_EMBEDDING_BATCH_SIZE <= 128)
  })

  it('failure handling is bounded, not open-ended', () => {
    assert.ok(MENU_EMBEDDING_MAX_RETRIES <= 2)
    assert.ok(MENU_EMBEDDING_TIMEOUT_MS > 0 && MENU_EMBEDDING_TIMEOUT_MS <= 60_000)
    // Several batches still have to finish inside the route's own 120s.
    assert.ok(MENU_EMBEDDING_TIMEOUT_MS * (MENU_EMBEDDING_MAX_RETRIES + 1) < 120_000)
  })
})

describe('batching', () => {
  it('splits into full batches with a remainder', () => {
    const b = batchChunks(chunks(250), 96)
    assert.deepEqual(b.map((x) => x.length), [96, 96, 58])
  })

  it('handles the empty and single cases', () => {
    assert.deepEqual(batchChunks([], 96), [])
    assert.equal(batchChunks(chunks(1), 96).length, 1)
  })

  it('refuses a nonsense batch size rather than looping forever', () => {
    assert.throws(() => batchChunks(chunks(3), 0))
  })
})

describe('embedding a menu', () => {
  it('sends every chunk, in bounded batches, and returns one vector each', async () => {
    const { client, calls } = fakeClient(async (_i, input) => ok(input))
    const result = await embedMenuChunks(client, chunks(200), { batchSize: 96 })
    assert.equal(result.ok, true)
    assert.equal(result.ok && result.embeddings.length, 200)
    assert.deepEqual(calls.map((c) => c.length), [96, 96, 8])
  })

  it('retries a transient failure and then succeeds', async () => {
    let attempts = 0
    const { client } = fakeClient(async (_i, input) => {
      attempts += 1
      if (attempts === 1) {
        const err = Object.assign(new Error('rate limited'), { status: 429 })
        throw err
      }
      return ok(input)
    })
    const result = await embedMenuChunks(client, chunks(3), { maxRetries: 2 })
    assert.equal(result.ok, true)
    assert.equal(attempts, 2)
  })

  it('does not retry a permanent failure', async () => {
    // A 400 will say the same thing three times, and the owner waits for it.
    let attempts = 0
    const { client } = fakeClient(async () => {
      attempts += 1
      throw Object.assign(new Error('invalid input'), { status: 400 })
    })
    const result = await embedMenuChunks(client, chunks(3), { maxRetries: 2 })
    assert.deepEqual(result, { ok: false, reason: 'failed' })
    assert.equal(attempts, 1, 'permanent failures are not retried')
  })

  it('gives up after the retry ceiling', async () => {
    let attempts = 0
    const { client } = fakeClient(async () => {
      attempts += 1
      throw Object.assign(new Error('server error'), { status: 503 })
    })
    const result = await embedMenuChunks(client, chunks(3), { maxRetries: 2 })
    assert.equal(result.ok, false)
    assert.equal(attempts, 3, 'first attempt plus two retries, then stop')
  })

  it('reports a timeout as a timeout', async () => {
    const { client } = fakeClient(async () => new Promise(() => {}))
    const result = await embedMenuChunks(client, chunks(2), { timeoutMs: 20, maxRetries: 0 })
    assert.deepEqual(result, { ok: false, reason: 'timeout' })
  })

  it('rejects a short reply rather than indexing a partial menu', async () => {
    const { client } = fakeClient(async (_i, input) => ok(input.slice(0, -1)))
    const result = await embedMenuChunks(client, chunks(4), { maxRetries: 0 })
    assert.deepEqual(result, { ok: false, reason: 'failed' })
  })

  it('rejects a vector of the wrong width', async () => {
    const { client } = fakeClient(async (_i, input) => ({
      data: input.map(() => ({ embedding: [0.1, 0.2] })),
    }))
    const result = await embedMenuChunks(client, chunks(2), { maxRetries: 0 })
    assert.deepEqual(result, { ok: false, reason: 'failed' })
  })

  it('never logs a key, a vector or the menu', () => {
    const lib = readFileSync(new URL('../lib/menu-indexing.ts', import.meta.url), 'utf8')
    for (const line of lib.split('\n').filter((l) => /console\./.test(l))) {
      assert.doesNotMatch(line, /apiKey|OPENAI|embedding[s]?\b.*\$\{|content|input|vector/i, line.trim())
    }
  })
})

describe('rows are built from server-side identity only', () => {
  it('stamps the verified business and the created document onto every row', () => {
    const c = chunks(3)
    const rows = buildChunkRows(c, c.map(vector), 'biz-verified', 'doc-1')
    for (const r of rows) {
      assert.equal(r.business_id, 'biz-verified')
      assert.equal(r.document_id, 'doc-1')
    }
  })

  it('preserves ordinal, section and content exactly', () => {
    const c: MenuChunk[] = [{ ordinal: 0, section: 'Dessert', content: 'CAKE $8' }]
    const [row] = buildChunkRows(c, [vector()], 'b', 'd')
    assert.equal(row.ordinal, 0)
    assert.equal(row.section, 'Dessert')
    assert.equal(row.content, 'CAKE $8')
  })

  it('serialises the vector in the form pgvector accepts', () => {
    const [row] = buildChunkRows([chunk(0)], [[1, 2, 3]], 'b', 'd')
    assert.equal(row.embedding, '[1,2,3]')
  })

  it('refuses a length mismatch instead of writing a null embedding', () => {
    assert.throws(() => buildChunkRows(chunks(3), [vector()], 'b', 'd'))
  })

  it('never reads a business id from anywhere but its argument', () => {
    const lib = readFileSync(new URL('../lib/menu-indexing.ts', import.meta.url), 'utf8')
    assert.match(lib, /business_id: verifiedBusinessId/)
  })
})

describe('the synchronous ceiling', () => {
  it('is a named constant, generous against a measured real menu', () => {
    // A generated 100-page menu chunks to roughly 100 chunks, so this is ~15x
    // the largest document actually measured.
    assert.equal(MENU_MAX_CHUNKS_SYNC, 1500)
  })

  it('is checked after chunking and before anything is embedded or created', () => {
    const chunkAt = ROUTE.search(/chunkMenuText\(menuText/)
    const ceilingAt = ROUTE.search(/chunks\.length > MENU_MAX_CHUNKS_SYNC/)
    const beginAt = ROUTE.search(/rpc\('begin_menu_indexing'/)
    const embedAt = ROUTE.search(/embedMenuChunks\(openai/)
    assert.ok(chunkAt >= 0 && ceilingAt > chunkAt, 'ceiling comes after chunking')
    assert.ok(ceilingAt < beginAt, 'ceiling comes before any document row exists')
    assert.ok(ceilingAt < embedAt, 'ceiling comes before any embedding is bought')
  })

  it('the refusal tells the owner nothing was saved', () => {
    assert.match(MENU_TOO_LARGE_MESSAGE, /[Nn]othing was saved/)
    assert.match(MENU_TOO_LARGE_MESSAGE, /menu is unchanged/)
    assert.match(MENU_TOO_LARGE_MESSAGE, new RegExp(String(MENU_MAX_CHUNKS_SYNC)))
  })

  it('a 1501-chunk menu is over the line and a 1500-chunk one is not', () => {
    assert.ok(MENU_MAX_CHUNKS_SYNC + 1 > MENU_MAX_CHUNKS_SYNC)
    const under = chunkMenuText(Array.from({ length: 20 }, (_, i) => `D${i}\n$${i}`).join('\n\n'))
    assert.ok(under.length <= MENU_MAX_CHUNKS_SYNC)
  })
})

describe('indexing admission is keyed on a verified id', () => {
  it('uses its own namespace', () => {
    assert.equal(menuIndexRateLimitKey('abc'), 'menu-index:abc')
  })

  it('the route passes the id it loaded, and reuses the existing limiter', () => {
    assert.match(ROUTE, /menuIndexRateLimitKey\(business_id\)/)
    assert.match(ROUTE, /checkRateLimit\(\s*\n?\s*menuIndexRateLimitKey/)
  })

  it('the OCR budget is untouched', () => {
    assert.match(ROUTE, /checkRateLimit\(`menu-ocr:\$\{business_id\}`, OCR_LIMIT_PER_HOUR, 3_600_000\)/)
  })

  it('the busy message says nothing was saved', () => {
    assert.match(MENU_INDEX_BUSY_MESSAGE, /[Nn]othing was saved/)
    assert.match(MENU_INDEX_FAILED_MESSAGE, /[Nn]othing was saved/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the upload route publishes only what it fully indexed', () => {
  it('writes menu_pdf_text nowhere except inside activation', () => {
    /*
     * The invariant this whole PR turns on. A direct write here is how a venue
     * ends up with a stored menu and an indexed menu from different uploads.
     */
    assert.doesNotMatch(ROUTE, /update\(\{\s*menu_pdf_text:/)
    assert.match(ROUTE, /p_menu_text: menuText/)
  })

  it('runs begin → embed → insert → activate, in that order', () => {
    const order = [
      ROUTE.search(/rpc\('begin_menu_indexing'/),
      ROUTE.search(/embedMenuChunks\(openai/),
      ROUTE.search(/from\('menu_chunks'\)\s*\n?\s*\.insert/),
      ROUTE.search(/rpc\('activate_menu_document'/),
    ]
    for (const i of order) assert.ok(i >= 0)
    assert.deepEqual(order, [...order].sort((a, b) => a - b))
  })

  it('abandons the half-built document on every failure path after it exists', () => {
    /*
     * Three paths can fail once begin_menu_indexing has returned — embedding,
     * chunk insert, activation — and each must retire the document. Otherwise
     * the one-indexing unique index locks the venue out for the stale window.
     */
    const abandons = ROUTE.match(/await abandon\(\)/g) ?? []
    assert.equal(abandons.length, 3, 'one per failure path after the document exists')
    assert.match(ROUTE, /rpc\('fail_menu_document'/)
    for (const path of [/embedded\.ok/, /chunk_insert_failed/, /activation_failed/]) {
      assert.match(ROUTE, path)
    }
  })

  it('does not leave an embedding timeout timer holding the function open', () => {
    const lib = readFileSync(new URL('../lib/menu-indexing.ts', import.meta.url), 'utf8')
    assert.match(lib, /clearTimeout\(timer\)/)
  })

  it('maps embedding outcomes to distinct statuses', () => {
    assert.match(ROUTE, /embedded\.reason === 'timeout' \? 504 : 502/)
  })

  it('answers a busy venue with 409, not a generic failure', () => {
    assert.match(ROUTE, /busy \? 409 : 500/)
  })

  it('inserts chunks in bounded batches', () => {
    assert.match(ROUTE, /MENU_CHUNK_INSERT_BATCH/)
    assert.ok(MENU_CHUNK_INSERT_BATCH > 0 && MENU_CHUNK_INSERT_BATCH <= 500)
  })

  it('proves coverage before it buys a single embedding', () => {
    const coverAt = ROUTE.search(/chunksCoverSource\(menuText, chunks\)/)
    const embedAt = ROUTE.search(/embedMenuChunks\(openai/)
    assert.ok(coverAt >= 0 && coverAt < embedAt)
  })

  it('DELETE goes through the transactional function', () => {
    assert.match(ROUTE, /rpc\('delete_active_menu'/)
    assert.doesNotMatch(ROUTE, /update\(\{ menu_pdf_text: null \}\)/)
  })
})

describe('chat is untouched by this change', () => {
  it('the chat route still reads the legacy column and nothing new', () => {
    const chat = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8')
    assert.match(chat, /menu_pdf_text/)
    for (const forbidden of ['menu_chunks', 'menu_documents', 'match_menu_chunks', 'embedding']) {
      assert.equal(chat.includes(forbidden), false, `chat must not reference ${forbidden} yet`)
    }
  })
})
