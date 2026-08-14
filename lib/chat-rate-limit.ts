/**
 * Rate-limit policy for the public concierge endpoint.
 *
 * Three ceilings, each answering a different question.
 *
 * `chat:ip` — how much one caller may ask for. Bounded per address, which on a
 * restaurant's own Wi-Fi or a carrier NAT is shared by real guests, so it is
 * set generously rather than tightly; squeezing it punishes the shared address
 * long before it inconveniences anyone rotating through a proxy pool.
 *
 * `chat:biz` — how much one venue may consume, so a single restaurant cannot
 * spend the platform's model budget. Keyed on the id of a business that was
 * actually loaded from the database, never on what the client sent.
 *
 * `chat:global` — what the platform will spend in a minute, full stop. Without
 * it an attacker rotating IP addresses gets a fresh per-IP allowance with every
 * new address and nothing above it ever says no; the landing-page demo has had
 * such a budget since it shipped, while the endpoint that actually calls tools
 * and writes rows had none.
 */

export const CHAT_RATE_WINDOW_MS = 60_000

/** Per client address, per minute. */
export const CHAT_IP_RATE_LIMIT = 40

/** Per venue, per minute. Above any real dining room's message rate. */
export const CHAT_BUSINESS_RATE_LIMIT = 80

/**
 * Platform-wide requests per minute, over every venue at once.
 *
 * 1200/min is deliberately far above current demand and still a real ceiling: a
 * busy dining room generates tens of guest messages a minute, so this leaves
 * room for roughly a hundred simultaneously-busy venues before it engages,
 * while capping the worst case an IP-rotating attacker can spend. Raise it with
 * CHAT_GLOBAL_RATE_LIMIT as real traffic grows — the ceiling should always sit
 * above observed peak, and it is a budget, not a security boundary.
 */
const DEFAULT_CHAT_GLOBAL_RATE_LIMIT = 1_200

export const CHAT_GLOBAL_RATE_LIMIT = (() => {
  const configured = Number(process.env.CHAT_GLOBAL_RATE_LIMIT)
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_CHAT_GLOBAL_RATE_LIMIT
})()

export const CHAT_GLOBAL_WINDOW_MS = 60_000

/** Constant by construction — a global budget derived from input is not global. */
export const CHAT_GLOBAL_KEY = 'chat:global'

export function chatIpRateLimitKey(clientIp: string): string {
  return `chat:ip:${clientIp}`
}

/**
 * The business bucket.
 *
 * Takes the id of a row already read from `businesses`. That is the whole
 * point: keying on the client's string minted a fresh Redis key (and a fresh
 * entry in the in-memory map) for every value anyone cared to send. A UUID
 * check alone does not fix it — valid UUIDs are free to generate — so the key
 * space is bound to rows that exist rather than to strings that parse.
 */
export function chatBusinessRateLimitKey(verifiedBusinessId: string): string {
  return `chat:biz:${verifiedBusinessId}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Cheap shape check so a malformed id is refused before it reaches Postgres.
 * Rejection only — passing says nothing about the business existing, and no
 * rate-limit key is derived from an id that has not been loaded.
 */
export function isWellFormedBusinessId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}
