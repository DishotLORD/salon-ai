import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  getOpenSlotsForDate,
  isSlotAvailable,
} from '../lib/booking-availability.ts'
import {
  addDaysToDateKey,
  wallClockDateKey,
} from '../lib/booking-wall-clock.ts'
import { DEFAULT_BOOKING_SETTINGS, parseBookingSettings } from '../lib/booking-settings.ts'
import {
  bookingHorizonPromptSection,
  evaluateBookableWindow,
  latestBookableDateKey,
} from '../lib/booking-window.ts'
import type { DiningZone } from '../lib/dining-zones.ts'
import { parseOperatingHours } from '../lib/operating-hours.ts'

const TODAY = '2026-08-03'
const OPEN_HOURS = parseOperatingHours({
  sun: { open: '11:00', close: '22:00', closed: false },
  mon: { open: '11:00', close: '22:00', closed: false },
  tue: { open: '11:00', close: '22:00', closed: false },
  wed: { open: '11:00', close: '22:00', closed: false },
  thu: { open: '11:00', close: '22:00', closed: false },
  fri: { open: '11:00', close: '22:00', closed: false },
  sat: { open: '11:00', close: '22:00', closed: false },
})
const CLOSED_MONDAY = parseOperatingHours({
  ...OPEN_HOURS,
  mon: { open: '11:00', close: '22:00', closed: true },
})

const SETTINGS_365 = parseBookingSettings({
  max_advance_days: 365,
  min_notice_minutes: 0,
  slot_interval_minutes: 15,
  default_duration_minutes: 90,
  max_concurrent_reservations: 50,
  require_contact_before_booking: true,
  average_check: 0,
})

const SETTINGS_60 = parseBookingSettings({
  ...SETTINGS_365,
  max_advance_days: 60,
})

/**
 * Annotated rather than inferred: the fixture is then checked against the real
 * DiningZone on every build, so a column added to the production type shows up
 * here as a compile error instead of silently making the test fixture a shape
 * the code under test never actually receives.
 */
const ZONE: DiningZone = {
  id: 'zone-main',
  business_id: 'biz-test-booking-window',
  name: 'Main dining',
  slug: 'main-dining',
  max_concurrent_parties: 50,
  min_party_size: 1,
  max_party_size: 12,
  turnover_minutes: 90,
  is_active: true,
  sort_order: 0,
}

describe('1. valid reservation more than 90 days ahead (within configured limit)', () => {
  it('does not refuse a date 120 days ahead when max_advance_days is 365', () => {
    const target = addDaysToDateKey(TODAY, 120)
    assert.equal(evaluateBookableWindow(target, TODAY, 365), null)
  })

  it('availability still returns slots for that far-future date', () => {
    const target = addDaysToDateKey(TODAY, 120)
    const slots = getOpenSlotsForDate({
      dateKey: target,
      operatingHours: OPEN_HOURS,
      existing: [],
      settings: SETTINGS_365,
      timeZone: 'America/Toronto',
      now: { year: 2026, month: 8, day: 3, hour: 12, minute: 0 },
      zones: [ZONE],
      partySize: 2,
    })
    assert.ok(slots.length > 0, 'expected open slots far ahead within configured horizon')
    assert.ok(slots.some((s) => s.wallClock.includes('T19:00')))
  })
})

describe('2. valid reschedule more than 90 days ahead', () => {
  it('uses the same bookable-window gate as create (no invented horizon)', () => {
    const target = addDaysToDateKey(TODAY, 150)
    assert.equal(evaluateBookableWindow(target, TODAY, 365), null)
  })

  it('chat reschedule path calls checkDateInBookableWindow / evaluateBookableWindow', () => {
    const chat = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8')
    assert.match(chat, /reschedule_reservation/)
    assert.match(chat, /checkDateInBookableWindow/)
    assert.match(chat, /evaluateBookableWindow/)
    // Tool description must forbid invented far-future refusal.
    assert.match(
      chat,
      /Never refuse a new date for seeming too far ahead — call this tool/,
    )
  })
})

describe('3. real configured booking limit — backend rejects beyond it', () => {
  it('rejects beyond max_advance_days with the exact configured numbers', () => {
    const target = addDaysToDateKey(TODAY, 61)
    const refusal = evaluateBookableWindow(target, TODAY, 60)
    assert.ok(refusal)
    assert.equal(refusal!.error, 'beyond_booking_window')
    assert.equal(refusal!.max_advance_days, 60)
    assert.equal(refusal!.latest_bookable_date, latestBookableDateKey(TODAY, 60))
    assert.match(refusal!.message, /60 days ahead/)
    assert.match(refusal!.message, new RegExp(latestBookableDateKey(TODAY, 60)))
    assert.doesNotMatch(refusal!.message, /90/)
  })

  it('availability returns no slots beyond the configured horizon', () => {
    const target = addDaysToDateKey(TODAY, 61)
    const slots = getOpenSlotsForDate({
      dateKey: target,
      operatingHours: OPEN_HOURS,
      existing: [],
      settings: SETTINGS_60,
      timeZone: 'America/Toronto',
      now: { year: 2026, month: 8, day: 3, hour: 12, minute: 0 },
      zones: [ZONE],
      partySize: 2,
    })
    assert.equal(slots.length, 0)
  })
})

describe('4. no configured 90-day default — far future within limit is allowed', () => {
  it('default max_advance_days is 180, not 90', () => {
    assert.equal(DEFAULT_BOOKING_SETTINGS.max_advance_days, 180)
    assert.equal(parseBookingSettings(null).max_advance_days, 180)
  })

  it('a date 100 days ahead is allowed under the default 180-day setting', () => {
    const target = addDaysToDateKey(TODAY, 100)
    assert.equal(
      evaluateBookableWindow(target, TODAY, DEFAULT_BOOKING_SETTINGS.max_advance_days),
      null,
    )
  })
})

describe('5. past date is still rejected', () => {
  it('returns past_date with today in the message', () => {
    const refusal = evaluateBookableWindow('2026-08-02', TODAY, 365)
    assert.ok(refusal)
    assert.equal(refusal!.error, 'past_date')
    assert.equal(refusal!.today, TODAY)
    assert.match(refusal!.message, /past/)
    assert.match(refusal!.message, new RegExp(TODAY))
  })
})

describe('6. closed time is still rejected from operating hours', () => {
  it('Monday closed → no slots and isSlotAvailable false', () => {
    // 2026-08-03 is a Monday.
    assert.equal(
      wallClockDateKey({ year: 2026, month: 8, day: 3, hour: 12, minute: 0 }),
      '2026-08-03',
    )
    const slots = getOpenSlotsForDate({
      dateKey: '2026-08-03',
      operatingHours: CLOSED_MONDAY,
      existing: [],
      settings: SETTINGS_365,
      timeZone: 'America/Toronto',
      now: { year: 2026, month: 8, day: 3, hour: 10, minute: 0 },
      zones: [ZONE],
      partySize: 2,
    })
    assert.equal(slots.length, 0)
    assert.equal(
      isSlotAvailable({
        wallClock: '2026-08-03T19:00:00',
        operatingHours: CLOSED_MONDAY,
        existing: [],
        settings: SETTINGS_365,
        timeZone: 'America/Toronto',
        now: { year: 2026, month: 8, day: 3, hour: 10, minute: 0 },
        zones: [ZONE],
        partySize: 2,
      }),
      false,
    )
  })

  it('outside hours on an open day is unavailable', () => {
    assert.equal(
      isSlotAvailable({
        wallClock: '2026-08-04T23:00:00',
        operatingHours: OPEN_HOURS,
        existing: [],
        settings: SETTINGS_365,
        timeZone: 'America/Toronto',
        now: { year: 2026, month: 8, day: 3, hour: 12, minute: 0 },
        zones: [ZONE],
        partySize: 2,
      }),
      false,
    )
  })
})

describe('7. prompt / tool consistency — no invented 90-day policy', () => {
  it('system prompt injects the configured horizon, never a hardcoded 90', () => {
    const section = bookingHorizonPromptSection(TODAY, 365)
    assert.match(section, /365 days ahead/)
    assert.match(section, new RegExp(latestBookableDateKey(TODAY, 365)))
    assert.match(section, /Never invent a different horizon/)
    assert.match(section, /"90 days"/)
    // The section mentions "90 days" only as a forbidden invention, not as policy.
    assert.equal((section.match(/90 days/g) || []).length, 1)
  })

  it('chat route forbids inventing booking windows and requires tool use', () => {
    const chat = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8')
    assert.match(chat, /BOOKING LIMITS \(critical\): you must NEVER invent booking windows/)
    assert.match(chat, /bookingHorizonPromptSection/)
    assert.match(chat, /max_advance_days/)
    assert.match(
      chat,
      /Never refuse a date for being too far ahead without calling this tool or create_reservation/,
    )
    assert.match(
      chat,
      /DATE MAP is not a booking horizon/,
    )
    // No hardcoded production policy of "90 days" outside the anti-invention wording.
    const policyMentions = chat.match(/90\s*days?/gi) || []
    for (const m of policyMentions) {
      // Allowed only in the "never invent … 90 days" guidance.
      assert.match(
        chat.slice(Math.max(0, chat.toLowerCase().indexOf(m.toLowerCase()) - 40)),
        /never invent|including "90 days"/i,
      )
    }
  })

  it('repeated horizon evaluations stay stable (same configured policy)', () => {
    const target = addDaysToDateKey(TODAY, 120)
    const runs = Array.from({ length: 5 }, () =>
      evaluateBookableWindow(target, TODAY, 365),
    )
    assert.ok(runs.every((r) => r === null))

    const beyond = addDaysToDateKey(TODAY, 400)
    const refusals = Array.from({ length: 5 }, () =>
      evaluateBookableWindow(beyond, TODAY, 365),
    )
    for (const r of refusals) {
      assert.equal(r?.error, 'beyond_booking_window')
      assert.equal(r?.max_advance_days, 365)
      assert.equal(r?.message, refusals[0]?.message)
    }
  })
})
