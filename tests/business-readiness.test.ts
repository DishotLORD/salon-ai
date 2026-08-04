import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  evaluateBusinessReadiness,
  SETUP_INCOMPLETE_GUEST_MESSAGE,
  validateZoneCapacityInput,
} from '../lib/business-readiness.ts'
import { DEFAULT_OPERATING_HOURS } from '../lib/operating-hours.ts'

const OPEN_HOURS = { ...DEFAULT_OPERATING_HOURS }
const CONFIRMED = '2026-08-01T12:00:00.000Z'

const USABLE_ZONE = {
  is_active: true,
  max_concurrent_parties: 40,
  min_party_size: 1,
  max_party_size: 8,
}

describe('launch readiness — incomplete new businesses', () => {
  it('email/Google-style empty venue is not bookingReady', () => {
    const r = evaluateBusinessReadiness({
      timezone: 'America/Toronto',
      operatingHours: OPEN_HOURS,
      operatingHoursConfirmedAt: null,
      zones: [],
      menuItemCount: 0,
      menuPdfText: null,
    })
    assert.equal(r.bookingReady, false)
    assert.equal(r.conciergeReady, false)
    assert.ok(r.missingSteps.some((s) => s.id === 'hours'))
    assert.ok(r.missingSteps.some((s) => s.id === 'seating'))
  })

  it('UI default hours without Save (confirmed_at null) are not ready', () => {
    const r = evaluateBusinessReadiness({
      timezone: 'America/Toronto',
      operatingHours: OPEN_HOURS,
      operatingHoursConfirmedAt: null,
      zones: [USABLE_ZONE],
      menuItemCount: 0,
      menuPdfText: null,
    })
    assert.equal(r.hoursConfirmed, false)
    assert.equal(r.bookingReady, false)
    assert.ok(r.missingSteps.some((s) => s.id === 'hours'))
  })

  it('persisted confirmed hours but no zone → not ready', () => {
    const r = evaluateBusinessReadiness({
      timezone: 'America/Toronto',
      operatingHours: OPEN_HOURS,
      operatingHoursConfirmedAt: CONFIRMED,
      zones: [],
      menuItemCount: 1,
      menuPdfText: null,
    })
    assert.equal(r.bookingReady, false)
    assert.ok(r.missingSteps.some((s) => s.id === 'seating'))
  })
})

describe('launch readiness — valid configuration', () => {
  it('valid hours + usable zone → bookingReady', () => {
    const r = evaluateBusinessReadiness({
      timezone: 'America/Toronto',
      operatingHours: OPEN_HOURS,
      operatingHoursConfirmedAt: CONFIRMED,
      zones: [USABLE_ZONE],
      menuItemCount: 0,
      menuPdfText: null,
    })
    assert.equal(r.bookingReady, true)
    assert.equal(r.conciergeReady, false)
    assert.ok(r.missingSteps.some((s) => s.id === 'menu'))
  })

  it('null timezone still resolves and stays ready when otherwise configured (legacy Alberta venue)', () => {
    const r = evaluateBusinessReadiness({
      timezone: null,
      operatingHours: OPEN_HOURS,
      operatingHoursConfirmedAt: CONFIRMED,
      zones: [USABLE_ZONE],
      menuItemCount: 2,
      menuPdfText: null,
    })
    assert.equal(r.timezoneResolved, 'America/Edmonton')
    assert.equal(r.bookingReady, true)
    assert.equal(r.conciergeReady, true)
    assert.equal(
      r.missingSteps.some((s) => s.id === 'timezone'),
      false,
    )
  })
})

describe('capacity and party validation', () => {
  it('zero capacity → not usable / not ready', () => {
    const r = evaluateBusinessReadiness({
      timezone: 'America/Toronto',
      operatingHours: OPEN_HOURS,
      operatingHoursConfirmedAt: CONFIRMED,
      zones: [{ ...USABLE_ZONE, max_concurrent_parties: 0 }],
      menuItemCount: 0,
      menuPdfText: null,
    })
    assert.equal(r.hasUsableZone, false)
    assert.equal(r.bookingReady, false)
  })

  it('invalid min/max party range → not ready', () => {
    const r = evaluateBusinessReadiness({
      timezone: 'America/Toronto',
      operatingHours: OPEN_HOURS,
      operatingHoursConfirmedAt: CONFIRMED,
      zones: [{ ...USABLE_ZONE, min_party_size: 6, max_party_size: 4 }],
      menuItemCount: 0,
      menuPdfText: null,
    })
    assert.equal(r.hasUsableZone, false)
    assert.equal(r.bookingReady, false)
  })

  it('validateZoneCapacityInput enforces positive capacity and party bounds', () => {
    assert.equal(validateZoneCapacityInput({ name: 'Main', capacity: 0, minPartySize: 1, maxPartySize: 4 }).ok, false)
    assert.equal(
      validateZoneCapacityInput({ name: 'Main', capacity: 20, minPartySize: 5, maxPartySize: 4 }).ok,
      false,
    )
    const ok = validateZoneCapacityInput({
      name: 'Main Dining',
      capacity: 40,
      minPartySize: 1,
      maxPartySize: 8,
    })
    assert.equal(ok.ok, true)
  })
})

describe('menu / concierge readiness', () => {
  it('manual menu item only → conciergeReady', () => {
    const r = evaluateBusinessReadiness({
      timezone: 'America/Toronto',
      operatingHours: OPEN_HOURS,
      operatingHoursConfirmedAt: CONFIRMED,
      zones: [USABLE_ZONE],
      menuItemCount: 3,
      menuPdfText: null,
    })
    assert.equal(r.hasMenu, true)
    assert.equal(r.conciergeReady, true)
  })

  it('PDF menu only → conciergeReady', () => {
    const r = evaluateBusinessReadiness({
      timezone: 'America/Toronto',
      operatingHours: OPEN_HOURS,
      operatingHoursConfirmedAt: CONFIRMED,
      zones: [USABLE_ZONE],
      menuItemCount: 0,
      menuPdfText: 'Soup $12\nSteak $42',
    })
    assert.equal(r.hasMenu, true)
    assert.equal(r.conciergeReady, true)
  })

  it('no menu → bookingReady may be true, conciergeReady false', () => {
    const r = evaluateBusinessReadiness({
      timezone: 'America/Toronto',
      operatingHours: OPEN_HOURS,
      operatingHoursConfirmedAt: CONFIRMED,
      zones: [USABLE_ZONE],
      menuItemCount: 0,
      menuPdfText: '   ',
    })
    assert.equal(r.bookingReady, true)
    assert.equal(r.conciergeReady, false)
  })
})

describe('public booking gate wiring', () => {
  it('chat route blocks booking tools when setup incomplete', () => {
    const chat = readFileSync(new URL('../app/api/chat/route.ts', import.meta.url), 'utf8')
    assert.match(chat, /BOOKING_GATE_TOOLS/)
    assert.match(chat, /setup_incomplete/)
    assert.match(chat, /loadBusinessReadiness/)
    assert.match(chat, /SETUP_INCOMPLETE_GUEST_MESSAGE|Online reservations are not available/)
  })

  it('booking-load no longer auto-seeds fake Main dining capacity', () => {
    const load = readFileSync(new URL('../lib/booking-load.ts', import.meta.url), 'utf8')
    assert.doesNotMatch(load, /defaultMainDiningZone/)
    assert.match(load, /Never invent seating capacity/)
  })

  it('guest message never exposes internal missing steps', () => {
    assert.match(SETUP_INCOMPLETE_GUEST_MESSAGE, /contact the restaurant directly/i)
    assert.doesNotMatch(SETUP_INCOMPLETE_GUEST_MESSAGE, /timezone|dining zone|operating_hours/i)
  })

  it('signup redirects incomplete email launch to onboarding', () => {
    const signup = readFileSync(new URL('../app/auth/signup/page.tsx', import.meta.url), 'utf8')
    assert.match(signup, /location\.replace\('\/onboarding'\)/)
    assert.match(signup, /savePendingVenueDraft/)
  })
})
