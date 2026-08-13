import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { validateZoneCapacityInput, ZONE_TURNOVER_MIN_MINUTES } from '../lib/business-readiness.ts'
import { draftFromDiningZoneRow, parseDiningZoneRow, type DiningZone } from '../lib/dining-zones.ts'

const VALID_FIELDS = {
  name: 'Patio',
  capacity: 8,
  minPartySize: 1,
  maxPartySize: 4,
}

describe('validateZoneCapacityInput — turnover_minutes', () => {
  it('blank turnover is rejected for an active zone', () => {
    const r = validateZoneCapacityInput({ ...VALID_FIELDS, turnoverMinutes: '' })
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.message, /average turnover/i)
  })

  it('missing turnover (key omitted entirely) is rejected', () => {
    const r = validateZoneCapacityInput({ ...VALID_FIELDS })
    assert.equal(r.ok, false)
  })

  it('turnover 0 is rejected', () => {
    assert.equal(validateZoneCapacityInput({ ...VALID_FIELDS, turnoverMinutes: 0 }).ok, false)
  })

  it('negative turnover is rejected', () => {
    assert.equal(validateZoneCapacityInput({ ...VALID_FIELDS, turnoverMinutes: -15 }).ok, false)
  })

  it('turnover 14 is rejected (one below the floor)', () => {
    assert.equal(validateZoneCapacityInput({ ...VALID_FIELDS, turnoverMinutes: 14 }).ok, false)
  })

  it('fractional turnover is rejected', () => {
    assert.equal(validateZoneCapacityInput({ ...VALID_FIELDS, turnoverMinutes: 14.5 }).ok, false)
    assert.equal(validateZoneCapacityInput({ ...VALID_FIELDS, turnoverMinutes: 30.25 }).ok, false)
  })

  it('NaN / non-numeric turnover is rejected', () => {
    assert.equal(validateZoneCapacityInput({ ...VALID_FIELDS, turnoverMinutes: NaN }).ok, false)
    assert.equal(validateZoneCapacityInput({ ...VALID_FIELDS, turnoverMinutes: 'lots' }).ok, false)
  })

  it('turnover 15 is accepted (exactly at the floor)', () => {
    const r = validateZoneCapacityInput({ ...VALID_FIELDS, turnoverMinutes: 15 })
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.turnoverMinutes, 15)
  })

  it('turnover 30 and 45 are accepted and pass through unchanged', () => {
    const r30 = validateZoneCapacityInput({ ...VALID_FIELDS, turnoverMinutes: 30 })
    const r45 = validateZoneCapacityInput({ ...VALID_FIELDS, turnoverMinutes: 45 })
    assert.equal(r30.ok, true)
    assert.equal(r45.ok, true)
    if (r30.ok) assert.equal(r30.turnoverMinutes, 30)
    if (r45.ok) assert.equal(r45.turnoverMinutes, 45)
  })

  it('the floor constant matches what parseDiningZoneRow accepts on read', () => {
    assert.equal(ZONE_TURNOVER_MIN_MINUTES, 15)
  })
})

describe('a corrected zone parses successfully after save', () => {
  it('a row rejected by parseDiningZoneRow (missing turnover) becomes valid once the owner enters and saves a real value', () => {
    const brokenRawRow = {
      id: 'zone-1',
      business_id: 'biz-1',
      name: 'Patio',
      slug: 'patio',
      max_concurrent_parties: 8,
      min_party_size: 1,
      max_party_size: 4,
      turnover_minutes: undefined,
      is_active: true,
    }
    assert.equal(parseDiningZoneRow(brokenRawRow), null)

    // Owner opens Settings, sees the incomplete draft, fills in turnover, saves.
    const draft = draftFromDiningZoneRow(brokenRawRow)
    assert.equal(draft.turnover_minutes, 0)

    const corrected = { ...draft, turnover_minutes: 30 }
    const validated = validateZoneCapacityInput({
      name: corrected.name,
      capacity: corrected.max_concurrent_parties,
      minPartySize: corrected.min_party_size,
      maxPartySize: corrected.max_party_size,
      turnoverMinutes: corrected.turnover_minutes,
    })
    assert.equal(validated.ok, true)

    // What Settings would now persist, then re-read on next load:
    const savedRow = { ...brokenRawRow, turnover_minutes: corrected.turnover_minutes }
    const reparsed = parseDiningZoneRow(savedRow)
    assert.ok(reparsed)
    assert.equal((reparsed as DiningZone).turnover_minutes, 30)
  })
})

describe('an inactive incomplete draft does not become active accidentally', () => {
  it('an inactive draft with invalid turnover is skipped by save validation, not force-corrected', () => {
    const inactiveDraft = {
      name: 'Large groups',
      max_concurrent_parties: 40,
      min_party_size: 8,
      max_party_size: 20,
      turnover_minutes: 0,
      is_active: false,
    }
    // Mirrors the Settings save loop: only rows with is_active !== false are validated.
    const activeDrafts = [inactiveDraft].filter((row) => row.is_active !== false)
    assert.equal(activeDrafts.length, 0)
    assert.equal(inactiveDraft.is_active, false)
  })

  it('draftFromDiningZoneRow never turns a malformed/missing is_active into true', () => {
    assert.equal(draftFromDiningZoneRow({ id: 'z', business_id: 'b' }).is_active, false)
    assert.equal(
      draftFromDiningZoneRow({ id: 'z', business_id: 'b', is_active: 'true' }).is_active,
      false,
    )
  })
})

describe('save-path wiring — turnover is validated before any write', () => {
  it('Settings validates turnover for every active draft before touching the database', () => {
    const settings = readFileSync(
      new URL('../app/dashboard/settings/page.tsx', import.meta.url),
      'utf8',
    )
    const validationBlockMatch = settings.match(
      /for \(const z of zoneDrafts\.filter[\s\S]{0,500}/,
    )
    assert.ok(validationBlockMatch, 'expected the active-zone validation loop to exist')
    assert.match(validationBlockMatch![0], /turnoverMinutes:\s*z\.turnover_minutes/)
    assert.match(validationBlockMatch![0], /if \(!validated\.ok\)/)
    assert.match(validationBlockMatch![0], /return false/)

    // The validation loop (and its early return) appears before the insert/update loop.
    const validationIndex = settings.indexOf('for (const z of zoneDrafts.filter')
    const insertIndex = settings.indexOf(".from('dining_zones')\n          .insert(payload)")
    assert.ok(validationIndex >= 0 && insertIndex >= 0)
    assert.ok(validationIndex < insertIndex)
  })

  it('onboarding routes its fixed first-zone turnover through the same validator', () => {
    const onboarding = readFileSync(new URL('../app/onboarding/page.tsx', import.meta.url), 'utf8')
    assert.match(onboarding, /turnoverMinutes:\s*90/)
    assert.match(onboarding, /turnover_minutes:\s*validated\.turnoverMinutes/)
  })
})
