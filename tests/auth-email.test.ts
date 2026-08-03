import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  checkAuthEmail,
  isValidAuthEmail,
  normalizeAuthEmail,
  stripInvisibleCharacters,
} from '../lib/auth-email.ts'

/** Named rather than pasted, so this file stays readable in any editor. */
const ZWSP = '\u200B' // zero-width space
const NBSP = '\u00A0' // non-breaking space
const LRM = '\u200E' // left-to-right mark
const BOM = '\uFEFF' // zero-width no-break space
const SHY = '\u00AD' // soft hyphen

describe('the reported bug: test@test.com rejected as invalid', () => {
  it('accepts it plainly', () => {
    assert.equal(isValidAuthEmail('test@test.com'), true)
    assert.deepEqual(checkAuthEmail('test@test.com'), {
      ok: true,
      email: 'test@test.com',
      message: null,
    })
  })

  it('accepts it with the whitespace a keyboard or paste adds', () => {
    for (const raw of [
      ' test@test.com',
      'test@test.com ',
      '  test@test.com  ',
      '\ttest@test.com\n',
      `${NBSP}test@test.com${NBSP}`,
    ]) {
      const result = checkAuthEmail(raw)
      assert.equal(result.ok, true, JSON.stringify(raw))
      assert.equal(result.email, 'test@test.com')
    }
  })

  it('accepts it with the invisible characters a copy-paste carries', () => {
    // Each of these passed the old `[^\s@]+` regex and was then rejected by
    // Supabase, which is the exact shape of the reported bug.
    for (const raw of [
      `test@test.com${ZWSP}`,
      `${ZWSP}test@test.com`,
      `test@test${ZWSP}.com`,
      `test@test.com${LRM}`,
      `${BOM}test@test.com`,
      `test@test.com${SHY}`,
    ]) {
      const result = checkAuthEmail(raw)
      assert.equal(result.ok, true, JSON.stringify(raw))
      assert.equal(result.email, 'test@test.com')
    }
  })

  it('accepts it in any case, and sends it lowercased', () => {
    for (const raw of ['TEST@TEST.COM', 'Test@Test.Com', 'tEsT@tEsT.cOm']) {
      assert.equal(checkAuthEmail(raw).email, 'test@test.com', raw)
    }
  })

  it('accepts the worst realistic paste: case, spaces and invisibles at once', () => {
    const raw = ` ${BOM}Test@Test.Com${ZWSP}${NBSP}`
    assert.deepEqual(checkAuthEmail(raw), {
      ok: true,
      email: 'test@test.com',
      message: null,
    })
  })
})

describe('why the old check let it through', () => {
  it('JavaScript \\s does not match a zero-width space', () => {
    // The reason the sign-up regex called the address valid while the server
    // called it malformed.
    assert.equal(/\s/.test(ZWSP), false)
    assert.equal(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(`test@test.com${ZWSP}`), true)
  })

  it('stripping is what makes the address match reality', () => {
    assert.equal(stripInvisibleCharacters(`test@test.com${ZWSP}`), 'test@test.com')
    assert.equal(stripInvisibleCharacters(`te${SHY}st@test.com`), 'test@test.com')
  })
})

describe('other real addresses keep working', () => {
  const valid = [
    'owner@marea.ca',
    'first.last@example.co.uk',
    'guest+booking@example.com',
    "o'brien@example.com",
    'user_name@sub.domain.example.org',
    'дмитрий@пример.рф',
  ]

  for (const email of valid) {
    it(`accepts ${email}`, () => {
      assert.equal(isValidAuthEmail(email), true)
    })
  }
})

describe('genuinely invalid input is still refused, with a reason', () => {
  const invalid = ['test', 'test@', '@test.com', 'test@test', 'test @test.com', 'test@te st.com']

  for (const raw of invalid) {
    it(`refuses ${JSON.stringify(raw)}`, () => {
      const result = checkAuthEmail(raw)
      assert.equal(result.ok, false)
      assert.match(result.message ?? '', /valid email address/)
    })
  }

  it('an interior space survives normalization and invalidates the address', () => {
    // Unicode spaces are collapsed to a plain space rather than deleted, so a
    // genuinely broken address is not silently repaired into a different one.
    assert.equal(checkAuthEmail(`test@te${NBSP}st.com`).ok, false)
  })

  it('says nothing about an empty field', () => {
    assert.deepEqual(checkAuthEmail(''), { ok: false, email: '', message: null })
    assert.deepEqual(checkAuthEmail(`   ${ZWSP}  `), { ok: false, email: '', message: null })
  })

  it('refuses an absurdly long address', () => {
    const result = checkAuthEmail(`${'a'.repeat(250)}@test.com`)
    assert.equal(result.ok, false)
    assert.match(result.message ?? '', /too long/)
  })

  it('survives non-string input', () => {
    assert.equal(normalizeAuthEmail(undefined as unknown as string), '')
    assert.equal(isValidAuthEmail(null as unknown as string), false)
  })
})
