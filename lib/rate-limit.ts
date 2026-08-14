/**
 * Fixed-window rate limiting for the public surface.
 *
 * Two backends. Upstash Redis over its REST API when both
 * UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set — the only one
 * that actually holds when the platform scales out, because a serverless
 * deployment runs many instances and each would otherwise keep its own count.
 * Otherwise a per-instance map, which is a real limit only in the sense that
 * one instance cannot be hammered without bound; the effective ceiling is the
 * configured limit multiplied by however many instances happen to be warm.
 */

export type RateLimitResult = { allowed: boolean; retryAfterSec?: number }

// ─── In-memory fallback ──────────────────────────────────────────────────────

export type Bucket = { count: number; resetAt: number }

/**
 * A dead bucket used to be immortal: entries were only ever overwritten when
 * the same key came back, so a caller that mixed attacker-controlled text into
 * its key could grow this map until the instance ran out of memory. Two bounds
 * now apply — expired entries are dropped on sight and swept periodically, and
 * the map has a hard ceiling.
 */
export const MEMORY_MAX_BUCKETS = 20_000

/** Sweep every N calls: cheap amortised cleanup without a timer to leak. */
export const MEMORY_SWEEP_EVERY = 500

/**
 * Drop expired buckets, then — if the map is still over its ceiling — evict
 * whatever expires soonest, since those cost the least to lose. Returns how
 * many entries were removed, which is what makes it testable.
 */
export function pruneBuckets(
  store: Map<string, Bucket>,
  now: number,
  maxBuckets = MEMORY_MAX_BUCKETS,
): number {
  let removed = 0
  for (const [key, bucket] of store) {
    if (now >= bucket.resetAt) {
      store.delete(key)
      removed += 1
    }
  }
  if (store.size <= maxBuckets) return removed

  // Everything left is live, so something live has to go. Soonest-to-expire
  // first: evicting a bucket only forgives the remainder of its window.
  const byExpiry = [...store.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
  for (const [key] of byExpiry) {
    if (store.size <= maxBuckets) break
    store.delete(key)
    removed += 1
  }
  return removed
}

const buckets = new Map<string, Bucket>()
let callsSinceSweep = 0

export function checkRateLimitMemory(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
  store: Map<string, Bucket> = buckets,
): RateLimitResult {
  callsSinceSweep += 1
  if (callsSinceSweep >= MEMORY_SWEEP_EVERY) {
    callsSinceSweep = 0
    pruneBuckets(store, now)
  }

  const existing = store.get(key)

  if (!existing || now >= existing.resetAt) {
    // Expired: replaced rather than left behind, so a key that never returns
    // cannot survive its own window.
    store.set(key, { count: 1, resetAt: now + windowMs })
    if (store.size > MEMORY_MAX_BUCKETS) pruneBuckets(store, now)
    return { allowed: true }
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) }
  }

  existing.count += 1
  return { allowed: true }
}

// ─── Distributed backend (Upstash Redis REST) ────────────────────────────────

/**
 * How long a rate-limit lookup may take before the request stops waiting on it.
 * A limiter is a gate, not the answer: a second is already far longer than a
 * healthy Redis round trip, and a public endpoint must not sit behind a dead
 * dependency for longer than that.
 */
export const UPSTASH_TIMEOUT_MS = 1_000

/**
 * Increment, expire and read the TTL in one atomic server-side step.
 *
 * The previous implementation sent INCR, PEXPIRE and PTTL down /pipeline and
 * read only the first and third results. A pipeline is not a transaction, and
 * per-command failures arrive as `{"error": …}` entries inside an HTTP 200
 * (Upstash, "REST API" — pipelining), so an INCR that succeeded while its
 * PEXPIRE failed looked like a clean answer. That leaves a counter with no
 * expiry: it never resets, and the key it belongs to is rate-limited forever.
 *
 * EVAL is supported over the REST API (same source, "Scripting"), so the whole
 * decision happens inside Redis instead. `PEXPIRE` runs when the counter is
 * newly created, and the `t < 0` branch repairs a key that somehow lost its
 * expiry — an immortal counter heals itself on the next request rather than
 * needing a human.
 */
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`

/** Why the distributed backend was skipped. Logged; never carries a secret. */
export type DistributedSkipReason =
  | 'not_configured'
  | 'http_error'
  | 'redis_error'
  | 'malformed_response'
  | 'timeout'
  | 'network_error'

/**
 * Turn one EVAL reply into a decision. Split out from the network call so the
 * failure shapes can be tested without an Upstash account: anything that is not
 * a pair of finite numbers is unusable, and unusable means fall back rather
 * than guess.
 */
export function parseRateLimitScriptResult(
  payload: unknown,
  limit: number,
  windowMs: number,
): RateLimitResult | { skip: DistributedSkipReason } {
  if (!payload || typeof payload !== 'object') return { skip: 'malformed_response' }

  // A command-level Redis error arrives inside a 200 response. It is not a
  // count, and treating it as one would let every request through.
  if (typeof (payload as { error?: unknown }).error === 'string') {
    return { skip: 'redis_error' }
  }

  const result = (payload as { result?: unknown }).result
  if (!Array.isArray(result) || result.length < 2) return { skip: 'malformed_response' }

  const count = Number(result[0])
  const ttlMs = Number(result[1])
  if (!Number.isFinite(count) || count < 1) return { skip: 'malformed_response' }

  const ttlUsable = Number.isFinite(ttlMs) && ttlMs > 0

  if (count <= limit) {
    /*
     * A count within the limit is only half an answer. The script always
     * returns a positive TTL alongside it, so a reply whose TTL is missing,
     * zero, negative or not a number did not come from the script we sent —
     * and letting a request through on a reply we cannot read is the one
     * failure mode a limiter must not have. Fall back to the in-memory
     * bucket, which at least counts.
     */
    if (!ttlUsable) return { skip: 'malformed_response' }
    return { allowed: true }
  }

  // Refusals are the other way round: the count already says no, so a broken
  // TTL only costs an accurate Retry-After. Use the window we asked for rather
  // than discarding a refusal we did understand.
  const retryMs = ttlUsable ? ttlMs : windowMs
  return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)) }
}

/** Whether the distributed backend is configured at all. Reads no values out. */
export function distributedRateLimitConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  )
}

async function checkRateLimitUpstash(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult | { skip: DistributedSkipReason }> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!url || !token) return { skip: 'not_configured' }

  let res: Response
  try {
    res = await fetch(url.replace(/\/$/, ''), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      // Single command as a JSON array, the form the REST API documents.
      body: JSON.stringify(['EVAL', RATE_LIMIT_SCRIPT, 1, `rl:${key}`, String(windowMs)]),
      signal: AbortSignal.timeout(UPSTASH_TIMEOUT_MS),
    })
  } catch (err) {
    return { skip: err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network_error' }
  }

  if (!res.ok) return { skip: 'http_error' }

  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    return { skip: 'malformed_response' }
  }
  return parseRateLimitScriptResult(payload, limit, windowMs)
}

/** Warn once per reason per process — a hot public path must not spam the log. */
const warnedReasons = new Set<DistributedSkipReason>()

function noteFallback(reason: DistributedSkipReason): void {
  // 'not_configured' is the documented local/preview state, not an incident.
  if (reason === 'not_configured' || warnedReasons.has(reason)) return
  warnedReasons.add(reason)
  // The reason is a fixed enum member — no URL, no token, no key material.
  console.warn(`[rate-limit] distributed backend unusable (${reason}); using in-memory fallback`)
}

/**
 * Fixed-window limiter. Distributed when Upstash is configured, per-instance
 * otherwise — including when Upstash is configured but unreachable, which is
 * deliberately fail-open-ish: a rate limiter that returns 500 when its own
 * dependency is down takes the product offline to prevent abuse nobody has
 * attempted yet.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const distributed = await checkRateLimitUpstash(key, limit, windowMs)
  if ('skip' in distributed) {
    noteFallback(distributed.skip)
    return checkRateLimitMemory(key, limit, windowMs)
  }
  return distributed
}

// ─── Client IP ───────────────────────────────────────────────────────────────

/**
 * Headers consulted for the client address, most trustworthy first.
 *
 * On Vercel none of these can be forged from the open internet: the platform
 * "overwrite[s] the X-Forwarded-For header and do[es] not forward external
 * IPs … to prevent IP spoofing" (Vercel, "Request headers"). The same page
 * notes `x-vercel-forwarded-for` is identical "However, x-forwarded-for could
 * be overwritten if you're using a proxy on top of Vercel" — so the Vercel
 * header is preferred, and this keeps holding if a proxy is ever put in front.
 * `x-real-ip` is documented as identical and is kept as a last resort.
 */
const CLIENT_IP_HEADERS = ['x-vercel-forwarded-for', 'x-forwarded-for', 'x-real-ip'] as const

/**
 * Requests carrying no address at all — `next dev`, a direct container hit —
 * share this one bucket. Deliberately constant: minting a random id per request
 * would give every caller its own bucket, which is not a rate limit at all.
 */
export const UNKNOWN_CLIENT_IP = 'unknown'

export function getClientIp(request: Request): string {
  for (const header of CLIENT_IP_HEADERS) {
    const raw = request.headers.get(header)
    if (!raw) continue
    // Leftmost is the client where a chain exists; on Vercel there is one entry.
    const first = raw.split(',')[0]?.trim()
    if (first) return first
  }
  return UNKNOWN_CLIENT_IP
}
