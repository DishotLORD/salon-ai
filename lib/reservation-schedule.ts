/** Date/time helpers for appointment scheduling (Calgary wall-clock). */

import {
  appointmentInstantFromRaw,
  calgaryTimeHmFromDate,
  wallClockInCalgaryToUtcDate,
} from '@/lib/booking-wall-clock'

export function toDateIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function toWallClock(dateIso: string, time: string): string {
  return `${dateIso}T${time}:00`
}

/** Persist Calgary wall-clock as timestamptz ISO for Supabase. */
export function wallClockToDbIso(wallClock: string): string {
  return wallClockInCalgaryToUtcDate(wallClock).toISOString()
}

export function timeFromDate(d: Date): string {
  return calgaryTimeHmFromDate(d)
}

export { appointmentInstantFromRaw }
