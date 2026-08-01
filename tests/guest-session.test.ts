import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  checkGuestSession,
  generateGuestToken,
  guestSessionExpired,
  guestSessionExpiryFrom,
  guestTokenMatches,
  hashGuestToken,
  GUEST_SESSION_TTL_MS,
} from '../lib/guest-session.ts'

describe('token generation', () => {
  it('produces a distinct high-entropy token every time', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateGuestToken()))
    assert.equal(tokens.size, 500)
  })

  it('is base64url — safe in a JSON body and a header', () => {
    for (let i = 0; i < 50; i++) {
      assert.match(generateGuestToken(), /^[A-Za-z0-9_-]{43}$/)
    }
  })
})

describe('hashing', () => {
  it('is stable and 64 hex chars', () => {
    assert.equal(hashGuestToken('abc'), hashGuestToken('abc'))
    assert.match(hashGuestToken('abc'), /^[0-9a-f]{64}$/)
  })

  it('does not leak the token', () => {
    const token = generateGuestToken()
    assert.equal(hashGuestToken(token).includes(token), false)
  })

  it('differs for different tokens', () => {
    assert.notEqual(hashGuestToken(generateGuestToken()), hashGuestToken(generateGuestToken()))
  })
})

describe('token matching', () => {
  const token = generateGuestToken()
  const hash = hashGuestToken(token)

  it('accepts the right token', () => {
    assert.equal(guestTokenMatches(token, hash), true)
  })

  it('rejects a different token', () => {
    assert.equal(guestTokenMatches(generateGuestToken(), hash), false)
  })

  it('rejects the hash presented as the token', () => {
    // Someone who read the column must not be able to replay what they read.
    assert.equal(guestTokenMatches(hash, hash), false)
  })

  it('rejects empty, missing and malformed input', () => {
    assert.equal(guestTokenMatches('', hash), false)
    assert.equal(guestTokenMatches(null, hash), false)
    assert.equal(guestTokenMatches(undefined, hash), false)
    assert.equal(guestTokenMatches(token, null), false)
    assert.equal(guestTokenMatches(token, ''), false)
    assert.equal(guestTokenMatches(token, 'not-a-hash'), false)
    assert.equal(guestTokenMatches(token, hash.slice(0, 63)), false)
  })
})

describe('expiry', () => {
  const now = new Date('2026-08-01T12:00:00.000Z')

  it('treats a null expiry as expired — pre-migration rows fail closed', () => {
    assert.equal(guestSessionExpired(null, now), true)
    assert.equal(guestSessionExpired(undefined, now), true)
    assert.equal(guestSessionExpired('', now), true)
  })

  it('treats an unparseable expiry as expired', () => {
    assert.equal(guestSessionExpired('whenever', now), true)
  })

  it('is expired at and after the deadline', () => {
    assert.equal(guestSessionExpired('2026-08-01T12:00:00.000Z', now), true)
    assert.equal(guestSessionExpired('2026-08-01T11:59:59.000Z', now), true)
  })

  it('is valid before the deadline', () => {
    assert.equal(guestSessionExpired('2026-08-01T12:00:01.000Z', now), false)
  })

  it('mints an expiry one TTL ahead', () => {
    assert.equal(
      Date.parse(guestSessionExpiryFrom(now)) - now.getTime(),
      GUEST_SESSION_TTL_MS,
    )
  })
})

describe('checkGuestSession — the single decision point', () => {
  const now = new Date('2026-08-01T12:00:00.000Z')
  const token = generateGuestToken()
  const live = {
    guest_access_token_hash: hashGuestToken(token),
    guest_access_expires_at: '2026-08-01T13:00:00.000Z',
  }

  it('admits the right token before expiry', () => {
    assert.deepEqual(checkGuestSession(live, token, now), { ok: true })
  })

  it('fails closed for a conversation with no token — pre-migration 022', () => {
    assert.deepEqual(
      checkGuestSession({ guest_access_token_hash: null, guest_access_expires_at: null }, token, now),
      { ok: false, reason: 'no_session' },
    )
  })

  it('fails closed for a missing row', () => {
    assert.deepEqual(checkGuestSession(null, token, now), { ok: false, reason: 'no_session' })
    assert.deepEqual(checkGuestSession(undefined, token, now), { ok: false, reason: 'no_session' })
  })

  it('rejects a wrong token', () => {
    assert.deepEqual(checkGuestSession(live, generateGuestToken(), now), {
      ok: false,
      reason: 'invalid_token',
    })
  })

  it('rejects a missing token', () => {
    assert.deepEqual(checkGuestSession(live, null, now), { ok: false, reason: 'invalid_token' })
    assert.deepEqual(checkGuestSession(live, '', now), { ok: false, reason: 'invalid_token' })
  })

  it('rejects an expired session even with the right token', () => {
    const stale = { ...live, guest_access_expires_at: '2026-08-01T11:00:00.000Z' }
    assert.deepEqual(checkGuestSession(stale, token, now), { ok: false, reason: 'expired' })
  })

  it('checks the token before the clock — a stranger never learns a session expired', () => {
    const stale = { ...live, guest_access_expires_at: '2026-08-01T11:00:00.000Z' }
    assert.deepEqual(checkGuestSession(stale, generateGuestToken(), now), {
      ok: false,
      reason: 'invalid_token',
    })
  })
})
