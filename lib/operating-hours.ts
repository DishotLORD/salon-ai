import { timeToMinutes, type PeakBand, type TimelineRange } from '@/lib/time-timeline'

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type DayHours = { open: string; close: string; closed: boolean }

export type OperatingHours = Record<DayKey, DayHours>

export const DAY_ORDER: { key: DayKey; label: string; short: string }[] = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
]

export const DEFAULT_OPERATING_HOURS: OperatingHours = {
  mon: { open: '17:00', close: '22:30', closed: false },
  tue: { open: '17:00', close: '22:30', closed: false },
  wed: { open: '17:00', close: '22:30', closed: false },
  thu: { open: '17:00', close: '23:00', closed: false },
  fri: { open: '17:00', close: '23:30', closed: false },
  sat: { open: '11:30', close: '23:30', closed: false },
  sun: { open: '11:30', close: '21:30', closed: false },
}

const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function isDayHours(value: unknown): value is DayHours {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.open === 'string' &&
    typeof row.close === 'string' &&
    typeof row.closed === 'boolean'
  )
}

export function parseOperatingHours(raw: unknown): OperatingHours {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_OPERATING_HOURS }
  }
  const source = raw as Record<string, unknown>
  const result = { ...DEFAULT_OPERATING_HOURS }
  for (const key of DAY_KEYS) {
    const row = source[key]
    if (isDayHours(row)) {
      result[key] = { open: row.open, close: row.close, closed: row.closed }
    }
  }
  return result
}

export function validateOperatingHours(hours: OperatingHours): string | null {
  for (const { key, label } of DAY_ORDER) {
    const row = hours[key]
    if (row.closed) continue
    const openM = timeToMinutes(row.open)
    const closeM = timeToMinutes(row.close)
    if (closeM <= openM) {
      return `${label}: close time must be after open time.`
    }
  }
  return null
}

const DAY_KEYS_BY_JS_DAY: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Booking / timeline snap interval (minutes). */
export const BOOKING_SLOT_MINUTES = 15

const SLOT_STEP = BOOKING_SLOT_MINUTES

const WEEKDAY_PEAKS: PeakBand[] = [
  { start: 12 * 60, end: 14 * 60, label: 'Lunch peak' },
  { start: 16 * 60 + 30, end: 19 * 60, label: 'Evening peak' },
]

const WEEKEND_PEAKS: PeakBand[] = [
  { start: 11 * 60 + 30, end: 14 * 60, label: 'Brunch & lunch' },
  { start: 17 * 60, end: 20 * 60, label: 'Evening peak' },
]

export function dayKeyFromDate(dateIso: string): DayKey {
  const d = new Date(`${dateIso}T12:00:00`)
  return DAY_KEYS_BY_JS_DAY[d.getDay()] ?? 'mon'
}

export function isWeekendDayKey(key: DayKey): boolean {
  return key === 'sat' || key === 'sun'
}

export function scheduleKindLabel(dateIso: string): string {
  return isWeekendDayKey(dayKeyFromDate(dateIso)) ? 'Weekend hours' : 'Weekday hours'
}

export function getDayHoursForDate(hours: OperatingHours, dateIso: string): DayHours {
  return hours[dayKeyFromDate(dateIso)]
}

export function timelineRangeFromDayHours(row: DayHours, step = SLOT_STEP): TimelineRange | null {
  if (row.closed) return null
  const start = timeToMinutes(row.open)
  let end = timeToMinutes(row.close)
  const wrapAfterMidnight = end <= start
  if (wrapAfterMidnight) end += 24 * 60
  return { start, end, step, wrapAfterMidnight: wrapAfterMidnight || undefined }
}

function clipPeaksToRange(peaks: PeakBand[], range: TimelineRange): PeakBand[] {
  return peaks
    .map((peak) => ({
      ...peak,
      start: Math.max(peak.start, range.start),
      end: Math.min(peak.end, range.end),
    }))
    .filter((peak) => peak.end > peak.start)
}

export function peaksForDate(dateIso: string, range: TimelineRange): PeakBand[] {
  const base = isWeekendDayKey(dayKeyFromDate(dateIso)) ? WEEKEND_PEAKS : WEEKDAY_PEAKS
  return clipPeaksToRange(base, range)
}

export function formatHoursRangeLabel(row: DayHours): string {
  if (row.closed) return 'Closed'
  const open = formatTime12h(row.open)
  const close = formatTime12h(row.close)
  return `${open} – ${close}`
}

function formatTime12h(value: string): string {
  const mins = timeToMinutes(value)
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  const period = h < 12 ? 'AM' : 'PM'
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h
  if (m === 0) return `${dh} ${period}`
  return `${dh}:${String(m).padStart(2, '0')} ${period}`
}
