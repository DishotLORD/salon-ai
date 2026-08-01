/**
 * Guest session tokens for the public chat widget.
 *
 * A guest has no account, so there is nothing to authenticate against — but a
 * conversation still has to be resumable, and resuming it must not be possible
 * for anyone who merely knows its id. Until migration 021 the anon role could
 * enumerate `public.conversations`, which made those ids readable; treating an
 * id as a secret was never safe and is now demonstrably unsafe.
 *
 * So a conversation mints a random token at creation. The database stores only
 * the SHA-256 hash (migration 022), the plaintext goes to the widget once, and
 * every later request must present it. A leaked backup, a stray log line or a
 * SELECT over the table yields hashes, which resume nothing.
 *
 * This is a capability, not an identity: it proves "I am the browser that opened
 * this conversation", never "I am Ronald". Anything that needs the second —
 * reading a guest's history, touching a booking made somewhere else — still has
 * no mechanism here, and must not pretend otherwise.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto'

/** 32 bytes of CSPRNG output, base64url. Not a UUID: ids are identifiers, not secrets. */
export const GUEST_TOKEN_BYTES = 32

/**
 * How long a guest may resume a conversation. Matches the widget's own storage
 * TTL so the two agree, but this one is the enforced copy — the widget's is a
 * courtesy the server must never rely on.
 */
export const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000

/** Hex SHA-256 is 64 chars; reject anything else before it reaches the database. */
const SHA256_HEX_RE = /^[0-9a-f]{64}$/

export function generateGuestToken(): string {
  return randomBytes(GUEST_TOKEN_BYTES).toString('base64url')
}

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function guestSessionExpiryFrom(now: Date = new Date()): string {
  return new Date(now.getTime() + GUEST_SESSION_TTL_MS).toISOString()
}

/**
 * Constant-time hash comparison. The window is small — an attacker would be
 * timing a hash of their own guess against a hash they cannot see — but a
 * character-by-character `===` on a secret comparison is the kind of detail that
 * is free to get right and awkward to explain afterwards.
 */
export function guestTokenMatches(
  presentedToken: string | null | undefined,
  storedHash: string | null | undefined,
): boolean {
  if (typeof presentedToken !== 'string' || !presentedToken) return false
  if (typeof storedHash !== 'string' || !SHA256_HEX_RE.test(storedHash)) return false

  const presented = Buffer.from(hashGuestToken(presentedToken), 'hex')
  const stored = Buffer.from(storedHash, 'hex')
  if (presented.length !== stored.length) return false
  return timingSafeEqual(presented, stored)
}

export function guestSessionExpired(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  // No recorded expiry means no valid session. Conversations created before
  // migration 022 land here, which is the intended fail-closed behaviour.
  if (typeof expiresAt !== 'string' || !expiresAt) return true
  const ms = Date.parse(expiresAt)
  if (Number.isNaN(ms)) return true
  return ms <= now.getTime()
}

export type GuestSessionRow = {
  guest_access_token_hash?: string | null
  guest_access_expires_at?: string | null
}

export type GuestSessionCheck =
  | { ok: true }
  | { ok: false; reason: 'no_session' | 'invalid_token' | 'expired' }

/**
 * The single decision point for "may this caller act as this conversation's
 * guest?". Every resume, history read and booking tool goes through it, so the
 * rule cannot drift between call sites the way the old ownership checks did.
 *
 * Order matters: a conversation with no hash reports `no_session` rather than
 * `invalid_token`, so the caller can tell "this predates tokens, start fresh"
 * apart from "someone presented the wrong secret".
 */
export function checkGuestSession(
  row: GuestSessionRow | null | undefined,
  presentedToken: string | null | undefined,
  now: Date = new Date(),
): GuestSessionCheck {
  if (!row || !row.guest_access_token_hash) return { ok: false, reason: 'no_session' }
  if (!guestTokenMatches(presentedToken, row.guest_access_token_hash)) {
    return { ok: false, reason: 'invalid_token' }
  }
  if (guestSessionExpired(row.guest_access_expires_at, now)) {
    return { ok: false, reason: 'expired' }
  }
  return { ok: true }
}
