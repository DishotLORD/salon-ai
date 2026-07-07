type Bucket = { count: number; resetAt: number }

export type RateLimitResult = { allowed: boolean; retryAfterSec?: number }

const buckets = new Map<string, Bucket>()

function checkRateLimitMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) }
  }

  existing.count += 1
  return { allowed: true }
}

/**
 * Distributed limiter via the Upstash Redis REST API (no SDK needed).
 * Returns null on any error so the caller can fall back to in-memory.
 */
async function checkRateLimitUpstash(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim()
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!url || !token) return null

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', `rl:${key}`],
        ['PEXPIRE', `rl:${key}`, windowMs, 'NX'],
        ['PTTL', `rl:${key}`],
      ]),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { result?: unknown }[]
    const count = Number(data?.[0]?.result)
    if (!Number.isFinite(count)) return null
    if (count <= limit) return { allowed: true }
    const ttlMs = Number(data?.[2]?.result)
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000)),
    }
  } catch {
    return null
  }
}

/**
 * Fixed-window rate limiter. Uses Upstash Redis when UPSTASH_REDIS_REST_URL /
 * UPSTASH_REDIS_REST_TOKEN are set (survives deploys and works across
 * serverless instances); otherwise falls back to a per-instance in-memory map.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const distributed = await checkRateLimitUpstash(key, limit, windowMs)
  if (distributed) return distributed
  return checkRateLimitMemory(key, limit, windowMs)
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown'
  }
  return request.headers.get('x-real-ip') ?? 'unknown'
}
