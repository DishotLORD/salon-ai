import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildAnalyticsReport } from '../lib/analytics.ts'
import {
  CANADIAN_BUSINESS_TIMEZONES,
  parseBusinessTimezoneInput,
  resolveBusinessTimezone,
  suggestTimezoneFromAddress,
} from '../lib/business-timezone.ts'
import {
  evaluateTimezoneChangeGate,
  TIMEZONE_CHANGE_BLOCKED_MESSAGE,
} from '../lib/business-timezone-change.ts'
import {
  DST_GAP_MESSAGE,
  formatDateKeyLabel,
  formatVenueTime,
  getVenuePartsFromInstant,
  resolveWallClockToUtc,
  scheduledAtToWallClock,
  venueCalendarDayKey,
  venueTimeHmFromDate,
} from '../lib/booking-wall-clock.ts'
import { reservationsToCsv } from '../lib/guest-csv.ts'
import { wallClockToDbIso } from '../lib/reservation-schedule.ts'
import type { Reservation } from '../components/reservation-card.tsx'

describe('business timezone resolve', () => {
  it('falls back null/invalid to America/Edmonton (Calgary unchanged)', () => {
    assert.equal(resolveBusinessTimezone(null), 'America/Edmonton')
    assert.equal(resolveBusinessTimezone(undefined), 'America/Edmonton')
    assert.equal(resolveBusinessTimezone('Europe/Paris'), 'America/Edmonton')
    assert.equal(resolveBusinessTimezone('America/Toronto'), 'America/Toronto')
  })

  it('rejects empty input for settings save', () => {
    assert.equal(parseBusinessTimezoneInput('').ok, false)
    assert.equal(parseBusinessTimezoneInput('America/Toronto').ok, true)
  })

  it('suggests Edmonton only for strong Alberta address signals', () => {
    assert.equal(
      suggestTimezoneFromAddress('123 Main St, Calgary, AB T2P 1A1'),
      'America/Edmonton',
    )
    assert.equal(suggestTimezoneFromAddress('Edmonton, Alberta'), 'America/Edmonton')
    assert.equal(suggestTimezoneFromAddress('Toronto, ON'), null)
    assert.equal(suggestTimezoneFromAddress('Vancouver, BC'), null)
  })
})

describe('Toronto 19:00 end-to-end (display / export / email / analytics / waitlist)', () => {
  const TZ = 'America/Toronto' as const
  const wall = '2026-08-16T19:00:00'

  it('stores UTC, reads back Toronto 19:00, and never shows Mountain 5:00 PM', () => {
    const resolved = resolveWallClockToUtc(wall, TZ)
    assert.equal(resolved.ok, true)
    if (!resolved.ok) return
    assert.equal(resolved.iso, '2026-08-16T23:00:00.000Z')
    assert.equal(scheduledAtToWallClock(resolved.iso, TZ), wall)
    assert.equal(formatVenueTime(resolved.instant, TZ), '7:00 PM')
    // Same instant under Edmonton would be 5:00 PM — must not leak into Toronto UI.
    assert.equal(formatVenueTime(resolved.instant, 'America/Edmonton'), '5:00 PM')
    assert.notEqual(formatVenueTime(resolved.instant, TZ), '5:00 PM')
  })

  it('exports CSV date/time as Toronto venue digits', () => {
    const resolved = resolveWallClockToUtc(wall, TZ)
    assert.equal(resolved.ok, true)
    if (!resolved.ok) return
    const reservation: Reservation = {
      id: 'r1',
      guestName: 'Ada',
      partySize: 2,
      tableNumber: '—',
      scheduledAt: resolved.instant,
      status: 'confirmed',
      specialRequests: '',
      customerId: null,
      conversationId: null,
      zoneId: null,
      zoneName: null,
      activityId: null,
      activityName: null,
    }
    const csv = reservationsToCsv([reservation], TZ)
    assert.match(csv, /2026-08-16/)
    assert.match(csv, /19:00/)
    assert.doesNotMatch(csv, /17:00/)
  })

  it('email date key and waitlist date_key stay on the Toronto calendar day', () => {
    const resolved = resolveWallClockToUtc(wall, TZ)
    assert.equal(resolved.ok, true)
    if (!resolved.ok) return
    const dayKey = venueCalendarDayKey(resolved.instant, TZ)
    assert.equal(dayKey, '2026-08-16')
    assert.match(formatDateKeyLabel(dayKey), /August/)
    assert.match(formatDateKeyLabel(dayKey), /16/)
  })

  it('analytics heatmap hour is Toronto 19, not Edmonton 17', () => {
    const resolved = resolveWallClockToUtc(wall, TZ)
    assert.equal(resolved.ok, true)
    if (!resolved.ok) return
    const report = buildAnalyticsReport(
      [
        {
          customer_id: 'c1',
          scheduled_at: resolved.iso,
          status: 'confirmed',
          party_size: 2,
          service_name: 'Ada · Party of 2',
          zone_id: null,
        },
      ],
      [],
      '7d',
      TZ,
      // Window must contain the booking; use an instant just after it.
      new Date('2026-08-17T12:00:00.000Z'),
    )
    const cell = report.heatmap.find((c) => c.count > 0)
    assert.ok(cell, 'expected a heatmap cell')
    assert.equal(cell!.hour, 19)
  })
})

describe('Vancouver late-evening stays on the venue day', () => {
  it('9:30 PM Vancouver remains on the same venue calendar day after UTC midnight', () => {
    const TZ = 'America/Vancouver' as const
    const wall = '2026-08-16T21:30:00'
    const resolved = resolveWallClockToUtc(wall, TZ)
    assert.equal(resolved.ok, true)
    if (!resolved.ok) return
    // Pacific is UTC−7 in August → 04:30Z next UTC day
    assert.equal(resolved.iso, '2026-08-17T04:30:00.000Z')
    assert.equal(venueCalendarDayKey(resolved.instant, TZ), '2026-08-16')
    assert.equal(venueTimeHmFromDate(resolved.instant, TZ), '21:30')
    assert.equal(resolved.iso.slice(0, 10), '2026-08-17')
  })
})

describe('browser timezone never influences venue formatting', () => {
  it('Toronto venue formats 7:00 PM even when Edmonton would show 5:00 PM for the same instant', () => {
    // Simulates an owner in Alberta looking at a Toronto venue: the formatter
    // takes an explicit IANA zone and never reads the runtime/browser zone.
    const instant = new Date('2026-08-16T23:00:00.000Z')
    assert.equal(formatVenueTime(instant, 'America/Toronto'), '7:00 PM')
    assert.equal(formatVenueTime(instant, 'America/Edmonton'), '5:00 PM')
    assert.equal(venueCalendarDayKey(instant, 'America/Toronto'), '2026-08-16')
  })
})

describe('DST policy', () => {
  it('spring-forward gap returns typed validation, never RangeError from toISOString', () => {
    const gap = resolveWallClockToUtc('2026-03-08T02:30:00', 'America/Toronto')
    assert.equal(gap.ok, false)
    if (gap.ok) return
    assert.equal(gap.reason, 'nonexistent_local_time')
    assert.equal(gap.message, DST_GAP_MESSAGE)
    assert.match(gap.message, /clocks change/i)

    const viaSchedule = wallClockToDbIso(
      '2026-03-08T02:30:00',
      'America/Toronto',
    )
    /*
     * `assert.equal` carries an `asserts` signature, so testing `.ok` against
     * false narrows the union here and now. The old follow-up guard was
     * therefore dead code over a `never`, and the `doesNotThrow` around it
     * proved nothing.
     *
     * Asserting the failure member directly is the stronger claim anyway: on the
     * spring-forward gap there is no `iso` to hand to `toISOString()` at all,
     * only guest-safe copy. Reading `.iso` below would not compile, which is
     * exactly the guarantee this test exists to pin down.
     */
    assert.equal(viaSchedule.ok, false)
    assert.equal(viaSchedule.reason, 'nonexistent_local_time')
    assert.equal(viaSchedule.message, DST_GAP_MESSAGE)
  })

  it('fall-back ambiguity chooses the documented earlier instant', () => {
    const utc = resolveWallClockToUtc('2026-11-01T01:30:00', 'America/Toronto')
    assert.equal(utc.ok, true)
    if (!utc.ok) return
    assert.equal(utc.ambiguous, true)
    // Earlier occurrence is EDT (UTC−4) → 05:30Z, not EST 06:30Z.
    assert.equal(utc.iso, '2026-11-01T05:30:00.000Z')
    const parts = getVenuePartsFromInstant(utc.instant, 'America/Toronto')
    assert.equal(parts.hour, 1)
    assert.equal(parts.minute, 30)
  })
})

describe('Canadian zone edge cases', () => {
  for (const tz of CANADIAN_BUSINESS_TIMEZONES) {
    it(`round-trips 19:00 on a summer Saturday in ${tz}`, () => {
      const wall = '2026-07-11T19:00:00'
      const resolved = resolveWallClockToUtc(wall, tz)
      assert.equal(resolved.ok, true)
      if (!resolved.ok) return
      assert.equal(scheduledAtToWallClock(resolved.iso, tz), wall)
      assert.equal(getVenuePartsFromInstant(resolved.instant, tz).hour, 19)
    })
  }

  it('Saskatchewan has no DST shift (Regina)', () => {
    const winter = resolveWallClockToUtc('2026-01-15T12:00:00', 'America/Regina')
    const summer = resolveWallClockToUtc('2026-07-15T12:00:00', 'America/Regina')
    assert.equal(winter.ok && summer.ok, true)
    if (!winter.ok || !summer.ok) return
    assert.equal(winter.iso, '2026-01-15T18:00:00.000Z')
    assert.equal(summer.iso, '2026-07-15T18:00:00.000Z')
  })

  it("Newfoundland half-hour offset works (St. John's)", () => {
    const utc = resolveWallClockToUtc('2026-07-11T19:00:00', 'America/St_Johns')
    assert.equal(utc.ok, true)
    if (!utc.ok) return
    assert.equal(utc.iso, '2026-07-11T21:30:00.000Z')
  })

  it('null DB timezone resolves to Edmonton and preserves Calgary conversion', () => {
    const tz = resolveBusinessTimezone(null)
    assert.equal(tz, 'America/Edmonton')
    const utc = resolveWallClockToUtc('2026-07-11T19:00:00', tz)
    assert.equal(utc.ok, true)
    if (!utc.ok) return
    assert.equal(utc.iso, '2026-07-12T01:00:00.000Z')
  })
})

describe('timezone change gate', () => {
  it('blocks when future active bookings exist', () => {
    const gate = evaluateTimezoneChangeGate({
      futureActiveAppointments: 2,
      liveWaitlistEntries: 0,
    })
    assert.equal(gate.ok, false)
    if (gate.ok) return
    assert.equal(gate.message, TIMEZONE_CHANGE_BLOCKED_MESSAGE)
  })

  it('blocks when live waitlist entries exist', () => {
    const gate = evaluateTimezoneChangeGate({
      futureActiveAppointments: 0,
      liveWaitlistEntries: 1,
    })
    assert.equal(gate.ok, false)
    if (gate.ok) return
    assert.match(gate.message, /waitlist/i)
  })

  it('succeeds when neither future bookings nor live waitlist exist', () => {
    const gate = evaluateTimezoneChangeGate({
      futureActiveAppointments: 0,
      liveWaitlistEntries: 0,
    })
    assert.equal(gate.ok, true)
  })
})

describe('typed wall-clock write path', () => {
  it('wallClockToDbIso never produces an Invalid Date ISO string', () => {
    const ok = wallClockToDbIso('2026-08-16T19:00:00', 'America/Toronto')
    assert.equal(ok.ok, true)
    if (!ok.ok) return
    assert.equal(ok.iso.endsWith('Z'), true)

    const gap = wallClockToDbIso('2026-03-08T02:30:00', 'America/Toronto')
    assert.equal(gap.ok, false)
  })
})
