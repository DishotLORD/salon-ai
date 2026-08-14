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

describe('/api/chat orders its admission gates ahead of the expensive work', () => {
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

  it('body parsing is guarded by the per-address bucket, the one gate that needs no body', () => {
    /*
     * The wider gates cannot run this early: the venue bucket needs an id that
     * has been looked up, and putting the platform budget ahead of it is the
     * bug this ordering fixes. So parsing sits behind the per-address bucket
     * alone — which is enough, because that bucket bounds how many bodies any
     * one caller can make the server read.
     */
    assert.ok(ipCheck < bodyParse)
    assert.ok(bodyParse < bizCheck)
    assert.ok(bodyParse < globalCheck)
  })

  it('the per-IP ceiling is checked before the body is parsed', () => {
    assert.ok(ipCheck < bodyParse)
  })

  it('the three admission gates run narrowest first', () => {
    /*
     * Not cosmetic, and the reason is the same at both steps: a request a
     * narrower bucket would refuse must not have spent from a wider one first.
     *
     * Global before IP let one address burn the whole platform allowance while
     * its own bucket refused all but the first CHAT_IP_RATE_LIMIT. Global
     * before business let many addresses aimed at one real restaurant do the
     * same — each fresh IP passed its own bucket, debited the shared counter,
     * and only then met the venue bucket that refused it. Either way the 429
     * lands on guests at every other restaurant.
     */
    assert.ok(ipCheck < bizCheck, 'IP bucket before the venue bucket')
    assert.ok(bizCheck < globalCheck, 'venue bucket before the platform budget')
  })

  it('the per-IP bucket precedes sanitization and the owner check', () => {
    // Only this one can: the venue bucket needs a looked-up id, and the
    // platform budget deliberately sits behind the venue bucket.
    assert.ok(ipCheck < sanitize)
    // `from_dashboard` used to buy an anonymous caller a Supabase Auth round
    // trip ahead of any limiter at all.
    assert.ok(ipCheck < ownerCheck)
  })

  it('the body is parsed before the business can be loaded', () => {
    assert.ok(bodyParse < businessLoad)
  })

  it('the business bucket comes after the business has been loaded', () => {
    // A bucket for a venue nobody has proved exists is a key space the caller
    // controls; see the provenance suite below.
    assert.ok(businessLoad < bizCheck)
  })

  it('every gate precedes the writes and the model call', () => {
    for (const [name, gate] of Object.entries({ ipCheck, bizCheck, globalCheck })) {
      assert.ok(gate < conversationInsert, `${name} before the conversation insert`)
      assert.ok(gate < openAiCall, `${name} before the model call`)
    }
  })

  it('the full required order holds end to end', () => {
    const order = [ipCheck, bodyParse, businessLoad, bizCheck, globalCheck, openAiCall]
    assert.deepEqual(order, [...order].sort((a, b) => a - b))
  })
})

describe('a narrower refusal never spends from a wider budget', () => {
  type Outcome = 'allowed' | 'ip_429' | 'not_found' | 'biz_429' | 'global_429'
  /** Where the platform budget sits relative to the narrower buckets. */
  type Order = 'global-last' | 'global-first' | 'global-before-business'

  const EXISTING = new Set(['biz-a', 'biz-b', 'biz-c'])

  /**
   * The route's admission path, run against an injected store so a question
   * about 1200-request behaviour is settled in microseconds. `order` is the
   * only variable; everything else — the keys, the limits, the windows, the
   * 404 on an unknown business — matches the route.
   */
  function admit(
    store: Map<string, Bucket>,
    ip: string,
    businessId: string,
    order: Order = 'global-last',
    now = 1_000,
  ): Outcome {
    const take = (key: string, limit: number) =>
      checkRateLimitMemory(key, limit, CHAT_RATE_WINDOW_MS, now, store).allowed
    const ipGate = () => take(chatIpRateLimitKey(ip), CHAT_IP_RATE_LIMIT)
    const bizGate = () =>
      take(chatBusinessRateLimitKey(businessId), CHAT_BUSINESS_RATE_LIMIT)
    const globalGate = () => take(CHAT_GLOBAL_KEY, CHAT_GLOBAL_RATE_LIMIT)

    if (order === 'global-first' && !globalGate()) return 'global_429'
    if (!ipGate()) return 'ip_429'
    if (order === 'global-before-business' && !globalGate()) return 'global_429'
    // The lookup: a business bucket exists only for a row that came back.
    if (!EXISTING.has(businessId)) return 'not_found'
    if (!bizGate()) return 'biz_429'
    if (order === 'global-last' && !globalGate()) return 'global_429'
    return 'allowed'
  }

  const spent = (store: Map<string, Bucket>, key: string) => store.get(key)?.count ?? 0
  const globalSpent = (store: Map<string, Bucket>) => spent(store, CHAT_GLOBAL_KEY)

  it('A. one address flooding spends exactly its own allowance of the budget', () => {
    const store = new Map<string, Bucket>()
    for (let i = 0; i < CHAT_IP_RATE_LIMIT * 30; i++) {
      admit(store, '198.51.100.1', 'biz-a')
    }
    assert.equal(globalSpent(store), CHAT_IP_RATE_LIMIT)
    assert.ok(globalSpent(store) < CHAT_GLOBAL_RATE_LIMIT)
    // And a guest elsewhere is still served.
    assert.equal(admit(store, '203.0.113.222', 'biz-b'), 'allowed')
  })

  it('B. one restaurant under many addresses spends only its own allowance', () => {
    /*
     * The regression this reordering exists for. Every request arrives from a
     * fresh address, so the IP bucket never refuses; the venue bucket does,
     * after 80. With the platform budget checked before that bucket, all 1400
     * attempts debited it and the restaurant next door started seeing 429s.
     */
    const store = new Map<string, Bucket>()
    const attempts = CHAT_GLOBAL_RATE_LIMIT + 200
    let admitted = 0
    let bizRefusals = 0
    for (let i = 0; i < attempts; i++) {
      const outcome = admit(store, `10.1.${Math.floor(i / 250)}.${i % 250}`, 'biz-a')
      if (outcome === 'allowed') admitted += 1
      if (outcome === 'biz_429') bizRefusals += 1
    }

    assert.equal(admitted, CHAT_BUSINESS_RATE_LIMIT)
    assert.equal(bizRefusals, attempts - CHAT_BUSINESS_RATE_LIMIT)
    assert.equal(globalSpent(store), CHAT_BUSINESS_RATE_LIMIT)
    assert.ok(globalSpent(store) < CHAT_GLOBAL_RATE_LIMIT)

    // An unrelated restaurant is untouched.
    assert.equal(admit(store, '203.0.113.9', 'biz-b'), 'allowed')
  })

  it('B(regression). the old order let that one restaurant drain the budget', () => {
    // Delete the reordering and this is what comes back.
    const store = new Map<string, Bucket>()
    for (let i = 0; i < CHAT_GLOBAL_RATE_LIMIT; i++) {
      admit(store, `10.2.${Math.floor(i / 250)}.${i % 250}`, 'biz-a', 'global-before-business')
    }
    assert.equal(globalSpent(store), CHAT_GLOBAL_RATE_LIMIT)
    assert.equal(
      admit(store, '203.0.113.9', 'biz-b', 'global-before-business'),
      'global_429',
      'a restaurant that was never attacked is refused',
    )
  })

  it('A(regression). the old order also let one address drain it', () => {
    const store = new Map<string, Bucket>()
    for (let i = 0; i < CHAT_GLOBAL_RATE_LIMIT; i++) {
      admit(store, '198.51.100.1', 'biz-a', 'global-first')
    }
    assert.equal(globalSpent(store), CHAT_GLOBAL_RATE_LIMIT)
    assert.equal(admit(store, '203.0.113.222', 'biz-b', 'global-first'), 'global_429')
  })

  it('C. spread widely enough, traffic still reaches and exhausts the budget', () => {
    /*
     * Moving the platform budget behind the narrower buckets must not have
     * removed it. Fresh address every time and enough venues that neither
     * narrower bucket refuses, so every request reaches the ceiling — which is
     * exactly the demand the budget exists to bound.
     */
    const store = new Map<string, Bucket>()
    const venues = Array.from({ length: 30 }, (_, i) => `biz-${i}`)
    for (const v of venues) EXISTING.add(v)

    const attempts = CHAT_GLOBAL_RATE_LIMIT + 60
    let admitted = 0
    let globalRefusals = 0
    let narrowRefusals = 0
    for (let i = 0; i < attempts; i++) {
      const outcome = admit(store, `10.3.${Math.floor(i / 250)}.${i % 250}`, venues[i % venues.length])
      if (outcome === 'allowed') admitted += 1
      else if (outcome === 'global_429') globalRefusals += 1
      else narrowRefusals += 1
    }
    for (const v of venues) EXISTING.delete(v)

    assert.equal(narrowRefusals, 0, 'no narrower bucket should have engaged')
    assert.equal(admitted, CHAT_GLOBAL_RATE_LIMIT)
    assert.equal(globalSpent(store), CHAT_GLOBAL_RATE_LIMIT)
    assert.equal(globalRefusals, 60)
  })

  it('C. an otherwise-valid request after the ceiling is refused globally', () => {
    const store = new Map<string, Bucket>()
    store.set(CHAT_GLOBAL_KEY, { count: CHAT_GLOBAL_RATE_LIMIT, resetAt: 61_000 })
    assert.equal(admit(store, '203.0.113.31', 'biz-c'), 'global_429')
  })

  it('D. a nonexistent business consumes neither its own bucket nor the budget', () => {
    const store = new Map<string, Bucket>()
    const invented = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    for (let i = 0; i < 25; i++) {
      assert.equal(admit(store, `10.4.0.${i}`, invented), 'not_found')
    }
    assert.equal(globalSpent(store), 0, 'the platform budget is untouched')
    assert.equal(spent(store, chatBusinessRateLimitKey(invented)), 0, 'no venue bucket exists')
    // Only the per-address buckets moved, one request each.
    assert.equal(spent(store, chatIpRateLimitKey('10.4.0.0')), 1)
  })

  it('an exhausted address spends nothing from the venue bucket either', () => {
    const store = new Map<string, Bucket>()
    for (let i = 0; i < CHAT_IP_RATE_LIMIT * 3; i++) admit(store, '198.51.100.5', 'biz-a')
    assert.equal(spent(store, chatBusinessRateLimitKey('biz-a')), CHAT_IP_RATE_LIMIT)
    assert.equal(globalSpent(store), CHAT_IP_RATE_LIMIT)
  })

  it('each venue keeps its own allowance, and they add up rather than multiply', () => {
    const store = new Map<string, Bucket>()
    for (const biz of ['biz-a', 'biz-b', 'biz-c']) {
      for (let i = 0; i < CHAT_BUSINESS_RATE_LIMIT + 10; i++) {
        admit(store, `10.5.${biz.charCodeAt(4)}.${i}`, biz)
      }
      assert.equal(spent(store, chatBusinessRateLimitKey(biz)), CHAT_BUSINESS_RATE_LIMIT, biz)
    }
    assert.equal(globalSpent(store), CHAT_BUSINESS_RATE_LIMIT * 3)
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

  it('a count within the limit allows, when the TTL beside it is intelligible', () => {
    assert.deepEqual(parseRateLimitScriptResult({ result: [3, 45_000] }, LIMIT, WINDOW), {
      allowed: true,
    })
  })

  it('a count within the limit does NOT allow on a broken TTL', () => {
    /*
     * The asymmetry is the point. The script always returns a positive TTL, so
     * a reply without one did not come from the script we sent — and letting a
     * request through on a reply we cannot read is the one failure mode a
     * limiter must not have. Falling back to the in-memory bucket at least
     * counts. A refusal is the other way round: the count already said no, so
     * a broken TTL there only costs an accurate Retry-After.
     */
    for (const ttl of ['oops', Number.NaN, 0, -1, null, undefined, Infinity]) {
      assert.deepEqual(
        parseRateLimitScriptResult({ result: [3, ttl] }, LIMIT, WINDOW),
        { skip: 'malformed_response' },
        String(ttl),
      )
    }
  })

  it('the boundary count is held to the same TTL standard', () => {
    assert.deepEqual(parseRateLimitScriptResult({ result: [LIMIT, 1_000] }, LIMIT, WINDOW), {
      allowed: true,
    })
    assert.deepEqual(parseRateLimitScriptResult({ result: [LIMIT, 'x'] }, LIMIT, WINDOW), {
      skip: 'malformed_response',
    })
  })

  it('a count over the limit refuses, with Retry-After from the TTL', () => {
    assert.deepEqual(parseRateLimitScriptResult({ result: [11, 30_000] }, LIMIT, WINDOW), {
      allowed: false,
      retryAfterSec: 30,
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
