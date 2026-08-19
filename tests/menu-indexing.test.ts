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
  MENU_EMBEDDING_TOTAL_BUDGET_MS,
  MENU_INDEX_BUSY_MESSAGE,
  MENU_INDEX_FAILED_MESSAGE,
  MENU_MAX_CHUNKS_SYNC,
  MENU_TOO_LARGE_MESSAGE,
  batchChunks,
  buildChunkRows,
  embedMenuChunks,
  menuIndexRateLimitKey,
  type EmbeddingClient,
  type EmbeddingRequestOptions,
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
  behaviour: (
    call: number,
    input: string[],
    options?: EmbeddingRequestOptions,
  ) => Promise<{ data: { embedding: number[] }[] }>,
) {
  const calls: string[][] = []
  const optionsSeen: (EmbeddingRequestOptions | undefined)[] = []
  const client: EmbeddingClient = {
    embeddings: {
      create: async ({ input }, options) => {
        calls.push(input)
        optionsSeen.push(options)
        return behaviour(calls.length - 1, input, options)
      },
    },
  }
  return { client, calls, optionsSeen }
}

/** A request that only settles when its own signal aborts, as the SDK does. */
const abortable = (options?: EmbeddingRequestOptions) =>
  new Promise<never>((_, reject) => {
    options?.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    })
  })

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
    const { client } = fakeClient(async (_i, _input, options) => abortable(options))
    const result = await embedMenuChunks(client, chunks(2), { timeoutMs: 20, maxRetries: 0 })
    assert.deepEqual(result, { ok: false, reason: 'timeout' })
  })

  it('aborts the real request instead of abandoning it', async () => {
    /*
     * A raced promise leaves the original call in flight, so a timed-out batch
     * and its retry ran at once — two live requests for the same work, the
     * first still billable and still able to resolve into nothing.
     */
    const aborted: boolean[] = []
    const { client } = fakeClient(async (_i, _input, options) => {
      options?.signal?.addEventListener('abort', () => aborted.push(true))
      return abortable(options)
    })
    const result = await embedMenuChunks(client, chunks(2), { timeoutMs: 20, maxRetries: 1 })
    assert.deepEqual(result, { ok: false, reason: 'timeout' })
    assert.equal(aborted.length, 2, 'every attempt aborted its own request')
  })

  it('passes an AbortSignal on every request', async () => {
    const { client, optionsSeen } = fakeClient(async (_i, input) => ok(input))
    await embedMenuChunks(client, chunks(200), { batchSize: 96 })
    assert.equal(optionsSeen.length, 3)
    for (const o of optionsSeen) assert.ok(o?.signal instanceof AbortSignal)
  })

  it('disables the SDK’s own retries so ours is the only loop', async () => {
    /*
     * The SDK retries twice by default (`opts.maxRetries=2`), so without this
     * "at most 2 retries" meant up to nine HTTP attempts per batch — and no
     * deadline computed here could hold.
     */
    const { client, optionsSeen } = fakeClient(async (_i, input) => ok(input))
    await embedMenuChunks(client, chunks(3))
    for (const o of optionsSeen) assert.equal(o?.maxRetries, 0)
  })

  it('makes at most 1 + MENU_EMBEDDING_MAX_RETRIES real HTTP attempts per batch', async () => {
    let attempts = 0
    const { client } = fakeClient(async () => {
      attempts += 1
      throw Object.assign(new Error('server error'), { status: 503 })
    })
    await embedMenuChunks(client, chunks(3))
    assert.equal(attempts, 1 + MENU_EMBEDDING_MAX_RETRIES)
    assert.equal(attempts, 3)
  })

  it('stops at the total phase deadline however many batches remain', async () => {
    /*
     * Per-batch bounds do not bound the total: twenty batches each finishing
     * just inside their own timeout still run past the route's maxDuration, and
     * the invocation is killed with a document stuck in `indexing`.
     */
    let clock = 0
    let calls = 0
    const { client } = fakeClient(async (_i, input) => {
      calls += 1
      clock += 400 // each batch "takes" 400ms of the budget
      return ok(input)
    })
    const result = await embedMenuChunks(client, chunks(96 * 20), {
      batchSize: 96,
      totalBudgetMs: 1_000,
      now: () => clock,
    })
    assert.deepEqual(result, { ok: false, reason: 'timeout' })
    assert.ok(calls < 20, `stopped after ${calls} of 20 batches`)
  })

  it('never lets one attempt outlive the remaining phase budget', async () => {
    let clock = 0
    const { client } = fakeClient(async (_i, _input, options) => {
      clock += 10
      return abortable(options)
    })
    const result = await embedMenuChunks(client, chunks(2), {
      timeoutMs: 30_000,
      totalBudgetMs: 40,
      maxRetries: 2,
      now: () => clock,
    })
    assert.deepEqual(result, { ok: false, reason: 'timeout' })
  })

  it('the phase budget leaves room inside the route’s own ceiling', () => {
    // 120s maxDuration, and the route still has to retire the document and
    // answer the owner after this returns.
    assert.equal(MENU_EMBEDDING_TOTAL_BUDGET_MS, 70_000)
    assert.ok(MENU_EMBEDDING_TOTAL_BUDGET_MS < 120_000 - 40_000)
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

  it('is checked after chunking and before metadata or embeddings', () => {
    /*
     * The lease now precedes chunking — it has to, to close the DELETE race —
     * so the ceiling can no longer come before the document row. What still
     * holds, and is what costs money, is that nothing is embedded and no
     * metadata is committed until the size is known to be acceptable. An
     * oversized upload retires its own lease and changes nothing else.
     */
    const chunkAt = ROUTE.search(/chunkMenuText\(menuText/)
    const ceilingAt = ROUTE.search(/chunks\.length > MENU_MAX_CHUNKS_SYNC/)
    const prepareAt = ROUTE.search(/rpc\('prepare_menu_document'/)
    const embedAt = ROUTE.search(/embedMenuChunks\(openai/)
    assert.ok(chunkAt >= 0 && ceilingAt > chunkAt, 'ceiling comes after chunking')
    assert.ok(ceilingAt < prepareAt, 'ceiling comes before any metadata is committed')
    assert.ok(ceilingAt < embedAt, 'ceiling comes before any embedding is bought')
  })

  it('the refusal tells the owner nothing was saved, in their terms', () => {
    assert.match(MENU_TOO_LARGE_MESSAGE, /[Nn]othing was saved/)
    assert.match(MENU_TOO_LARGE_MESSAGE, /menu is unchanged/)
    // 1500 is a chunk ceiling, not a count of menu sections — quoting it at an
    // owner would be both meaningless and, as "1500 sections", untrue.
    assert.doesNotMatch(MENU_TOO_LARGE_MESSAGE, /\d/)
    assert.doesNotMatch(MENU_TOO_LARGE_MESSAGE, /section|chunk/i)
    assert.match(MENU_TOO_LARGE_MESSAGE, /too large to index/i)
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

  it('takes the upload lease BEFORE the body, extraction, OCR or embeddings', () => {
    /*
     * The race this closes. With the document created only once the text was in
     * hand, an owner could delete their menu while OCR was still running: the
     * delete saw no indexing job and succeeded, then the upload finished and
     * activated, putting the deleted menu back.
     */
    const lease = ROUTE.search(/rpc\('begin_menu_indexing'/)
    for (const [name, pattern] of [
      ['formData', /await request\.formData\(\)/],
      ['extraction', /extractPdfTextLayer\(buffer\)/],
      ['OCR', /await ocrPdf\(buffer\)/],
      ['chunking', /chunkMenuText\(menuText/],
      ['embeddings', /embedMenuChunks\(openai/],
      ['activation', /rpc\('activate_menu_document'/],
    ] as const) {
      const at = ROUTE.search(pattern)
      assert.ok(at >= 0 && lease < at, `lease must precede ${name}`)
    }
  })

  it('still authorizes before taking a lease or buffering', () => {
    const auth = ROUTE.search(/const check = await verifyOwner\(business_id\)/)
    const lease = ROUTE.search(/rpc\('begin_menu_indexing'/)
    const body = ROUTE.search(/await request\.formData\(\)/)
    assert.ok(auth >= 0 && auth < lease, 'no lease on an unowned venue')
    assert.ok(auth < body, 'authentication still precedes buffering')
  })

  it('refuses on the rate limit before any lease or expensive work', () => {
    const limit = ROUTE.search(/menuIndexRateLimitKey\(business_id\)/)
    const lease = ROUTE.search(/rpc\('begin_menu_indexing'/)
    const ocr = ROUTE.search(/await ocrPdf\(buffer\)/)
    assert.ok(limit >= 0 && limit < lease && limit < ocr)
  })

  it('runs lease → prepare → embed → insert → activate, in that order', () => {
    const order = [
      ROUTE.search(/rpc\('begin_menu_indexing'/),
      ROUTE.search(/rpc\('prepare_menu_document'/),
      ROUTE.search(/embedMenuChunks\(openai/),
      ROUTE.search(/from\('menu_chunks'\)\s*\n?\s*\.insert/),
      ROUTE.search(/rpc\('activate_menu_document'/),
    ]
    for (const i of order) assert.ok(i >= 0)
    assert.deepEqual(order, [...order].sort((a, b) => a - b))
  })

  it('records the character count the way PostgreSQL will read it', () => {
    // String.length would report 9 for "🍕22 🍕16" where char_length() says 7,
    // and activation compares the two.
    assert.match(ROUTE, /p_char_count: menuCharacterCount\(menuText\)/)
    assert.doesNotMatch(ROUTE, /p_char_count: menuText\.length/)
  })

  it('retires the lease on every failure after it exists, through one helper', () => {
    /*
     * Centralised on purpose. Copying the cleanup into a dozen branches is how
     * one of them gets forgotten and a venue is locked out for the stale window
     * over a bad PDF header.
     */
    assert.match(ROUTE, /const release = async \(response: NextResponse\)/)
    assert.match(ROUTE, /rpc\('fail_menu_document'/)

    const guarded = ROUTE.slice(
      ROUTE.indexOf('const release = async'),
      ROUTE.indexOf('// ── DELETE /api/menu/pdf'),
    )
    const bare = guarded.match(/return NextResponse\.json\(/g) ?? []
    // Exactly one: the success path, where activation already consumed the lease.
    assert.equal(bare.length, 1, 'every failure exit must go through release()')
    assert.ok((guarded.match(/return release\(/g) ?? []).length >= 10)
  })

  it('covers the early branches that used to return before any document existed', () => {
    const guarded = ROUTE.slice(
      ROUTE.indexOf('const release = async'),
      ROUTE.indexOf('// ── DELETE /api/menu/pdf'),
    )
    for (const branch of [
      'Could not read the upload',      // malformed multipart
      'does not look like a PDF',       // signature
      'That file is empty',             // zero bytes
      'ocrCoverageMessage(coverage)',   // OCR page-coverage refusal
      'OCR_UNAVAILABLE_MESSAGE',        // OCR budget refusal
      'MENU_TOO_LARGE_MESSAGE',         // chunk ceiling
    ]) {
      const at = guarded.indexOf(branch)
      assert.ok(at >= 0, `${branch} not found inside the guarded region`)
      const before = guarded.lastIndexOf('return ', at)
      assert.match(
        guarded.slice(before, at + branch.length + 200),
        /return release\(/,
        `${branch} must retire the lease`,
      )
    }
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

  it('keeps index internals out of owner-facing responses', () => {
    /*
     * Chunk counts describe our storage, not the owner's menu. Checked against
     * the response bodies rather than the whole file, because the same
     * expression is a legitimate RPC argument (`p_expected_chunks`).
     */
    const responses = ROUTE.match(/NextResponse\.json\(\{[\s\S]*?\}/g) ?? []
    for (const body of responses) {
      for (const leak of ['indexedChunks', 'maxChunks', 'chunks:']) {
        assert.equal(body.includes(leak), false, `response leaks ${leak}: ${body.slice(0, 80)}`)
      }
    }
    assert.match(ROUTE, /p_expected_chunks: chunks\.length/, 'still passed to activation')
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
