import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { validateZoneCapacityInput } from '../lib/business-readiness.ts'
import { zoneNumericDraftValue } from '../lib/dining-zones.ts'

/**
 * The Avg stay field used to read `Math.max(15, parseInt(v, 10) || 70)`, so the
 * three inputs a validator most needs to see — blank, 14, 14.5 — could never
 * reach it: they became 70, 15 and 15 while the owner was still typing. The
 * save-time turnover check was therefore unreachable through the real Settings
 * UI, and an owner who typed a number the venue could not honour was shown a
 * different number instead of an error. These tests pin the edit-time contract:
 * carry what was typed, mark blank as incomplete, invent nothing.
 */

describe('a numeric zone field carries what the owner typed', () => {
  it('a cleared field is incomplete (0), not a substituted default', () => {
    assert.equal(zoneNumericDraftValue(''), 0)
    assert.equal(zoneNumericDraftValue('   '), 0)
  })

  it('keeps a value below the minimum instead of clamping it up', () => {
    assert.equal(zoneNumericDraftValue('14'), 14)
    assert.equal(zoneNumericDraftValue('1'), 1)
    assert.equal(zoneNumericDraftValue('0'), 0)
  })

  it('keeps a fractional value whole — neither truncated nor rounded', () => {
    // `parseInt` would have made this 14 and then the clamp 15; either way the
    // owner would never learn the field rejects fractions.
    assert.equal(zoneNumericDraftValue('14.5'), 14.5)
    assert.equal(zoneNumericDraftValue('44.9'), 44.9)
  })

  it('keeps a valid value untouched', () => {
    assert.equal(zoneNumericDraftValue('15'), 15)
    assert.equal(zoneNumericDraftValue('45'), 45)
    assert.equal(zoneNumericDraftValue('90'), 90)
  })

  it('keeps a negative value so the validator can reject it by name', () => {
    assert.equal(zoneNumericDraftValue('-5'), -5)
  })

  it('leaves the draft alone when the field holds no number at all', () => {
    // A half-typed exponent or a lone sign is mid-keystroke, not a new value —
    // blanking the draft here would erase digits the owner already entered.
    for (const raw of ['-', '+', 'e', '1e', 'abc', '1.2.3']) {
      assert.equal(zoneNumericDraftValue(raw), null, raw)
    }
  })

  it('never returns 70, whatever it is given', () => {
    for (const raw of ['', '  ', '0', '14', '14.5', '-1', 'abc', '-']) {
      assert.notEqual(zoneNumericDraftValue(raw), 70, raw)
    }
  })
})

describe('what the field now carries is what the validator rejects', () => {
  const zone = (turnoverMinutes: unknown) => ({
    name: 'Patio',
    capacity: 8,
    minPartySize: 1,
    maxPartySize: 4,
    turnoverMinutes,
  })

  it('blank reaches the validator as incomplete and is refused', () => {
    const result = validateZoneCapacityInput(zone(zoneNumericDraftValue('')))
    assert.equal(result.ok, false)
    assert.match(result.ok ? '' : result.message, /average turnover time/i)
  })

  it('14 reaches the validator as 14 and is refused', () => {
    const typed = zoneNumericDraftValue('14')
    assert.equal(typed, 14)
    const result = validateZoneCapacityInput(zone(typed))
    assert.equal(result.ok, false)
    assert.match(result.ok ? '' : result.message, /average turnover time/i)
  })

  it('14.5 reaches the validator as 14.5 and is refused as non-whole', () => {
    const typed = zoneNumericDraftValue('14.5')
    assert.equal(typed, 14.5)
    const result = validateZoneCapacityInput(zone(typed))
    assert.equal(result.ok, false)
    assert.match(result.ok ? '' : result.message, /whole number/i)
  })

  it('15 reaches the validator as 15 and is accepted', () => {
    const result = validateZoneCapacityInput(zone(zoneNumericDraftValue('15')))
    assert.equal(result.ok, true)
    assert.equal(result.ok && result.turnoverMinutes, 15)
  })

  it('45 reaches the validator as 45 and is accepted', () => {
    const result = validateZoneCapacityInput(zone(zoneNumericDraftValue('45')))
    assert.equal(result.ok, true)
    assert.equal(result.ok && result.turnoverMinutes, 45)
  })
})

describe('the Avg stay field is wired to this helper', () => {
  const source = readFileSync(
    new URL('../components/dining-zones-panel.tsx', import.meta.url),
    'utf8',
  )

  it('no onChange handler clamps or defaults the turnover draft', () => {
    // The exact shape of the old bug, so a revert fails here rather than in a
    // browser six weeks later.
    assert.doesNotMatch(source, /turnover_minutes:\s*Math\.max/)
    assert.doesNotMatch(source, /parseInt\(e\.target\.value,\s*10\)\s*\|\|\s*70/)
  })

  it('reads the field through zoneNumericDraftValue', () => {
    assert.match(source, /zoneNumericDraftValue\(e\.target\.value\)/)
  })

  it('renders an incomplete turnover draft as a blank field', () => {
    assert.match(source, /value=\{zone\.turnover_minutes \|\| ''\}/)
  })

  it('steps by 1, because the contract is any whole number >= 15', () => {
    assert.doesNotMatch(source, /step=\{15\}/)
  })
})
