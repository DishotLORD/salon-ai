import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { checkAuthEmail } from '../lib/auth-email.ts'

/**
 * Password-reset email gate.
 *
 * Login's "Forgot password?" and the expired-link resend form on
 * `/auth/reset-password` must share the same rule as sign-in and sign-up:
 * `checkAuthEmail` — normalize (strip invisible Unicode, trim, lowercase), then
 * validate. A separate `[^\s@]+` regex on a mere trim() used to live on the
 * reset page and disagreed with that gate.
 *
 * These assert the addresses that gate must accept before
 * `/api/auth/forgot-password` ever talks to Auth — including the literal
 * `test@test.com` that GoTrue's public `/recover` endpoint denylists, and the
 * invisible characters a paste leaves behind.
 */

const ZWSP = '\u200B'
const NBSP = '\u00A0'
const LRM = '\u200E'
const BOM = '\uFEFF'
const SHY = '\u00AD'

/** What the client (and the API) send after the gate — never the raw field. */
function emailForPasswordReset(raw: string): string | null {
  const check = checkAuthEmail(raw)
  return check.ok ? check.email : null
}

describe('password reset: test@test.com', () => {
  it('accepts the plain address and sends it unchanged', () => {
    assert.equal(emailForPasswordReset('test@test.com'), 'test@test.com')
    assert.deepEqual(checkAuthEmail('test@test.com'), {
      ok: true,
      email: 'test@test.com',
      message: null,
    })
  })

  it('accepts it with keyboard / paste whitespace', () => {
    for (const raw of [
      ' test@test.com',
      'test@test.com ',
      '  test@test.com  ',
      `${NBSP}test@test.com${NBSP}`,
    ]) {
      assert.equal(emailForPasswordReset(raw), 'test@test.com', JSON.stringify(raw))
    }
  })

  it('accepts it when invisible Unicode is clinging to the paste', () => {
    for (const raw of [
      `test@test.com${ZWSP}`,
      `${ZWSP}test@test.com`,
      `test@test${ZWSP}.com`,
      `test@test.com${LRM}`,
      `${BOM}test@test.com`,
      `test@test.com${SHY}`,
      ` ${BOM}Test@Test.Com${ZWSP}${NBSP}`,
    ]) {
      assert.equal(emailForPasswordReset(raw), 'test@test.com', JSON.stringify(raw))
    }
  })
})

describe('password reset: no separate regex', () => {
  const OLD_RESET_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

  it('the old reset-page regex approved a zero-width suffix that Auth then refused', () => {
    // Witness: trim() alone left the ZWSP; the regex still matched; Supabase did not.
    const raw = `owner@marea.ca${ZWSP}`
    assert.equal(OLD_RESET_REGEX.test(raw.trim()), true)
    assert.equal(emailForPasswordReset(raw), 'owner@marea.ca')
  })

  it('refuses genuinely broken addresses with the shared message', () => {
    const result = checkAuthEmail('not-an-email')
    assert.equal(result.ok, false)
    assert.equal(emailForPasswordReset('not-an-email'), null)
    assert.match(result.message ?? '', /valid email address/)
  })
})
