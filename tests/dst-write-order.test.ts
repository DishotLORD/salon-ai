import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { isSlotAvailable } from '../lib/booking-availability.ts'
import type { DiningZone } from '../lib/dining-zones.ts'
import {
  DST_GAP_MESSAGE,
  scheduledAtToWallClock,
  venueCalendarDayKey,
  venueTimeHmFromDate,
} from '../lib/booking-wall-clock.ts'
import { resolveBusinessTimezone } from '../lib/business-timezone.ts'
import { parseBookingSettings } from '../lib/booking-settings.ts'
import { parseOperatingHours } from '../lib/operating-hours.ts'
import {
  afterResolvedWriteWallClock,
  prepareReservationWriteWallClock,
} from '../lib/reservation-write-wall-clock.ts'
import { wallClockToDbIso } from '../lib/reservation-schedule.ts'

const OPEN_ALL_DAY = parseOperatingHours({
  sun: { open: '00:00', close: '23:45', closed: false },
  mon: { open: '00:00', close: '23:45', closed: false },
  tue: { open: '00:00', close: '23:45', closed: false },
  wed: { open: '00:00', close: '23:45', closed: false },
  thu: { open: '00:00', close: '23:45', closed: false },
  fri: { open: '00:00', close: '23:45', closed: false },
  sat: { open: '00:00', close: '23:45', closed: false },
})

const SETTINGS = parseBookingSettings({
  max_advance_days: 365,
  min_notice_minutes: 0,
  slot_interval_minutes: 15,
  default_duration_minutes: 90,
  max_concurrent_reservations: 50,
  require_contact_before_booking: true,
  average_check: 0,
})

/**
 * Annotated rather than inferred, so a column added to the production
 * DiningZone surfaces here as a compile error instead of leaving the fixture a
 * shape the code under test never actually receives.
 */
const ZONE: DiningZone = {
  id: 'zone-main',
  business_id: 'biz-test-dst-write-order',
  name: 'Main dining',
  slug: 'main-dining',
  max_concurrent_parties: 50,
  min_party_size: 1,
  max_party_size: 12,
  turnover_minutes: 90,
  is_active: true,
  sort_order: 0,
}

/**
 * Mirrors create_reservation / reschedule_reservation after snap:
 * prepareReservationWriteWallClock → (only if ok) isSlotAvailable.
 * This is the deterministic stand-in for the tool handler time phase —
 * the chat route calls the same prepare helper before availability.
 */
function createReservationWriteTimePhase(wallClock: string, timeZone: 'America/Toronto' | 'America/Vancouver' | 'America/Edmonton') {
  let availabilityCalls = 0
  let insertCalls = 0

  const gated = afterResolvedWriteWallClock(
    wallClock,
    timeZone,
    SETTINGS.slot_interval_minutes,
    (prepared) => {
      availabilityCalls += 1
      const available = isSlotAvailable({
        wallClock: prepared.wallClock,
        operatingHours: OPEN_ALL_DAY,
        existing: [],
        settings: SETTINGS,
        timeZone,
        now: { year: 2026, month: 8, day: 3, hour: 12, minute: 0 },
        zones: [ZONE],
        partySize: 2,
        zoneId: ZONE.id,
      })
      if (!available) {
        return { kind: 'not_available' as const }
      }
      insertCalls += 1
      return {
        kind: 'insert' as const,
        scheduled_at: prepared.resolved.iso,
        wallClock: prepared.wallClock,
      }
    },
  )

  if (!gated.ok) {
    return {
      outcome: gated,
      availabilityCalls,
      insertCalls,
      appointment: null as null | { scheduled_at: string; wallClock: string },
    }
  }

  /*
   * `gated.ok` alone reaches `next` — that is the point of the narrowed return
   * type, and reading it here without a further check is the regression test:
   * widen the success side back to include a `next`-less member and this stops
   * compiling, so `npm run test:types` catches it rather than a reviewer.
   */
  if (gated.next.kind === 'not_available') {
    return {
      outcome: {
        ok: false as const,
        error: 'not_available',
        message: 'That time is not available.',
      },
      availabilityCalls,
      insertCalls,
      appointment: null,
    }
  }

  return {
    outcome: { ok: true as const, ...gated.next },
    availabilityCalls,
    insertCalls,
    appointment: {
      scheduled_at: gated.next.scheduled_at,
      wallClock: gated.next.wallClock,
    },
  }
}

function rescheduleWriteTimePhase(
  originalScheduledAt: string,
  newWallClock: string,
  timeZone: 'America/Toronto',
) {
  let updateCalls = 0
  const original = originalScheduledAt

  const gated = afterResolvedWriteWallClock(
    newWallClock,
    timeZone,
    SETTINGS.slot_interval_minutes,
    (prepared) => {
      updateCalls += 1
      return { scheduled_at: prepared.resolved.iso }
    },
  )

  if (!gated.ok) {
    return {
      outcome: gated,
      updateCalls,
      scheduled_at: original,
    }
  }

  // Reaches `next` off `ok` alone, same as the create path above.
  return {
    outcome: { ok: true as const, scheduled_at: gated.next.scheduled_at },
    updateCalls,
    scheduled_at: gated.next.scheduled_at,
  }
}

describe('A. Spring-forward create (write gate before availability)', () => {
  it('returns DST_GAP_MESSAGE, skips availability, and does not insert', () => {
    const result = createReservationWriteTimePhase(
      '2027-03-14T02:30:00',
      'America/Toronto',
    )

    assert.equal(result.outcome.ok, false)
    if (result.outcome.ok) return
    assert.equal(result.outcome.error, 'nonexistent_local_time')
    assert.equal(result.outcome.message, DST_GAP_MESSAGE)
    assert.equal(result.availabilityCalls, 0)
    assert.equal(result.insertCalls, 0)
    assert.equal(result.appointment, null)

    // Same gate the dashboard create/edit path uses.
    const dash = wallClockToDbIso('2027-03-14T02:30:00', 'America/Toronto')
    assert.equal(dash.ok, false)
    if (!dash.ok) assert.equal(dash.message, DST_GAP_MESSAGE)
  })
})

describe('B. Spring-forward reschedule', () => {
  it('returns DST_GAP_MESSAGE and leaves the original instant unchanged', () => {
    const original = '2026-11-01T05:30:00.000Z'
    const result = rescheduleWriteTimePhase(
      original,
      '2027-03-14T02:30:00',
      'America/Toronto',
    )

    assert.equal(result.outcome.ok, false)
    if (result.outcome.ok) return
    assert.equal(result.outcome.error, 'nonexistent_local_time')
    assert.equal(result.outcome.message, DST_GAP_MESSAGE)
    assert.equal(result.updateCalls, 0)
    assert.equal(result.scheduled_at, original)
  })
})

describe('C. Fall-back create', () => {
  it('stores the earlier UTC instant and reads back 01:30 on 2026-11-01', () => {
    const result = createReservationWriteTimePhase(
      '2026-11-01T01:30:00',
      'America/Toronto',
    )

    assert.equal(result.outcome.ok, true)
    assert.equal(result.availabilityCalls, 1)
    assert.equal(result.insertCalls, 1)
    assert.ok(result.appointment)
    assert.equal(result.appointment!.scheduled_at, '2026-11-01T05:30:00.000Z')

    const wall = scheduledAtToWallClock(
      result.appointment!.scheduled_at,
      'America/Toronto',
    )
    assert.equal(wall, '2026-11-01T01:30:00')
    const instant = new Date(result.appointment!.scheduled_at)
    assert.equal(venueCalendarDayKey(instant, 'America/Toronto'), '2026-11-01')
    assert.equal(venueTimeHmFromDate(instant, 'America/Toronto'), '01:30')
  })
})

describe('create_reservation / reschedule source order', () => {
  it('chat tool handlers resolve write wall-clock before isSlotAvailable', () => {
    const src = readFileSync(
      new URL('../app/api/chat/route.ts', import.meta.url),
      'utf8',
    )
    // Dining create: prepare gate appears before the first isSlotAvailable in
    // runCreateReservation (both live in this file).
    const createFn = src.indexOf('async function runCreateReservation')
    const rescheduleFn = src.indexOf('async function runRescheduleReservation')
    assert.ok(createFn >= 0 && rescheduleFn > createFn)

    const createBlock = src.slice(createFn, rescheduleFn)
    const prepareInCreate = createBlock.indexOf('prepareReservationWriteWallClock')
    const availInCreate = createBlock.indexOf('isSlotAvailable')
    assert.ok(prepareInCreate >= 0, 'create must call prepareReservationWriteWallClock')
    assert.ok(availInCreate >= 0, 'create still checks availability after resolve')
    assert.ok(
      prepareInCreate < availInCreate,
      'create must resolve wall-clock before availability',
    )

    const bookActivityFn = src.indexOf('async function runBookActivity')
    const rescheduleBlock = src.slice(rescheduleFn, bookActivityFn > rescheduleFn ? bookActivityFn : undefined)
    const prepareInReschedule = rescheduleBlock.indexOf('prepareReservationWriteWallClock')
    const availInReschedule = rescheduleBlock.indexOf('isSlotAvailable')
    assert.ok(prepareInReschedule >= 0)
    assert.ok(availInReschedule >= 0)
    assert.ok(
      prepareInReschedule < availInReschedule,
      'reschedule must resolve wall-clock before availability',
    )
  })
})

describe('D. Normal regression', () => {
  it('Toronto normal 19:00 booking is unchanged', () => {
    const prepared = prepareReservationWriteWallClock(
      '2026-08-16T19:00:00',
      'America/Toronto',
      15,
    )
    assert.equal(prepared.ok, true)
    if (!prepared.ok) return
    assert.equal(prepared.prepared.resolved.iso, '2026-08-16T23:00:00.000Z')
    assert.equal(
      scheduledAtToWallClock(prepared.prepared.resolved.iso, 'America/Toronto'),
      '2026-08-16T19:00:00',
    )
  })

  it('Vancouver late-evening stays on the venue day after UTC midnight', () => {
    const prepared = prepareReservationWriteWallClock(
      '2026-08-16T21:30:00',
      'America/Vancouver',
      15,
    )
    assert.equal(prepared.ok, true)
    if (!prepared.ok) return
    assert.equal(prepared.prepared.resolved.iso, '2026-08-17T04:30:00.000Z')
    assert.equal(
      venueCalendarDayKey(prepared.prepared.resolved.instant, 'America/Vancouver'),
      '2026-08-16',
    )
    assert.equal(
      venueTimeHmFromDate(prepared.prepared.resolved.instant, 'America/Vancouver'),
      '21:30',
    )
  })

  it('Calgary null-timezone booking still uses America/Edmonton', () => {
    const tz = resolveBusinessTimezone(null)
    assert.equal(tz, 'America/Edmonton')
    const prepared = prepareReservationWriteWallClock(
      '2026-08-16T19:00:00',
      tz,
      15,
    )
    assert.equal(prepared.ok, true)
    if (!prepared.ok) return
    assert.equal(prepared.prepared.resolved.iso, '2026-08-17T01:00:00.000Z')
    assert.equal(
      scheduledAtToWallClock(prepared.prepared.resolved.iso, tz),
      '2026-08-16T19:00:00',
    )
  })
})
