import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  evaluateBusinessReadiness,
  isUsableDiningZone,
  loadBusinessReadiness,
  type DiningZoneReadinessInput,
} from '../lib/business-readiness.ts'
import { parseDiningZoneRow } from '../lib/dining-zones.ts'
import { DEFAULT_OPERATING_HOURS } from '../lib/operating-hours.ts'

const OPEN_HOURS = { ...DEFAULT_OPERATING_HOURS }
const CONFIRMED = '2026-08-01T12:00:00.000Z'

const VALID_ZONE: DiningZoneReadinessInput = {
  is_active: true,
  max_concurrent_parties: 40,
  min_party_size: 1,
  max_party_size: 8,
  turnover_minutes: 45,
}

function bookingReadyWithZone(zone: DiningZoneReadinessInput): boolean {
  return evaluateBusinessReadiness({
    timezone: 'America/Toronto',
    operatingHours: OPEN_HOURS,
    operatingHoursConfirmedAt: CONFIRMED,
    zones: [zone],
    menuItemCount: 0,
    menuPdfText: null,
  }).bookingReady
}

describe('readiness/parser contract parity — turnover', () => {
  it('invalid (non-finite) turnover makes bookingReady false', () => {
    assert.equal(bookingReadyWithZone({ ...VALID_ZONE, turnover_minutes: NaN }), false)
  })

  it('missing turnover makes bookingReady false', () => {
    const { turnover_minutes, ...withoutTurnover } = VALID_ZONE
    assert.equal(bookingReadyWithZone(withoutTurnover), false)
  })

  it('turnover 14 makes bookingReady false', () => {
    assert.equal(bookingReadyWithZone({ ...VALID_ZONE, turnover_minutes: 14 }), false)
  })

  it('turnover 15 is accepted', () => {
    assert.equal(bookingReadyWithZone({ ...VALID_ZONE, turnover_minutes: 15 }), true)
  })
})

describe('readiness/parser contract parity — capacity and party size', () => {
  it('fractional capacity makes bookingReady false', () => {
    assert.equal(bookingReadyWithZone({ ...VALID_ZONE, max_concurrent_parties: 8.5 }), false)
  })

  it('fractional min party makes bookingReady false', () => {
    assert.equal(bookingReadyWithZone({ ...VALID_ZONE, min_party_size: 1.5 }), false)
  })

  it('fractional max party makes bookingReady false', () => {
    assert.equal(bookingReadyWithZone({ ...VALID_ZONE, max_party_size: 8.5 }), false)
  })

  it('max party above capacity makes bookingReady false', () => {
    assert.equal(
      bookingReadyWithZone({ ...VALID_ZONE, max_concurrent_parties: 4, max_party_size: 8 }),
      false,
    )
  })
})

describe('readiness/parser contract parity — is_active', () => {
  it('missing is_active makes bookingReady false', () => {
    const { is_active, ...withoutActive } = VALID_ZONE
    assert.equal(bookingReadyWithZone(withoutActive), false)
  })

  it('string "true" does not count as active', () => {
    assert.equal(
      bookingReadyWithZone({ ...VALID_ZONE, is_active: 'true' as unknown as boolean }),
      false,
    )
  })

  it('is_active: false makes bookingReady false', () => {
    assert.equal(bookingReadyWithZone({ ...VALID_ZONE, is_active: false }), false)
  })
})

describe('readiness/parser contract parity — the happy path still works', () => {
  it('one fully valid active zone makes bookingReady true when hours are ready', () => {
    assert.equal(bookingReadyWithZone(VALID_ZONE), true)
  })
})

describe('parseDiningZoneRow and isUsableDiningZone agree on the same raw rows', () => {
  const rows: Record<string, unknown>[] = [
    { id: 'z1', business_id: 'b', ...VALID_ZONE },
    { id: 'z2', business_id: 'b', ...VALID_ZONE, max_concurrent_parties: undefined },
    { id: 'z3', business_id: 'b', ...VALID_ZONE, turnover_minutes: 14 },
    { id: 'z4', business_id: 'b', ...VALID_ZONE, turnover_minutes: undefined },
    { id: 'z5', business_id: 'b', ...VALID_ZONE, max_concurrent_parties: 8.5 },
    { id: 'z6', business_id: 'b', ...VALID_ZONE, max_party_size: 999 },
    { id: 'z7', business_id: 'b', ...VALID_ZONE, is_active: 'true' },
    { id: 'z8', business_id: 'b', ...VALID_ZONE, is_active: undefined },
    { id: 'z9', business_id: 'b', ...VALID_ZONE, is_active: false }, // structurally valid, inactive
  ]

  it('usable implies parseable, for every row', () => {
    for (const row of rows) {
      if (isUsableDiningZone(row)) {
        assert.notEqual(parseDiningZoneRow(row), null, `row ${row.id} was usable but not parseable`)
      }
    }
  })

  it('for active rows, usable and parseable agree exactly', () => {
    for (const row of rows) {
      if (row.is_active !== true) continue
      assert.equal(
        isUsableDiningZone(row),
        parseDiningZoneRow(row) !== null,
        `row ${row.id} disagreed between isUsableDiningZone and parseDiningZoneRow`,
      )
    }
  })

  it('a structurally valid but inactive row parses but is not usable', () => {
    const inactiveRow = rows.find((r) => r.id === 'z9')!
    assert.notEqual(parseDiningZoneRow(inactiveRow), null)
    assert.equal(isUsableDiningZone(inactiveRow), false)
  })
})

describe('loadBusinessReadiness — pre-migration compatibility respects the unified contract', () => {
  function fakeSupabase(opts: {
    businessResponses: { data: unknown; error: { message: string } | null }[]
    zoneRows: Record<string, unknown>[]
    menuCount: number
  }): SupabaseClient {
    let bizCallIndex = 0
    const from = (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => {
          if (table === 'businesses') {
            const resp =
              opts.businessResponses[bizCallIndex] ??
              opts.businessResponses[opts.businessResponses.length - 1]
            bizCallIndex++
            return Promise.resolve(resp)
          }
          return Promise.resolve({ data: null, error: null })
        },
        then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) => {
          let result: unknown
          if (table === 'dining_zones') result = { data: opts.zoneRows, error: null }
          else if (table === 'services') result = { count: opts.menuCount, error: null }
          else result = { data: null, error: null }
          return Promise.resolve(result).then(onFulfilled, onRejected)
        },
      }
      return query
    }
    return { from } as unknown as SupabaseClient
  }

  const SCHEMA_ERROR = {
    message: 'column businesses.operating_hours_confirmed_at does not exist',
  }
  const BIZ_ROW = { timezone: 'America/Toronto', operating_hours: OPEN_HOURS, menu_pdf_text: null }

  it('an invalid zone never lets the pre-migration fallback infer confirmed hours', async () => {
    const supabase = fakeSupabase({
      businessResponses: [
        { data: null, error: SCHEMA_ERROR },
        { data: BIZ_ROW, error: null },
      ],
      zoneRows: [{ ...VALID_ZONE, turnover_minutes: 0 }], // invalid: below the floor
      menuCount: 0,
    })
    const readiness = await loadBusinessReadiness(supabase, 'biz-1')
    assert.equal(readiness.hasUsableZone, false)
    assert.equal(readiness.hoursConfirmed, false)
    assert.equal(readiness.bookingReady, false)
  })

  it('a genuinely valid zone still lets the pre-migration fallback work', async () => {
    const supabase = fakeSupabase({
      businessResponses: [
        { data: null, error: SCHEMA_ERROR },
        { data: BIZ_ROW, error: null },
      ],
      zoneRows: [VALID_ZONE],
      menuCount: 0,
    })
    const readiness = await loadBusinessReadiness(supabase, 'biz-2')
    assert.equal(readiness.hasUsableZone, true)
    assert.equal(readiness.hoursConfirmed, true)
    assert.equal(readiness.bookingReady, true)
  })
})
