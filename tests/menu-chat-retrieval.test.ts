import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  MENU_CONTEXT_MAX_CHARS,
  MENU_QUERY_EMBEDDING_DIMENSIONS,
  MENU_QUERY_EMBEDDING_MODEL,
  MENU_RETRIEVAL_TOP_K,
  buildRetrievedMenuContext,
  embedMenuQuery,
  menuEvidenceSafetyRules,
  retrieveMenuContext,
  selectMenuPromptSources,
  type MenuQueryEmbeddingClient,
  type RetrievedMenuChunk,
} from '../lib/menu-retrieval.ts'

const MIGRATION = readFileSync(
  new URL('../supabase/migrations/027_menu_chat_retrieval.sql', import.meta.url),
  'utf8',
)
const SQL_CODE = MIGRATION.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
const SQL = SQL_CODE.replace(/\s+/g, ' ')
const ROUTE = readFileSync(
  new URL('../app/api/chat/route.ts', import.meta.url),
  'utf8',
)

const vector = () => Array(MENU_QUERY_EMBEDDING_DIMENSIONS).fill(0.01)

function embeddingClient(
  create: MenuQueryEmbeddingClient['embeddings']['create'],
): MenuQueryEmbeddingClient {
  return { embeddings: { create } }
}

function chunk(
  ordinal: number,
  content = `Dish ${ordinal} — $${ordinal + 10}`,
  overrides: Partial<RetrievedMenuChunk> = {},
): RetrievedMenuChunk {
  return {
    id: `chunk-${ordinal}`,
    document_id: 'doc-active',
    ordinal,
    section: 'Mains',
    content,
    similarity: 0.9 - ordinal / 100,
    ...overrides,
  }
}

describe('query embedding is one bounded request', () => {
  it('uses text-embedding-3-small at 1536 dimensions with SDK retries disabled', async () => {
    let seenArgs: unknown
    let seenOptions: { signal?: AbortSignal; maxRetries?: number } | undefined
    const client = embeddingClient(async (args, options) => {
      seenArgs = args
      seenOptions = options
      return { data: [{ embedding: vector() }] }
    })

    const result = await embedMenuQuery(client, '  peanut-free burger?  ')

    assert.equal(result.ok, true)
    assert.deepEqual(seenArgs, {
      model: MENU_QUERY_EMBEDDING_MODEL,
      input: 'peanut-free burger?',
      dimensions: 1536,
      encoding_format: 'float',
    })
    assert.equal(seenOptions?.maxRetries, 0)
    assert.ok(seenOptions?.signal instanceof AbortSignal)
  })

  it('rejects a malformed vector instead of sending it to Postgres', async () => {
    const client = embeddingClient(async () => ({
      data: [{ embedding: [1, 2] }],
    }))
    assert.deepEqual(await embedMenuQuery(client, 'burger'), {
      ok: false,
      reason: 'failed',
    })
  })

  it('aborts the real request at the timeout without retrying', async () => {
    let calls = 0
    const client = embeddingClient((_args, options) => {
      calls += 1
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    })
    assert.deepEqual(await embedMenuQuery(client, 'burger', 5), {
      ok: false,
      reason: 'timeout',
    })
    assert.equal(calls, 1)
  })
})

describe('retrieval fallback policy', () => {
  it('retrieves active-document chunks for the verified business', async () => {
    const calls: string[] = []
    const result = await retrieveMenuContext({
      client: embeddingClient(async () => ({ data: [{ embedding: vector() }] })),
      verifiedBusinessId: 'business-a',
      query: 'Do you have steak?',
      findActiveDocument: async (businessId) => {
        calls.push(`active:${businessId}`)
        return { id: 'doc-active' }
      },
      matchChunks: async ({ verifiedBusinessId, matchCount }) => {
        calls.push(`match:${verifiedBusinessId}:${matchCount}`)
        return [chunk(0, 'STEAK FRITES — $28')]
      },
    })

    assert.equal(result.kind, 'retrieved')
    if (result.kind !== 'retrieved') return
    assert.deepEqual(calls, ['active:business-a', 'match:business-a:8'])
    assert.match(result.context, /SECTION: Mains/)
    assert.match(result.context, /STEAK FRITES — \$28/)
  })

  it('uses the full legacy fallback when no active document exists', async () => {
    let embeddingCalled = false
    let rpcCalled = false
    const result = await retrieveMenuContext({
      client: embeddingClient(async () => {
        embeddingCalled = true
        return { data: [{ embedding: vector() }] }
      }),
      verifiedBusinessId: 'business-a',
      query: 'menu?',
      findActiveDocument: async () => null,
      matchChunks: async () => {
        rpcCalled = true
        return []
      },
    })
    assert.deepEqual(result, { kind: 'legacy', reason: 'no_active_document' })
    assert.equal(embeddingCalled, false)
    assert.equal(rpcCalled, false)
    assert.deepEqual(selectMenuPromptSources('FULL LEGACY MENU', result), {
      legacyMenuText: 'FULL LEGACY MENU',
      retrievedMenuContext: null,
    })
  })

  it('falls back when active-document lookup fails', async () => {
    const result = await retrieveMenuContext({
      client: embeddingClient(async () => ({ data: [{ embedding: vector() }] })),
      verifiedBusinessId: 'business-a',
      query: 'menu?',
      findActiveDocument: async () => {
        throw new Error('table unavailable')
      },
      matchChunks: async () => [chunk(0)],
    })
    assert.deepEqual(result, {
      kind: 'legacy',
      reason: 'active_document_lookup_failed',
    })
  })

  it('falls back when query embedding fails and never calls the RPC', async () => {
    let rpcCalled = false
    const result = await retrieveMenuContext({
      client: embeddingClient(async () => {
        throw new Error('embedding unavailable')
      }),
      verifiedBusinessId: 'business-a',
      query: 'menu?',
      findActiveDocument: async () => ({ id: 'doc-active' }),
      matchChunks: async () => {
        rpcCalled = true
        return [chunk(0)]
      },
    })
    assert.deepEqual(result, { kind: 'legacy', reason: 'embedding_failed' })
    assert.equal(rpcCalled, false)
  })

  it('falls back when the RPC fails', async () => {
    const result = await retrieveMenuContext({
      client: embeddingClient(async () => ({ data: [{ embedding: vector() }] })),
      verifiedBusinessId: 'business-a',
      query: 'menu?',
      findActiveDocument: async () => ({ id: 'doc-active' }),
      matchChunks: async () => {
        throw new Error('rpc unavailable')
      },
    })
    assert.deepEqual(result, { kind: 'legacy', reason: 'rpc_failed' })
  })

  it('falls back on an unexpectedly empty active-document result', async () => {
    const result = await retrieveMenuContext({
      client: embeddingClient(async () => ({ data: [{ embedding: vector() }] })),
      verifiedBusinessId: 'business-a',
      query: 'menu?',
      findActiveDocument: async () => ({ id: 'doc-active' }),
      matchChunks: async () => [],
    })
    assert.deepEqual(result, { kind: 'legacy', reason: 'empty_retrieval' })
  })

  it('successful retrieval excludes the full legacy menu', () => {
    assert.deepEqual(
      selectMenuPromptSources('FULL LEGACY MENU — SHOULD NOT APPEAR', {
        kind: 'retrieved',
        context: 'MENU EXCERPT\nBurger — $18',
        chunks: [chunk(0)],
      }),
      {
        legacyMenuText: null,
        retrievedMenuContext: 'MENU EXCERPT\nBurger — $18',
      },
    )
  })
})

describe('Top-K and prompt budget', () => {
  it('defaults to eight chunks and never expands to lower-ranked rows', () => {
    const result = buildRetrievedMenuContext(
      Array.from({ length: 12 }, (_, index) => chunk(index)),
    )
    assert.equal(MENU_RETRIEVAL_TOP_K, 8)
    assert.equal(result.chunks.length, 8)
    assert.deepEqual(result.chunks.map((c) => c.ordinal), [0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('keeps whole section/content blocks inside the hard 6000-char budget', () => {
    const result = buildRetrievedMenuContext([
      chunk(0, 'A'.repeat(3_000), { section: 'First' }),
      chunk(1, 'B'.repeat(3_000), { section: 'Second' }),
      chunk(2, 'C', { section: 'Third' }),
    ])
    assert.equal(MENU_CONTEXT_MAX_CHARS, 6_000)
    assert.ok(result.context.length <= MENU_CONTEXT_MAX_CHARS)
    assert.deepEqual(result.chunks.map((c) => c.ordinal), [0])
    assert.match(result.context, /SECTION: First/)
    assert.match(result.context, /A{100}/)
    assert.doesNotMatch(result.context, /SECTION: Second|SECTION: Third/)
  })

  it('deduplicates by chunk id or document ordinal', () => {
    const result = buildRetrievedMenuContext([
      chunk(0, 'first'),
      chunk(1, 'same id', { id: 'chunk-0' }),
      chunk(0, 'same ordinal', { id: 'another-id' }),
      chunk(2, 'unique'),
    ])
    assert.deepEqual(result.chunks.map((c) => c.content), ['first', 'unique'])
  })

  it('never puts similarity, ids or ordinals into model-visible context', () => {
    const result = buildRetrievedMenuContext([
      chunk(7, 'Burger — $18', {
        id: 'private-chunk-id',
        document_id: 'private-document-id',
        similarity: 0.123456,
      }),
    ])
    assert.doesNotMatch(result.context, /private-chunk-id|private-document-id|0\.123456|ordinal/i)
  })
})

describe('partial-menu and allergy safety', () => {
  const rules = menuEvidenceSafetyRules(true)

  it('states that retrieved context is partial and absence is not proof', () => {
    assert.match(rules, /partial Top-K view/i)
    assert.match(rules, /Absence .* NEVER proof/i)
  })

  it('cannot infer safe or allergen-free from missing evidence', () => {
    assert.match(rules, /Never call a dish safe, allergen-free/i)
    assert.match(rules, /missing allergen name is not confirmation/i)
    assert.match(rules, /must check with restaurant staff/i)
    assert.match(rules, /cross-contamination/i)
  })

  it('turns unsupported negative menu facts into uncertainty, not No', () => {
    assert.match(rules, /could not confirm/i)
    assert.match(rules, /Never answer "No" merely because X is missing/i)
  })
})

describe('migration 027 exact tenant-isolated search', () => {
  it('is additive, transactional and creates no approximate index', () => {
    assert.match(MIGRATION, /^\s*--[\s\S]*\nbegin;/)
    assert.match(MIGRATION, /commit;\s*$/)
    assert.doesNotMatch(SQL_CODE, /create\s+index|alter\s+table|drop\s+/i)
    assert.doesNotMatch(SQL_CODE, /hnsw|ivfflat/i)
  })

  it('uses exact cosine distance and returns similarity only as metadata', () => {
    assert.match(SQL, /1 - \(chunks\.embedding <=> p_query_embedding\) as similarity/)
    assert.match(SQL, /order by chunks\.embedding <=> p_query_embedding, chunks\.ordinal/)
    const whereClause = SQL.slice(
      SQL.indexOf('where chunks.business_id'),
      SQL.indexOf('order by chunks.embedding'),
    )
    assert.doesNotMatch(whereClause, /similarity|<=>|threshold|min_score/i)
  })

  it('returns chunks only from the active document of the requested business', () => {
    assert.match(SQL, /documents\.id = chunks\.document_id/)
    assert.match(SQL, /documents\.business_id = chunks\.business_id/)
    assert.match(SQL, /where chunks\.business_id = p_business_id/)
    assert.match(SQL, /and documents\.business_id = p_business_id/)
    assert.match(SQL, /and documents\.status = 'active'/)
  })

  it('therefore ignores superseded, failed and indexing documents', () => {
    const statusPredicates = SQL.match(/documents\.status\s*=\s*'[^']+'/g) ?? []
    assert.deepEqual(statusPredicates, ["documents.status = 'active'"])
    for (const forbidden of ['superseded', 'failed', 'indexing']) {
      assert.equal(statusPredicates.some((p) => p.includes(forbidden)), false)
    }
  })

  it('defaults to Top 8 without a hard similarity threshold', () => {
    assert.match(SQL, /p_match_count integer default 8/)
    assert.match(SQL, /coalesce\(p_match_count, 8\)/)
    assert.doesNotMatch(SQL, /p_(similarity|threshold|min_score)/i)
  })

  it('is SECURITY INVOKER with an explicit search_path', () => {
    assert.match(SQL, /language sql stable security invoker set search_path = public, extensions/)
    assert.doesNotMatch(SQL_CODE, /security definer/i)
  })

  it('is executable only by service_role', () => {
    for (const role of ['public', 'anon', 'authenticated']) {
      assert.match(
        SQL,
        new RegExp(
          `revoke all on function public\\.match_menu_chunks\\(uuid, extensions\\.vector, integer\\) from ${role}`,
        ),
      )
    }
    assert.match(
      SQL,
      /grant execute on function public\.match_menu_chunks\(uuid, extensions\.vector, integer\) to service_role/,
    )
  })
})

describe('chat route integration stays isolated and backward-compatible', () => {
  it('runs retrieval after every existing chat rate limit', () => {
    const retrieval = ROUTE.indexOf('const menuRetrieval = await retrieveMenuContext')
    for (const gate of ['ipLimit', 'bizLimit', 'globalBudget']) {
      const at = ROUTE.indexOf(`const ${gate} = await checkRateLimit`)
      assert.ok(at >= 0 && at < retrieval, `${gate} must precede retrieval`)
    }
    assert.equal((ROUTE.match(/retrieveMenuContext\(/g) ?? []).length, 1)
  })

  it('has no route-level tenant escape', () => {
    assert.match(ROUTE, /verifiedBusinessId: business\.id/)
    assert.match(ROUTE, /\.eq\("business_id", verifiedBusinessId\)/)
    assert.match(ROUTE, /p_business_id: verifiedBusinessId/)
    assert.match(ROUTE, /\.eq\("status", "active"\)/)
    assert.doesNotMatch(ROUTE, /verifiedBusinessId: business_id/)
  })

  it('never includes full legacy text together with retrieved context', () => {
    assert.match(ROUTE, /if \(hasRetrievedMenuContext\) \{[\s\S]*?\} else if \(menuPdfText\?\.trim\(\)\) \{/)
    assert.match(ROUTE, /menuPromptSources\.legacyMenuText/)
    assert.match(ROUTE, /menuPromptSources\.retrievedMenuContext/)
  })

  it('keeps structured services as a separate menu source', () => {
    assert.match(ROUTE, /\.from\("services"\)/)
    assert.match(ROUTE, /MENU:\\n\$\{lines\.join\("\\n"\)\}/)
  })

  it('keeps booking tools and all five tool rounds after prompt construction', () => {
    const prompt = ROUTE.indexOf('let systemPrompt = buildSystemPrompt')
    const messages = ROUTE.indexOf('const convoMessages: ChatCompletionMessageParam[]')
    const rounds = ROUTE.indexOf('const MAX_TOOL_ROUNDS = 5')
    const completion = ROUTE.indexOf('openai.chat.completions.create')
    assert.ok(prompt >= 0 && prompt < messages && messages < rounds && rounds < completion)
    assert.match(ROUTE, /tools: isLastRound \? undefined : BOOKING_TOOLS/)
    assert.match(ROUTE, /for \(const call of toolCalls\)/)
  })

  it('logs no menu text, query embedding, vector or API key', () => {
    const retrievalBlock = ROUTE.slice(
      ROUTE.indexOf('const menuRetrieval = await retrieveMenuContext'),
      ROUTE.indexOf('// ── Resolve (or create) conversation'),
    )
    assert.doesNotMatch(retrievalBlock, /console\./)
    const lib = readFileSync(new URL('../lib/menu-retrieval.ts', import.meta.url), 'utf8')
    assert.doesNotMatch(lib, /console\./)
  })
})
