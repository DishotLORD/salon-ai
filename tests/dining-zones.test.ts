import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  activeZonesForParty,
  draftFromDiningZoneRow,
  parseDiningZoneRow,
  zoneAcceptsParty,
  type DiningZone,
} from '../lib/dining-zones.ts'
import { isUsableDiningZone } from '../lib/business-readiness.ts'

const VALID_ROW: Record<string, unknown> = {
  id: 'zone-1',
  business_id: 'biz-1',
  name: 'Patio',
  slug: 'patio',
  max_concurrent_parties: 8,
  min_party_size: 1,
  max_party_size: 4,
  turnover_minutes: 45,
  is_active: true,
  sort_order: 0,
}

function without(row: Record<string, unknown>, key: string): Record<string, unknown> {
  const next = { ...row }
  delete next[key]
  return next
}

describe('parseDiningZoneRow — no invented values', () => {
  it('a real owner-entered capacity of 8 stays 8, never becomes 150', () => {
    const zone = parseDiningZoneRow(VALID_ROW)
    assert.ok(zone)
    assert.equal(zone!.max_concurrent_parties, 8)
  })

  it('missing capacity is rejected, never defaults to 150', () => {
    assert.equal(parseDiningZoneRow(without(VALID_ROW, 'max_concurrent_parties')), null)
  })

  it('non-finite / non-integer / non-positive capacity is rejected', () => {
    assert.equal(parseDiningZoneRow({ ...VALID_ROW, max_concurrent_parties: 'lots' }), null)
    assert.equal(parseDiningZoneRow({ ...VALID_ROW, max_concurrent_parties: NaN }), null)
    assert.equal(parseDiningZoneRow({ ...VALID_ROW, max_concurrent_parties: 8.5 }), null)
    assert.equal(parseDiningZoneRow({ ...VALID_ROW, max_concurrent_parties: 0 }), null)
    assert.equal(parseDiningZoneRow({ ...VALID_ROW, max_concurrent_parties: -5 }), null)
  })

  it('missing max_party_size is rejected, never defaults to 12', () => {
    assert.equal(parseDiningZoneRow(without(VALID_ROW, 'max_party_size')), null)
  })

  it('missing turnover_minutes is rejected, never defaults to 70', () => {
    assert.equal(parseDiningZoneRow(without(VALID_ROW, 'turnover_minutes')), null)
  })

  it('turnover below 15 minutes is rejected', () => {
    assert.equal(parseDiningZoneRow({ ...VALID_ROW, turnover_minutes: 10 }), null)
  })

  it('max_party_size below min_party_size is rejected', () => {
    assert.equal(parseDiningZoneRow({ ...VALID_ROW, min_party_size: 6, max_party_size: 4 }), null)
  })

  it('max_party_size above capacity is rejected', () => {
    assert.equal(
      parseDiningZoneRow({ ...VALID_ROW, max_concurrent_parties: 3, max_party_size: 4 }),
      null,
    )
  })

  it('missing is_active never silently becomes active', () => {
    assert.equal(parseDiningZoneRow(without(VALID_ROW, 'is_active')), null)
  })

  it('malformed is_active (non-boolean) is rejected, not coerced to true', () => {
    assert.equal(parseDiningZoneRow({ ...VALID_ROW, is_active: 'true' }), null)
    assert.equal(parseDiningZoneRow({ ...VALID_ROW, is_active: 1 }), null)
  })

  it('a real explicit is_active: false parses and the zone stays disabled', () => {
    const zone = parseDiningZoneRow({ ...VALID_ROW, is_active: false })
    assert.ok(zone)
    assert.equal(zone!.is_active, false)
  })

  it('valid existing values remain unchanged end-to-end', () => {
    const zone = parseDiningZoneRow(VALID_ROW)
    assert.deepEqual(zone, {
      id: 'zone-1',
      business_id: 'biz-1',
      name: 'Patio',
      slug: 'patio',
      max_concurrent_parties: 8,
      min_party_size: 1,
      max_party_size: 4,
      turnover_minutes: 45,
      is_active: true,
      sort_order: 0,
    })
  })

  it('malformed or empty rows do not crash — return null instead of throwing', () => {
    assert.doesNotThrow(() => parseDiningZoneRow({}))
    assert.equal(parseDiningZoneRow({}), null)
    assert.doesNotThrow(() =>
      parseDiningZoneRow({
        id: 'z',
        business_id: 'b',
        max_concurrent_parties: null,
        min_party_size: undefined,
        max_party_size: {},
        turnover_minutes: [],
        is_active: 'nope',
      }),
    )
  })
})

describe('draftFromDiningZoneRow — Settings editor shows broken rows, never invents plausible values', () => {
  it('missing capacity becomes 0 (rendered blank by the editor), never 150', () => {
    assert.equal(draftFromDiningZoneRow({ id: 'z', business_id: 'b' }).max_concurrent_parties, 0)
  })

  it('missing max_party_size becomes 0, never 12', () => {
    assert.equal(draftFromDiningZoneRow({ id: 'z', business_id: 'b' }).max_party_size, 0)
  })

  it('missing turnover_minutes becomes 0, never 70', () => {
    assert.equal(draftFromDiningZoneRow({ id: 'z', business_id: 'b' }).turnover_minutes, 0)
  })

  it('missing/malformed is_active never becomes true', () => {
    assert.equal(draftFromDiningZoneRow({ id: 'z', business_id: 'b' }).is_active, false)
    assert.equal(
      draftFromDiningZoneRow({ id: 'z', business_id: 'b', is_active: 'yes' }).is_active,
      false,
    )
  })

  it('valid stored values pass through unchanged', () => {
    const draft = draftFromDiningZoneRow(VALID_ROW)
    assert.equal(draft.max_concurrent_parties, 8)
    assert.equal(draft.min_party_size, 1)
    assert.equal(draft.max_party_size, 4)
    assert.equal(draft.turnover_minutes, 45)
    assert.equal(draft.is_active, true)
  })

  it('does not throw on a completely empty or malformed row', () => {
    assert.doesNotThrow(() => draftFromDiningZoneRow({}))
    assert.doesNotThrow(() =>
      draftFromDiningZoneRow({ max_concurrent_parties: 'lots', turnover_minutes: NaN }),
    )
  })
})

describe('invalid zones cannot power availability or booking', () => {
  it('a row parseDiningZoneRow rejects can never reach activeZonesForParty / zoneAcceptsParty', () => {
    const rawRows: Record<string, unknown>[] = [
      VALID_ROW,
      { ...VALID_ROW, id: 'zone-broken', max_concurrent_parties: undefined },
    ]
    const zones = rawRows
      .map((r) => parseDiningZoneRow(r))
      .filter((z): z is DiningZone => z !== null)

    assert.equal(zones.length, 1)
    assert.equal(zones[0].id, 'zone-1')

    const eligible = activeZonesForParty(zones, 2)
    assert.ok(eligible.every((z) => z.id !== 'zone-broken'))
  })

  it('disabled zones remain disabled — never accept a party', () => {
    const zone = parseDiningZoneRow({ ...VALID_ROW, is_active: false })!
    assert.equal(zoneAcceptsParty(zone, 2), false)
  })

  it('a malformed row cannot make a business bookingReady (isUsableDiningZone agrees with parseDiningZoneRow)', () => {
    assert.equal(
      isUsableDiningZone({
        is_active: true,
        max_concurrent_parties: undefined,
        min_party_size: 1,
        max_party_size: 4,
        turnover_minutes: 30,
      }),
      false,
    )
    assert.equal(
      isUsableDiningZone({
        is_active: true,
        max_concurrent_parties: 8,
        min_party_size: 1,
        max_party_size: 4,
        turnover_minutes: 30,
      }),
      true,
    )
  })
})
