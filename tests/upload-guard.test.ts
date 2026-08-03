import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  businessIdFromUrl,
  declaredBodyTooLarge,
  MULTIPART_OVERHEAD_ALLOWANCE_BYTES,
} from '../lib/upload-guard.ts'

const MB = 1024 * 1024
/** The route's own limit at the time of writing; the guard takes it as an argument. */
const MAX = 8 * MB

describe('an unauthorized large upload is refused before the body is read', () => {
  it('resolves the venue from the URL, with no body involved', () => {
    // This is what makes authorization possible before formData(): the id is in
    // the request line, not in the multipart payload.
    assert.equal(
      businessIdFromUrl('https://app.example.com/api/menu/pdf?business_id=abc-123'),
      'abc-123',
    )
  })

  it('has no venue to authorize against when the id is missing — 400, not a read', () => {
    for (const url of [
      'https://app.example.com/api/menu/pdf',
      'https://app.example.com/api/menu/pdf?business_id=',
      'https://app.example.com/api/menu/pdf?business_id=%20%20',
      'https://app.example.com/api/menu/pdf?other=1',
    ]) {
      assert.equal(businessIdFromUrl(url), null, url)
    }
  })

  it('turns a wildly oversized declared body away before reading it', () => {
    // 500 MB aimed at an 8 MB limit: refused on the header alone.
    assert.equal(declaredBodyTooLarge(String(500 * MB), MAX), true)
    assert.equal(declaredBodyTooLarge(500 * MB, MAX), true)
  })

  it('refuses anything past the limit plus multipart slack', () => {
    assert.equal(declaredBodyTooLarge(MAX + MULTIPART_OVERHEAD_ALLOWANCE_BYTES + 1, MAX), true)
  })
})

describe('the pre-check never turns away a legitimate upload', () => {
  it('allows a file exactly at the limit, framing included', () => {
    assert.equal(declaredBodyTooLarge(MAX, MAX), false)
    assert.equal(declaredBodyTooLarge(MAX + 400, MAX), false, 'multipart headers')
    assert.equal(declaredBodyTooLarge(MAX + MULTIPART_OVERHEAD_ALLOWANCE_BYTES, MAX), false)
  })

  it('allows ordinary sizes', () => {
    for (const size of [0, 1, 512, MB, 3 * MB, 7 * MB]) {
      assert.equal(declaredBodyTooLarge(size, MAX), false, String(size))
    }
  })

  it('cannot tell without a Content-Length, so it does not guess', () => {
    // A chunked upload has no header. Refusing here would break real uploads;
    // the authoritative limit is the parsed file's own size, checked later.
    for (const header of [null, undefined, '', 'not-a-number', '-1', 'NaN']) {
      assert.equal(declaredBodyTooLarge(header, MAX), false, JSON.stringify(header))
    }
  })

  it('is advisory only — the real limit still lives downstream', () => {
    // A client can under-declare. The pre-check lets it through; file.size does
    // not, and that is the check that cannot be lied to.
    assert.equal(declaredBodyTooLarge('10', MAX), false)
  })
})

describe('URL parsing is total', () => {
  it('trims the id', () => {
    assert.equal(businessIdFromUrl('https://x.test/api?business_id=%20abc%20'), 'abc')
  })

  it('returns null for a malformed URL instead of throwing', () => {
    assert.equal(businessIdFromUrl('not a url'), null)
    assert.equal(businessIdFromUrl(''), null)
  })

  it('takes the first value when the parameter repeats', () => {
    assert.equal(businessIdFromUrl('https://x.test/api?business_id=one&business_id=two'), 'one')
  })
})
