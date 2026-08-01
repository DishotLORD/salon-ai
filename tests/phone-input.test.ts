import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  countPhoneDigits,
  formatPhoneInput,
  PHONE_MAX_DIGITS,
  PHONE_MIN_DIGITS,
  sanitizePhoneInput,
  validatePhoneInput,
} from '../lib/phone-input.ts'

describe('allowed characters', () => {
  it('accepts +, spaces, parentheses and dashes', () => {
    assert.equal(sanitizePhoneInput('+1 (403) 555-0123'), '+1 (403) 555-0123')
  })

  it('drops anything else', () => {
    assert.equal(sanitizePhoneInput('403.555.0123'), '4035550123')
    assert.equal(sanitizePhoneInput('call me on 403abc555'), 'call me on 403abc555'.replace(/[^\d+()\s-]/g, ''))
    assert.equal(sanitizePhoneInput('+1;403*555#0123'), '+14035550123')
  })

  it('allows + only at the front', () => {
    assert.equal(sanitizePhoneInput('+1+44 20 7946'), '+144 20 7946')
    assert.equal(sanitizePhoneInput('403+555'), '403555')
  })

  it('survives non-string input', () => {
    assert.equal(sanitizePhoneInput(undefined as unknown as string), '')
  })
})

describe('digits are counted, separators are not', () => {
  it('counts only digits', () => {
    assert.equal(countPhoneDigits('+1 (403) 555-0123'), 11)
    assert.equal(countPhoneDigits('(((---   )))'), 0)
  })

  it('does not count separators against the 15-digit limit', () => {
    // 15 digits, 10 separator characters — must still be valid.
    const fifteen = '+44 (20) 7946-0958 123'
    assert.equal(countPhoneDigits(fifteen), 15)
    assert.equal(validatePhoneInput(fifteen).ok, true)
  })
})

describe('maximum 15 digits', () => {
  it('trims extra digits while keeping the separators typed', () => {
    const tooLong = '+1 (403) 555-0123 456 789 000'
    const formatted = formatPhoneInput(tooLong)
    assert.equal(countPhoneDigits(formatted), PHONE_MAX_DIGITS)
    assert.ok(formatted.startsWith('+1 (403) 555-0123'))
  })

  it('trims a long paste with no separators', () => {
    assert.equal(countPhoneDigits(formatPhoneInput('1'.repeat(30))), PHONE_MAX_DIGITS)
  })

  it('reports a clear message when too many digits are supplied', () => {
    const result = validatePhoneInput('1'.repeat(20))
    assert.equal(result.ok, false)
    assert.equal(result.digits, 20)
    assert.match(result.message ?? '', /at most 15/)
  })

  it('accepts exactly 15', () => {
    assert.deepEqual(validatePhoneInput('+' + '1'.repeat(15)), {
      ok: true,
      digits: 15,
      message: null,
    })
  })

  it('rejects 16', () => {
    assert.equal(validatePhoneInput('+' + '1'.repeat(16)).ok, false)
  })
})

describe('minimum length', () => {
  it('reports a clear message when too short', () => {
    const result = validatePhoneInput('403 55')
    assert.equal(result.ok, false)
    assert.equal(result.digits, 5)
    assert.match(result.message ?? '', /at least 7 digits/)
  })

  it('accepts exactly the minimum', () => {
    assert.equal(validatePhoneInput('5550123').ok, true)
    assert.equal(PHONE_MIN_DIGITS, 7)
  })

  it('says nothing about an empty field — the guest may be giving an email', () => {
    assert.deepEqual(validatePhoneInput(''), { ok: false, digits: 0, message: null })
    assert.deepEqual(validatePhoneInput('  ( ) - '), { ok: false, digits: 0, message: null })
  })
})

describe('valid international numbers keep working', () => {
  const international = [
    { input: '+44 20 7946 0958', digits: 12 },
    { input: '+380 63 123 4567', digits: 12 },
    { input: '+49 (30) 12345678', digits: 12 },
    { input: '+81 3-1234-5678', digits: 11 },
    { input: '+1 403 555 0123', digits: 11 },
  ]

  for (const { input, digits } of international) {
    it(`accepts ${input}`, () => {
      const result = validatePhoneInput(input)
      assert.equal(result.ok, true, result.message ?? '')
      assert.equal(result.digits, digits)
    })

    it(`preserves the guest's own grouping for ${input}`, () => {
      // Re-grouping an international number is how "+44 20 7946 0958" used to
      // come back as something its owner would not recognise.
      assert.equal(formatPhoneInput(input), input)
    })
  }
})

describe('North-American formatting still applies', () => {
  it('formats as the guest types', () => {
    assert.equal(formatPhoneInput('403'), '403')
    assert.equal(formatPhoneInput('403555'), '(403) 555')
    assert.equal(formatPhoneInput('4035550123'), '(403) 555-0123')
    assert.equal(formatPhoneInput('14035550123'), '1 (403) 555-0123')
  })

  it('does not invent brackets around an unknown grouping', () => {
    // 12 digits, no +: we cannot know where the country code ends.
    assert.equal(formatPhoneInput('442079460958'), '442079460958')
  })
})
