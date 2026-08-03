/** Date/time helpers for appointment scheduling (venue wall-clock). */

import {
  appointmentInstantFromRaw,
  resolveWallClockToUtc,
  venueCalendarDayKey,
  venueTimeHmFromDate,
  type WallClockResolution,
} from '@/lib/booking-wall-clock'
import type { CanadianBusinessTimezone } from '@/lib/business-timezone'

/**
 * UI calendar-cell day key from a Date built for grid navigation.
 * For appointment instants use venueCalendarDayKey(instant, timeZone) instead.
 */
export function toDateIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function toWallClock(dateIso: string, time: string): string {
  return `${dateIso}T${time}:00`
}

/**
 * Venue wall-clock → timestamptz ISO for Supabase, as a typed result.
 *
 * Returns `ok: false` with guest-safe copy when the digits name no instant
 * (spring-forward gap), so no caller can hand `Invalid Date` to `toISOString()`.
 */
export function wallClockToDbIso(
  wallClock: string,
  timeZone: CanadianBusinessTimezone,
): WallClockResolution {
  return resolveWallClockToUtc(wallClock, timeZone)
}

export function timeFromDate(d: Date, timeZone: CanadianBusinessTimezone): string {
  return venueTimeHmFromDate(d, timeZone)
}

export { appointmentInstantFromRaw, venueCalendarDayKey }
