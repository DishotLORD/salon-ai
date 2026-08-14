import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'

import {
  CHAT_BUSINESS_RATE_LIMIT,
  CHAT_GLOBAL_KEY,
  CHAT_GLOBAL_RATE_LIMIT,
  CHAT_GLOBAL_WINDOW_MS,
  CHAT_IP_RATE_LIMIT,
  CHAT_RATE_WINDOW_MS,
  chatBusinessRateLimitKey,
  chatIpRateLimitKey,
  isWellFormedBusinessId,
} from '../lib/chat-rate-limit.ts'
import {
  MEMORY_MAX_BUCKETS,
  UNKNOWN_CLIENT_IP,
  UPSTASH_TIMEOUT_MS,
  checkRateLimit,
  checkRateLimitMemory,
  distributedRateLimitConfigured,
  getClientIp,
  parseRateLimitScriptResult,
  pruneBuckets,
  type Bucket,
} from '../lib/rate-limit.ts'
import {
  WIDGET_META_LIVE_CACHE_CONTROL,
  WIDGET_META_LIVE_IP_RATE_LIMIT,
  WIDGET_META_LIVE_RATE_WINDOW_MS,
  widgetMetaLiveRateLimitKey,
} from '../lib/widget-meta-cache.ts'

const CHAT_SOURCE = readFileSync(
  new URL('../app/api/chat/route.ts', import.meta.url),
  'utf8',
)
const META_SOURCE = readFileSync(
  new URL('../app/api/widget/meta/route.ts', import.meta.url),
  'utf8',
)

/** Where a landmark first appears in the route source. -1 when absent. */
function at(source: string, pattern: RegExp): number {
  return source.search(pattern)
}

// ─────────────────────────────────────────────────────────────────────────────

describe('/api/chat runs its ceilings before it does any work', () => {
  const globalCheck = at(CHAT_SOURCE, /checkRateLimit\(\s*\n?\s*CHAT_GLOBAL_KEY/)
  const ipCheck = at(CHAT_SOURCE, /chatIpRateLimitKey\(clientIp\)/)
  const bodyParse = at(CHAT_SOURCE, /await request\.json\(\)/)
  const sanitize = at(CHAT_SOURCE, /sanitizeIncomingMessages\(body\.messages\)/)
  const ownerCheck = at(CHAT_SOURCE, /verifyBusinessOwner\(business_id\)/)
  const businessLoad = at(CHAT_SOURCE, /\/\/ ── Fetch business/)
  const bizCheck = at(CHAT_SOURCE, /chatBusinessRateLimitKey\(business\.id\)/)
  const conversationInsert = at(CHAT_SOURCE, /\.from\("conversations"\)\s*\n?\s*\.insert/)
  const openAiCall = at(CHAT_SOURCE, /openai\.chat\.completions\.create/)

  it('every landmark exists', () => {
    for (const [name, index] of Object.entries({
      globalCheck,
      ipCheck,
      bodyParse,
      sanitize,
      ownerCheck,
      businessLoad,
      bizCheck,
      conversationInsert,
      openAiCall,
    })) {
      assert.ok(index >= 0, `${name} not found in the route`)
    }
  })

  it('the global budget is checked before the body is parsed', () => {
    // Parsing a body for a request that is about to be refused is work an
    // attacker gets for free.
    assert.ok(globalCheck < bodyParse)
  })

  it('the per-IP ceiling is checked before the body is parsed', () => {
    assert.ok(ipCheck < bodyParse)
  })

  it('the per-IP ceiling is checked before the global budget', () => {
    /*
     * Not cosmetic. With the global budget first, every request spends from it
     * before anyone asks whether this caller is still welcome: one address
     * could send the entire platform allowance in a window, have its own bucket
     * refuse all but the first CHAT_IP_RATE_LIMIT of them, and still have
     * incremented the shared counter CHAT_GLOBAL_RATE_LIMIT times. The 429 then
     * lands on guests at every other restaurant — a budget meant to bound
     * spending turned into a denial-of-service lever. Personal bucket first,
     * and a caller past its own limit stops consuming shared capacity.
     */
    assert.ok(ipCheck < globalCheck)
  })

  it('both ceilings precede sanitization and the owner check', () => {
    assert.ok(ipCheck < sanitize)
    // `from_dashboard` used to buy an anonymous caller a Supabase Auth round
    // trip ahead of any limiter.
    assert.ok(ipCheck < ownerCheck)
  })

  it('the global budget is still checked before the body is parsed', () => {
    assert.ok(globalCheck < bodyParse)
  })

  it('a refused request reaches no conversation insert and no model call', () => {
    assert.ok(globalCheck < conversationInsert)
    assert.ok(ipCheck < conversationInsert)
    assert.ok(globalCheck < openAiCall)
    assert.ok(ipCheck < openAiCall)
  })

  it('the business bucket comes after the business has been loaded', () => {
    assert.ok(businessLoad < bizCheck)
  })

  it('the business bucket still precedes the writes and the model call', () => {
    assert.ok(bizCheck < conversationInsert)
    assert.ok(bizCheck < openAiCall)
  })
})

describe('one exhausted address cannot spend the platform budget', () => {
  /**
   * The route's two early gates, run against an injected store so the whole
   * question can be settled in microseconds instead of 1200 real requests.
   * `order` is the only variable — everything else matches the route.
   */
  function gate(
    store: Map<string, Bucket>,
    ip: string,
    order: 'ip-first' | 'global-first',
    now = 1_000,
  ): 'allowed' | 'ip_429' | 'global_429' {
    const ipGate = () =>
      checkRateLimitMemory(
        chatIpRateLimitKey(ip),
        CHAT_IP_RATE_LIMIT,
        CHAT_RATE_WINDOW_MS,
        now,
        store,
      ).allowed
    const globalGate = () =>
      checkRateLimitMemory(
        CHAT_GLOBAL_KEY,
        CHAT_GLOBAL_RATE_LIMIT,
        CHAT_GLOBAL_WINDOW_MS,
        now,
        store,
      ).allowed

    if (order === 'ip-first') {
      if (!ipGate()) return 'ip_429'
      return globalGate() ? 'allowed' : 'global_429'
    }
    if (!globalGate()) return 'global_429'
    return ipGate() ? 'allowed' : 'ip_429'
  }

  const globalCount = (store: Map<string, Bucket>) => store.get(CHAT_GLOBAL_KEY)?.count ?? 0

  it('a single address stops consuming shared capacity once its own bucket is full', () => {
    const store = new Map<string, Bucket>()
    const flood = CHAT_IP_RATE_LIMIT * 10
    for (let i = 0; i < flood; i++) gate(store, '198.51.100.1', 'ip-first')

    // It spent exactly its own allowance and not one request more.
    assert.equal(globalCount(store), CHAT_IP_RATE_LIMIT)
    assert.ok(globalCount(store) < CHAT_GLOBAL_RATE_LIMIT)
  })

  it('the old order let that same address spend the entire platform budget', () => {
    // The finding, pinned. Delete the reordering and this is what comes back.
    const store = new Map<string, Bucket>()
    for (let i = 0; i < CHAT_GLOBAL_RATE_LIMIT; i++) {
      gate(store, '198.51.100.1', 'global-first')
    }
    assert.equal(globalCount(store), CHAT_GLOBAL_RATE_LIMIT)

    // And an unrelated guest at another restaurant is now refused by a budget
    // they never touched.
    assert.equal(gate(store, '203.0.113.222', 'global-first'), 'global_429')
  })

  it('under the corrected order that unrelated guest is served', () => {
    const store = new Map<string, Bucket>()
    for (let i = 0; i < CHAT_GLOBAL_RATE_LIMIT; i++) {
      gate(store, '198.51.100.1', 'ip-first')
    }
    assert.equal(gate(store, '203.0.113.222', 'ip-first'), 'allowed')
  })

  it('fresh addresses still reach the global bucket and still exhaust it', () => {
    // The case the budget exists for: every new IP passes its own empty bucket
    // and then meets the one ceiling that does not care who is calling.
    const store = new Map<string, Bucket>()
    let allowed = 0
    let globalRefusals = 0
    for (let i = 0; i < CHAT_GLOBAL_RATE_LIMIT + 50; i++) {
      const outcome = gate(store, `10.0.${Math.floor(i / 250)}.${i % 250}`, 'ip-first')
      if (outcome === 'allowed') allowed += 1
      if (outcome === 'global_429') globalRefusals += 1
    }
    assert.equal(allowed, CHAT_GLOBAL_RATE_LIMIT)
    assert.equal(globalRefusals, 50)
  })

  it('each address keeps its own allowance below the global ceiling', () => {
    const store = new Map<string, Bucket>()
    for (const ip of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      for (let i = 0; i < CHAT_IP_RATE_LIMIT; i++) {
        assert.equal(gate(store, ip, 'ip-first'), 'allowed', ip)
      }
      assert.equal(gate(store, ip, 'ip-first'), 'ip_429', ip)
    }
    // Three exhausted addresses spent three allowances, not three budgets.
    assert.equal(globalCount(store), CHAT_IP_RATE_LIMIT * 3)
  })
})

describe('an unverified business id cannot mint a rate-limit key', () => {
  it('the route keys the business bucket on the loaded row, not the request', () => {
    assert.match(CHAT_SOURCE, /chatBusinessRateLimitKey\(business\.id\)/)
  })

  it('no interpolated chat:biz key is built anywhere in the route', () => {
    // The exact shape of the old bug: `chat:biz:${business_id}`.
    assert.doesNotMatch(CHAT_SOURCE, /`chat:biz:\$\{/)
    assert.doesNotMatch(CHAT_SOURCE, /chatBusinessRateLimitKey\(business_id\)/)
  })

  it('an arbitrary string is refused before Postgres is asked', () => {
    for (const raw of ['', '   ', 'not-a-uuid', '../../etc/passwd', 'x'.repeat(5000)]) {
      assert.equal(isWellFormedBusinessId(raw), false, JSON.stringify(raw.slice(0, 20)))
    }
  })

  it('a syntactically valid UUID passes the shape check but proves nothing', () => {
    // Valid UUIDs are free to generate, which is why the shape check is a cheap
    // rejection and the *key* is bound to a loaded row instead.
    const invented = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    assert.equal(isWellFormedBusinessId(invented), true)
    // Reaching a key at all requires a row: the only call site passes business.id.
    const keyCallSites = CHAT_SOURCE.match(/chatBusinessRateLimitKey\([^)]*\)/g) ?? []
    assert.deepEqual(keyCallSites, ['chatBusinessRateLimitKey(business.id)'])
  })

  it('a nonexistent business is answered 404 before its bucket exists', () => {
    const notFound = at(CHAT_SOURCE, /"Business not found"/)
    const bizCheck = at(CHAT_SOURCE, /chatBusinessRateLimitKey\(business\.id\)/)
    assert.ok(notFound >= 0 && notFound < bizCheck)
  })
})

describe('the platform budget', () => {
  it('has a constant key that no input can influence', () => {
    assert.equal(CHAT_GLOBAL_KEY, 'chat:global')
    assert.doesNotMatch(CHAT_GLOBAL_KEY, /\$\{|\+/)
  })

  it('is a real ceiling but sits well above the per-IP allowance', () => {
    assert.ok(CHAT_GLOBAL_RATE_LIMIT > CHAT_IP_RATE_LIMIT)
    assert.ok(CHAT_GLOBAL_RATE_LIMIT > CHAT_BUSINESS_RATE_LIMIT)
    assert.ok(Number.isInteger(CHAT_GLOBAL_RATE_LIMIT) && CHAT_GLOBAL_RATE_LIMIT > 0)
    assert.equal(CHAT_GLOBAL_WINDOW_MS, 60_000)
  })

  it('refuses with 429 and a Retry-After, saying nothing about internals', () => {
    const block = CHAT_SOURCE.slice(
      at(CHAT_SOURCE, /globalBudget\.allowed/),
      at(CHAT_SOURCE, /globalBudget\.allowed/) + 400,
    )
    assert.match(block, /status: 429/)
    assert.match(block, /"Retry-After": String\(globalBudget\.retryAfterSec \?\? 60\)/)
    assert.match(block, /Too many requests\. Please try again shortly\./)
    assert.doesNotMatch(block, /upstash|redis|chat:global/i)
  })

  it('operates alongside the other two ceilings, not instead of them', () => {
    assert.match(CHAT_SOURCE, /CHAT_GLOBAL_KEY/)
    assert.match(CHAT_SOURCE, /chatIpRateLimitKey\(clientIp\)/)
    assert.match(CHAT_SOURCE, /chatBusinessRateLimitKey\(business\.id\)/)
  })

  it('builds the other keys in their own namespaces', () => {
    assert.equal(chatIpRateLimitKey('203.0.113.7'), 'chat:ip:203.0.113.7')
    assert.equal(chatBusinessRateLimitKey('abc'), 'chat:biz:abc')
    assert.equal(CHAT_RATE_WINDOW_MS, 60_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the distributed reply is only trusted when it is intelligible', () => {
  const LIMIT = 10
  const WINDOW = 60_000

  it('a count within the limit allows', () => {
    assert.deepEqual(parseRateLimitScriptResult({ result: [3, 45_000] }, LIMIT, WINDOW), {
      allowed: true,
    })
  })

  it('a count over the limit refuses, with Retry-After from the TTL', () => {
    assert.deepEqual(parseRateLimitScriptResult({ result: [11, 30_000] }, LIMIT, WINDOW), {
      allowed: false,
      retryAfterSec: 30,
    })
  })

  it('the boundary count is still allowed', () => {
    assert.deepEqual(parseRateLimitScriptResult({ result: [10, 1_000] }, LIMIT, WINDOW), {
      allowed: true,
    })
  })

  it('a command-level Redis error is not read as a count', () => {
    // Upstash returns per-command errors inside an HTTP 200; treating one as a
    // result would let every request through.
    assert.deepEqual(
      parseRateLimitScriptResult({ error: 'ERR value is not an integer' }, LIMIT, WINDOW),
      { skip: 'redis_error' },
    )
  })

  it('a malformed payload is unusable rather than optimistic', () => {
    for (const payload of [
      null,
      'nope',
      {},
      { result: null },
      { result: [] },
      { result: [1] },
      { result: ['x', 'y'] },
      { result: [0, 100] },
    ]) {
      const out = parseRateLimitScriptResult(payload, LIMIT, WINDOW)
      assert.deepEqual(out, { skip: 'malformed_response' }, JSON.stringify(payload))
    }
  })

  it('a broken TTL on a refused counter falls back to the window, never unbounded', () => {
    // The script repairs a missing expiry server-side; this is the second belt,
    // so a nonsense TTL cannot become a Retry-After of NaN or of a year.
    for (const ttl of [-1, 0, Number.NaN, 'oops']) {
      const out = parseRateLimitScriptResult({ result: [99, ttl] }, LIMIT, WINDOW)
      assert.deepEqual(out, { allowed: false, retryAfterSec: 60 }, String(ttl))
    }
  })

  it('the script sets an expiry on creation and repairs a lost one', () => {
    const lib = readFileSync(new URL('../lib/rate-limit.ts', import.meta.url), 'utf8')
    assert.match(lib, /if count == 1 then\s*\n\s*redis\.call\('PEXPIRE'/)
    // An immortal counter — incremented but never expiring — is a permanent
    // block on whoever owns that key.
    assert.match(lib, /if ttl < 0 then\s*\n\s*redis\.call\('PEXPIRE'/)
    assert.match(lib, /return \{count, ttl\}/)
  })

  it('the whole decision is one atomic EVAL, not a pipeline', () => {
    const lib = readFileSync(new URL('../lib/rate-limit.ts', import.meta.url), 'utf8')
    assert.match(lib, /'EVAL', RATE_LIMIT_SCRIPT, 1/)
    // Not the old three-command pipeline: its parts could fail independently.
    const code = lib.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(code, /\/pipeline/)
    assert.doesNotMatch(code, /\['INCR'|\['PEXPIRE'|\['PTTL'/)
  })

  it('the network call is bounded by an abort timeout', () => {
    const lib = readFileSync(new URL('../lib/rate-limit.ts', import.meta.url), 'utf8')
    assert.match(lib, /signal: AbortSignal\.timeout\(UPSTASH_TIMEOUT_MS\)/)
    assert.ok(UPSTASH_TIMEOUT_MS > 0 && UPSTASH_TIMEOUT_MS <= 3_000)
  })

  it('no log line can carry the URL or the token', () => {
    const lib = readFileSync(new URL('../lib/rate-limit.ts', import.meta.url), 'utf8')
    for (const line of lib.split('\n').filter((l) => /console\./.test(l))) {
      assert.doesNotMatch(line, /url|token|Authorization|Bearer/i, line.trim())
    }
  })
})

describe('the backend is chosen by configuration and degrades to memory', () => {
  const URL_VAR = 'UPSTASH_REDIS_REST_URL'
  const TOKEN_VAR = 'UPSTASH_REDIS_REST_TOKEN'
  const realFetch = globalThis.fetch
  const saved = { url: process.env[URL_VAR], token: process.env[TOKEN_VAR] }

  const restore = () => {
    globalThis.fetch = realFetch
    if (saved.url === undefined) delete process.env[URL_VAR]
    else process.env[URL_VAR] = saved.url
    if (saved.token === undefined) delete process.env[TOKEN_VAR]
    else process.env[TOKEN_VAR] = saved.token
  }
  afterEach(restore)

  const configure = () => {
    // Not a credential: a syntactically valid placeholder that never resolves,
    // because every test below replaces fetch.
    process.env[URL_VAR] = 'https://redis.invalid'
    process.env[TOKEN_VAR] = 'placeholder-not-a-real-token'
  }

  const stubFetch = (impl: () => Promise<unknown>) => {
    globalThis.fetch = (async () => impl()) as unknown as typeof fetch
  }

  it('reports itself configured only when both variables are present', () => {
    // The truth table /api/health reports. A URL without a token is the state
    // that matters: the limiter falls back to memory, so a probe claiming
    // otherwise would make post-deploy verification worthless.
    const cases: [string | undefined, string | undefined, boolean][] = [
      [undefined, undefined, false],
      ['https://redis.invalid', undefined, false],
      [undefined, 'placeholder-not-a-real-token', false],
      ['   ', 'placeholder-not-a-real-token', false],
      ['https://redis.invalid', '   ', false],
      ['https://redis.invalid', 'placeholder-not-a-real-token', true],
    ]
    for (const [url, token, expected] of cases) {
      if (url === undefined) delete process.env[URL_VAR]
      else process.env[URL_VAR] = url
      if (token === undefined) delete process.env[TOKEN_VAR]
      else process.env[TOKEN_VAR] = token
      assert.equal(
        distributedRateLimitConfigured(),
        expected,
        `url=${url === undefined ? 'unset' : JSON.stringify(url)} token=${token === undefined ? 'unset' : 'set'}`,
      )
    }
  })

  it('/api/health asks the limiter instead of re-deriving the answer', () => {
    const health = readFileSync(
      new URL('../app/api/health/route.ts', import.meta.url),
      'utf8',
    )
    assert.match(health, /distributed_rate_limit: distributedRateLimitConfigured\(\)/)
    assert.match(health, /from '@\/lib\/rate-limit'/)
    // The duplicated check that only looked at the URL is what made a
    // token-less deployment report a distributed limiter it did not have.
    assert.doesNotMatch(health, /UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN/)
  })

  it('/api/health still reports a plain boolean and no values', () => {
    const health = readFileSync(
      new URL('../app/api/health/route.ts', import.meta.url),
      'utf8',
    )
    for (const line of health.split('\n').filter((l) => /distributed_rate_limit/.test(l))) {
      assert.doesNotMatch(line, /process\.env/, line.trim())
    }
    assert.equal(typeof distributedRateLimitConfigured(), 'boolean')
  })

  it('never calls the network when unconfigured', async () => {
    delete process.env[URL_VAR]
    delete process.env[TOKEN_VAR]
    let called = 0
    stubFetch(async () => {
      called += 1
      return new Response('{}')
    })
    const out = await checkRateLimit(`memory-only-${Date.now()}`, 5, 60_000)
    assert.equal(called, 0)
    assert.equal(out.allowed, true)
  })

  it('uses the distributed answer when the backend responds', async () => {
    configure()
    stubFetch(async () => new Response(JSON.stringify({ result: [99, 30_000] })))
    const out = await checkRateLimit(`distributed-${Date.now()}`, 5, 60_000)
    // Memory would have allowed a first request; the distributed count did not.
    assert.equal(out.allowed, false)
    assert.equal(out.retryAfterSec, 30)
  })

  it('a timeout falls back to memory instead of throwing', async () => {
    configure()
    stubFetch(async () => {
      const err = new Error('timed out')
      err.name = 'TimeoutError'
      throw err
    })
    const out = await checkRateLimit(`timeout-${Date.now()}`, 5, 60_000)
    assert.equal(out.allowed, true, 'a dead limiter must not take the endpoint down')
  })

  it('a network error falls back to memory instead of throwing', async () => {
    configure()
    stubFetch(async () => {
      throw new TypeError('fetch failed')
    })
    const out = await checkRateLimit(`neterr-${Date.now()}`, 5, 60_000)
    assert.equal(out.allowed, true)
  })

  it('a non-2xx response falls back to memory', async () => {
    configure()
    stubFetch(async () => new Response('nope', { status: 500 }))
    const out = await checkRateLimit(`http500-${Date.now()}`, 5, 60_000)
    assert.equal(out.allowed, true)
  })

  it('an unparseable body falls back to memory', async () => {
    configure()
    stubFetch(async () => new Response('<html>not json</html>', { status: 200 }))
    const out = await checkRateLimit(`badbody-${Date.now()}`, 5, 60_000)
    assert.equal(out.allowed, true)
  })

  it('a command-level error falls back rather than allowing blindly', async () => {
    configure()
    stubFetch(async () => new Response(JSON.stringify({ error: 'NOSCRIPT' }), { status: 200 }))
    const key = `cmderr-${Date.now()}`
    // Falls back to memory, so the first call is allowed — but by the memory
    // bucket, which still counts, rather than by an unread error.
    for (let i = 0; i < 5; i++) assert.equal((await checkRateLimit(key, 5, 60_000)).allowed, true)
    assert.equal((await checkRateLimit(key, 5, 60_000)).allowed, false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the in-memory fallback cannot grow without bound', () => {
  it('drops an expired bucket when it is swept', () => {
    const store = new Map<string, Bucket>([
      ['live', { count: 1, resetAt: 5_000 }],
      ['dead', { count: 1, resetAt: 500 }],
    ])
    assert.equal(pruneBuckets(store, 1_000), 1)
    assert.deepEqual([...store.keys()], ['live'])
  })

  it('attacker-generated keys do not accumulate after their windows close', () => {
    // The old map only ever replaced a key when the same key came back, so a
    // caller mixing request text into its key grew it until the instance died.
    const store = new Map<string, Bucket>()
    for (let i = 0; i < 5_000; i++) {
      store.set(`chat:biz:${i}-${'x'.repeat(40)}`, { count: 1, resetAt: 1_000 })
    }
    assert.equal(store.size, 5_000)
    const removed = pruneBuckets(store, 60_000)
    assert.equal(removed, 5_000)
    assert.equal(store.size, 0)
  })

  it('enforces a ceiling even when every bucket is still live', () => {
    const store = new Map<string, Bucket>()
    for (let i = 0; i < MEMORY_MAX_BUCKETS + 250; i++) {
      store.set(`k${i}`, { count: 1, resetAt: 10_000 + i })
    }
    pruneBuckets(store, 0)
    assert.equal(store.size, MEMORY_MAX_BUCKETS)
    // Soonest-to-expire evicted first: losing those forgives the least.
    assert.equal(store.has('k0'), false)
    assert.equal(store.has(`k${MEMORY_MAX_BUCKETS + 249}`), true)
  })

  it('a live bucket is never dropped by an ordinary sweep', () => {
    const store = new Map<string, Bucket>([['live', { count: 7, resetAt: 9_999 }]])
    assert.equal(pruneBuckets(store, 1_000), 0)
    assert.equal(store.get('live')?.count, 7)
  })

  it('counts within a window and refuses past the limit', () => {
    const store = new Map<string, Bucket>()
    const opts = [3, 60_000, 1_000, store] as const
    assert.equal(checkRateLimitMemory('k', ...opts).allowed, true)
    assert.equal(checkRateLimitMemory('k', ...opts).allowed, true)
    assert.equal(checkRateLimitMemory('k', ...opts).allowed, true)
    const refused = checkRateLimitMemory('k', ...opts)
    assert.equal(refused.allowed, false)
    assert.equal(refused.retryAfterSec, 60)
  })

  it('a new window replaces the old bucket rather than leaving it behind', () => {
    const store = new Map<string, Bucket>()
    checkRateLimitMemory('k', 1, 60_000, 1_000, store)
    assert.equal(checkRateLimitMemory('k', 1, 60_000, 1_000, store).allowed, false)
    assert.equal(checkRateLimitMemory('k', 1, 60_000, 70_000, store).allowed, true)
    assert.equal(store.size, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('the client address comes from the headers Vercel controls', () => {
  const req = (headers: Record<string, string>) =>
    new Request('https://example.test/', { headers })

  it('prefers the Vercel header when present', () => {
    // Vercel's own header survives a proxy placed in front of the platform,
    // where x-forwarded-for might not.
    assert.equal(
      getClientIp(
        req({
          'x-vercel-forwarded-for': '203.0.113.9',
          'x-forwarded-for': '198.51.100.4',
          'x-real-ip': '192.0.2.5',
        }),
      ),
      '203.0.113.9',
    )
  })

  it('falls back to x-forwarded-for', () => {
    assert.equal(getClientIp(req({ 'x-forwarded-for': '198.51.100.4' })), '198.51.100.4')
  })

  it('falls back to x-real-ip last', () => {
    assert.equal(getClientIp(req({ 'x-real-ip': '192.0.2.5' })), '192.0.2.5')
  })

  it('takes the leftmost entry of a chain', () => {
    assert.equal(
      getClientIp(req({ 'x-forwarded-for': '203.0.113.9, 70.41.3.18, 150.172.238.178' })),
      '203.0.113.9',
    )
  })

  it('skips an empty header instead of returning a blank key', () => {
    assert.equal(
      getClientIp(req({ 'x-vercel-forwarded-for': '', 'x-forwarded-for': '198.51.100.4' })),
      '198.51.100.4',
    )
    assert.equal(getClientIp(req({ 'x-forwarded-for': '  ,  ' })), UNKNOWN_CLIENT_IP)
  })

  it('is deterministic when there is no address at all', () => {
    // `next dev` and direct container hits land here. One shared bucket, not a
    // fresh random one per request — that would be no limit whatsoever.
    assert.equal(getClientIp(req({})), UNKNOWN_CLIENT_IP)
    assert.equal(getClientIp(req({})), getClientIp(req({})))
  })

  it('trusts no other header', () => {
    assert.equal(
      getClientIp(req({ 'client-ip': '203.0.113.9', 'true-client-ip': '203.0.113.9' })),
      UNKNOWN_CLIENT_IP,
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('only the live widget-readiness mode is metered', () => {
  const limiterIndex = at(META_SOURCE, /widgetMetaLiveRateLimitKey\(getClientIp\(request\)\)/)

  it('the limiter is inside the live-mode branch, not on every request', () => {
    assert.ok(limiterIndex >= 0)
    const guard = at(META_SOURCE, /if \(isLiveReadinessRequest\(readinessParam\)\)/)
    assert.ok(guard >= 0 && guard < limiterIndex)
  })

  it('the cached branding request reaches no limiter', () => {
    // The default mode is answered by the CDN for a minute, so repeating it
    // costs nothing to serve; throttling it would only hit the venue's guests.
    const branch = META_SOURCE.slice(
      at(META_SOURCE, /if \(isLiveReadinessRequest\(readinessParam\)\)/),
      at(META_SOURCE, /if \(!id\)/),
    )
    const limiterCalls = META_SOURCE.match(/checkRateLimit\(/g) ?? []
    assert.equal(limiterCalls.length, 1, 'exactly one limiter, and it is the live one')
    assert.match(branch, /checkRateLimit\(/)
  })

  it('the limiter precedes every database read', () => {
    const firstQuery = at(META_SOURCE, /supabaseAdmin\s*\n?\s*\.from\('businesses'\)/)
    const readiness = at(META_SOURCE, /loadBusinessReadiness\(supabaseAdmin, id\)/)
    assert.ok(limiterIndex < firstQuery)
    assert.ok(limiterIndex < readiness)
  })

  it('the 429 keeps CORS, so a cross-origin caller can read the refusal', () => {
    const block = META_SOURCE.slice(limiterIndex, limiterIndex + 700)
    assert.match(block, /status: 429/)
    assert.match(block, /\.\.\.CORS_HEADERS/)
  })

  it('the 429 is never cached', () => {
    // A cached refusal would lock out whichever guest arrives next.
    const block = META_SOURCE.slice(limiterIndex, limiterIndex + 700)
    assert.match(block, /'Cache-Control': WIDGET_META_LIVE_CACHE_CONTROL/)
    assert.match(WIDGET_META_LIVE_CACHE_CONTROL, /no-store/)
  })

  it('the 429 carries Retry-After', () => {
    const block = META_SOURCE.slice(limiterIndex, limiterIndex + 700)
    assert.match(block, /'Retry-After': String\(live\.retryAfterSec \?\? 60\)/)
  })

  it('an allowed live response keeps its no-store contract from PR #15', () => {
    assert.match(META_SOURCE, /'Cache-Control': cacheControl/)
    assert.equal(WIDGET_META_LIVE_CACHE_CONTROL, 'no-store, max-age=0')
  })

  it('the threshold is generous enough for real widget opens', () => {
    assert.ok(WIDGET_META_LIVE_IP_RATE_LIMIT >= 30)
    assert.equal(WIDGET_META_LIVE_RATE_WINDOW_MS, 60_000)
  })

  it('uses its own key namespace', () => {
    assert.equal(
      widgetMetaLiveRateLimitKey('203.0.113.7'),
      'widget-meta-live:ip:203.0.113.7',
    )
    assert.notEqual(
      widgetMetaLiveRateLimitKey('203.0.113.7'),
      chatIpRateLimitKey('203.0.113.7'),
    )
  })
})
