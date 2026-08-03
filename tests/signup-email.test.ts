import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { checkAuthEmail } from '../lib/auth-email.ts'

/**
 * The sign-up form's own guarantees.
 *
 * `app/auth/signup/page.tsx` is a client component and cannot be imported here,
 * but everything that mattered about its email handling now goes through
 * `checkAuthEmail`: the field rule (`RULES.email`), the value passed to
 * `supabase.auth.signUp`, and the address written to `businesses.email`. These
 * assert the contract those three call sites depend on.
 *
 * The regex that used to live in RULES was `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`,
 * and `\s` in JavaScript matches none of the characters below — so it approved
 * addresses the server then refused, and could mint an account whose owner
 * could never sign in again.
 */
const OLD_SIGNUP_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const ZWSP = '\u200B' // zero-width space
const ZWNJ = '\u200C' // zero-width non-joiner
const ZWJ = '\u200D' // zero-width joiner
const LRM = '\u200E' // left-to-right mark
const RLM = '\u200F' // right-to-left mark
const WJ = '\u2060' // word joiner
const BOM = '\uFEFF' // zero-width no-break space
const SHY = '\u00AD' // soft hyphen

const INVISIBLES: [string, string][] = [
  ['U+200B zero-width space', ZWSP],
  ['U+200C zero-width non-joiner', ZWNJ],
  ['U+200D zero-width joiner', ZWJ],
  ['U+200E left-to-right mark', LRM],
  ['U+200F right-to-left mark', RLM],
  ['U+2060 word joiner', WJ],
  ['U+FEFF byte-order mark', BOM],
  ['U+00AD soft hyphen', SHY],
]

describe('signup: invisible characters never reach the account', () => {
  for (const [name, ch] of INVISIBLES) {
    it(`normalizes ${name} away`, () => {
      // Every position a paste can leave one in.
      for (const raw of [
        `${ch}owner@marea.ca`,
        `owner@marea.ca${ch}`,
        `own${ch}er@marea.ca`,
        `owner@ma${ch}rea.ca`,
        `owner@marea.ca${ch}${ch}`,
      ]) {
        const result = checkAuthEmail(raw)
        assert.equal(result.ok, true, `${name} in ${JSON.stringify(raw)}`)
        assert.equal(result.email, 'owner@marea.ca')
      }
    })

    it(`${name} broke the old rule one way or the other`, () => {
      /*
       * The regression witness. The old regex got these wrong in two opposite
       * ways, and both looked identical to the guest — a correct-looking address
       * refused.
       *
       * `\s` misses every zero-width character except U+FEFF, so those passed
       * the form and were refused by Supabase as malformed. U+FEFF (and a
       * non-breaking space) `\s` does match, so those were refused by the form
       * itself with "Enter a valid email address".
       */
      const matchedByOldRegex = OLD_SIGNUP_REGEX.test(`owner@marea.ca${ch}`)
      const isJsWhitespace = /\s/.test(ch)
      assert.equal(
        matchedByOldRegex,
        !isJsWhitespace,
        `${name}: expected the old regex to ${isJsWhitespace ? 'reject' : 'accept'} it`,
      )
      // Either way the address was unusable; now it is accepted and cleaned.
      assert.equal(checkAuthEmail(`owner@marea.ca${ch}`).email, 'owner@marea.ca')
    })
  }
})

describe('signup: the address stored is the address that signs in', () => {
  it('signUp and businesses.email receive the same normalized value', () => {
    // The page passes `emailCheck.email` to both. If they could differ, owner
    // notifications would go somewhere the owner cannot sign in from.
    const typed = ` ${BOM}Owner@Marea.CA${ZWSP} `
    const check = checkAuthEmail(typed)
    assert.equal(check.ok, true)
    assert.equal(check.email, 'owner@marea.ca')
  })

  it('a decorated sign-up and a plain sign-in resolve to one account', () => {
    const atSignup = checkAuthEmail(`owner@marea.ca${ZWSP}`)
    const atLogin = checkAuthEmail('  OWNER@MAREA.CA ')
    assert.equal(atSignup.email, atLogin.email)
  })

  it('every invisible variant collapses to the same address', () => {
    const addresses = new Set(
      INVISIBLES.map(([, ch]) => checkAuthEmail(`owner@marea.ca${ch}`).email),
    )
    assert.equal(addresses.size, 1)
    assert.equal([...addresses][0], 'owner@marea.ca')
  })
})

describe('signup: the field rule still refuses real mistakes', () => {
  it('refuses addresses that are genuinely malformed', () => {
    for (const raw of ['owner', 'owner@', '@marea.ca', 'owner@marea', 'owner marea@x.com']) {
      const result = checkAuthEmail(raw)
      assert.equal(result.ok, false, raw)
      assert.match(result.message ?? '', /valid email address/)
    }
  })

  it('does not silently repair an address broken by a real space', () => {
    // A non-breaking space becomes a plain space, not nothing — otherwise
    // "owner@ma rea.ca" would be "fixed" into a different venue's address.
    assert.equal(checkAuthEmail('owner@ma rea.ca').ok, false)
  })

  it('stays quiet while the field is empty', () => {
    assert.equal(checkAuthEmail('').message, null)
    assert.equal(checkAuthEmail(`${ZWSP}${BOM}`).message, null)
  })
})
