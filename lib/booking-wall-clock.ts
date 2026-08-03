/**
 * Wall-clock timestamps for reservations, interpreted in a venue IANA timezone.
 *
 * Appointments store UTC instants (`timestamptz`). Guest/staff digits are naive
 * "YYYY-MM-DDTHH:mm:ss" in the business timezone.
 *
 * Every helper here that touches a venue calendar day, formats an appointment
 * time, groups bookings, or converts wall-clock to UTC takes a REQUIRED
 * `CanadianBusinessTimezone`. There is no optional parameter and no ambient
 * default, so a call site physically cannot forget the zone and silently render
 * Mountain Time for a Toronto venue.
 *
 * Resolve `businesses.timezone` exactly once, at the business-context boundary,
 * with `resolveBusinessTimezone` (null → America/Edmonton for legacy Alberta
 * rows), then pass the resolved value down. Never use the browser timezone.
 */

import {
  DEFAULT_BUSINESS_TIMEZONE,
  isCanadianBusinessTimezone,
  type CanadianBusinessTimezone,
} from './business-timezone'

/**
 * Health/diagnostics only. The venue zone now comes from `businesses.timezone`
 * per request, so `NEXT_PUBLIC_BUSINESS_TIMEZONE` no longer affects any booking
 * math; it is reported purely so ops can see a stale env var still set and
 * remove it.
 */
export const VENUE_TIMEZONE_STATUS = {
  mode: 'per-business' as const,
  fallback: DEFAULT_BUSINESS_TIMEZONE,
  legacyEnvOverride: process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE?.trim() || null,
} as const

/**
 * `Intl.DateTimeFormat` throws on an unrecognised zone name. Types make that
 * unreachable from TypeScript call sites, but a value can still arrive from an
 * untyped boundary (a JSON body, an old cached bundle). Fail loudly to the log
 * and keep rendering rather than blanking a dashboard.
 */
function safeZone(timeZone: CanadianBusinessTimezone): CanadianBusinessTimezone {
  if (isCanadianBusinessTimezone(timeZone)) return timeZone
  console.error(
    `[timezone] "${String(timeZone)}" is not a supported venue timezone. ` +
      `Falling back to ${DEFAULT_BUSINESS_TIMEZONE}; times shown may be wrong until the caller is fixed.`,
  )
  return DEFAULT_BUSINESS_TIMEZONE
}

const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

export type WallClockParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export function getVenuePartsFromInstant(
  date: Date,
  timeZone: CanadianBusinessTimezone,
): WallClockParts {
  const tz = safeZone(timeZone)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10)
  const hour = get('hour')
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: hour === 24 ? 0 : hour,
    minute: get('minute'),
  }
}

export function getVenueNowParts(timeZone: CanadianBusinessTimezone): WallClockParts {
  return getVenuePartsFromInstant(new Date(), timeZone)
}

export function parseWallClock(value: string): WallClockParts | null {
  const m = value.trim().match(WALL_CLOCK_RE)
  if (!m) return null
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
    hour: parseInt(m[4], 10),
    minute: parseInt(m[5], 10),
  }
}

/** True when value is already a naive wall-clock string (no Z / offset). */
export function isNaiveWallClock(value: string): boolean {
  return WALL_CLOCK_RE.test(value.trim()) && !hasExplicitTimezone(value.trim())
}

function hasExplicitTimezone(value: string): boolean {
  return /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value.trim())
}

/**
 * Parse scheduled_at from Supabase/API.
 * - ISO with Z/offset → instant as stored
 * - Naive "YYYY-MM-DDTHH:mm:ss" without offset → UTC (Postgres timestamptz)
 * - Fallback → literal venue wall-clock (legacy rows)
 */
export function parseDbTimestampToDate(
  raw: string,
  timeZone: CanadianBusinessTimezone,
): Date | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (hasExplicitTimezone(trimmed)) {
    const d = new Date(trimmed)
    return Number.isNaN(d.getTime()) ? null : d
  }

  if (isNaiveWallClock(trimmed)) {
    const asUtc = new Date(`${trimmed}Z`)
    if (!Number.isNaN(asUtc.getTime())) {
      return asUtc
    }
    const venue = resolveWallClockToUtc(trimmed, timeZone)
    return venue.ok ? venue.instant : null
  }

  const d = new Date(trimmed)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Normalize DB/API scheduled_at to venue wall-clock "YYYY-MM-DDTHH:mm:ss".
 */
export function scheduledAtToWallClock(
  raw: string,
  timeZone: CanadianBusinessTimezone,
): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const instant = parseDbTimestampToDate(trimmed, timeZone)
  if (instant) {
    return formatWallClock(getVenuePartsFromInstant(instant, timeZone))
  }

  const parts = parseWallClock(trimmed)
  return parts ? formatWallClock(parts) : null
}

/**
 * Guest-facing copy for a wall-clock time that the venue's clocks skip over.
 * Spring-forward removes 02:00–03:00 local, so those digits name no instant.
 */
export const DST_GAP_MESSAGE =
  'That local time does not exist because the clocks change that night. Please choose another time.'

/** Guest-facing copy for digits we could not read at all. */
export const MALFORMED_WALL_CLOCK_MESSAGE =
  'That date and time could not be read. Please pick a time from the list.'

export type WallClockResolution =
  | {
      ok: true
      instant: Date
      /** UTC ISO safe to write to a timestamptz column. */
      iso: string
      /**
       * True on the fall-back repeat hour, where these digits name two
       * instants. `instant` is the earlier of the two — see the policy note on
       * `resolveWallClockToUtc`.
       */
      ambiguous: boolean
    }
  | {
      ok: false
      reason: 'malformed' | 'nonexistent_local_time'
      /** Safe to show a guest verbatim. */
      message: string
    }

/**
 * UTC instant for a venue wall-clock moment, as a typed result.
 *
 * Uses a 1-minute iterative search from an offset guess, so Newfoundland's
 * half-hour offset and every DST transition are covered without a table.
 *
 * DST policy:
 * - Spring-forward gap (02:30 on the transition night): the digits name no
 *   instant. Return `nonexistent_local_time` rather than inventing 01:30 or
 *   03:30 — storing a reservation the guest never chose is worse than asking.
 * - Fall-back repeat (01:30 twice): return the EARLIER instant, deterministically.
 *   A table held from the earlier 01:30 covers both passes of that hour, so the
 *   guest is seated whichever one they meant. The later instant would leave the
 *   first 01:30 unserved. Erring early is also the recoverable direction: the
 *   guest waits, staff seat them, instead of arriving to a table already given away.
 */
export function resolveWallClockToUtc(
  wallClock: string,
  timeZone: CanadianBusinessTimezone,
): WallClockResolution {
  const target = parseWallClock(wallClock)
  if (!target) {
    return { ok: false, reason: 'malformed', message: MALFORMED_WALL_CLOCK_MESSAGE }
  }

  const tz = safeZone(timeZone)
  const targetKey = wallClockDateKey(target)
  const targetMin = wallClockToMinutesOfDay(target)

  // Rough UTC guess: Canadian zones sit near UTC−2.5…−8. Start from UTC wall digits
  // plus 6h so the first probe is usually west of the real instant, then walk.
  let guessMs = Date.UTC(target.year, target.month - 1, target.day, target.hour + 6, target.minute, 0)
  let matched: number | null = null

  for (let i = 0; i < 24 * 60; i++) {
    const p = getVenuePartsFromInstant(new Date(guessMs), tz)
    const key = wallClockDateKey(p)
    const min = wallClockToMinutesOfDay(p)

    if (key === targetKey && min === targetMin) {
      matched = guessMs
      break
    }

    const keyCmp = key.localeCompare(targetKey)
    if (keyCmp < 0 || (keyCmp === 0 && min < targetMin)) {
      guessMs += 60 * 1000
    } else {
      guessMs -= 60 * 1000
    }
  }

  if (matched == null) {
    return { ok: false, reason: 'nonexistent_local_time', message: DST_GAP_MESSAGE }
  }

  // Walk back for an earlier instant carrying the same digits (fall-back). Scan a
  // ±4h window rather than stopping at the first non-matching minute, because the
  // two ambiguous occurrences are separated by a full non-matching hour.
  let earliest = matched
  let occurrences = 0
  const windowStart = matched - 4 * 60 * 60 * 1000
  const windowEnd = matched + 4 * 60 * 60 * 1000
  for (let probe = windowStart; probe <= windowEnd; probe += 60 * 1000) {
    const p = getVenuePartsFromInstant(new Date(probe), tz)
    if (wallClockDateKey(p) === targetKey && wallClockToMinutesOfDay(p) === targetMin) {
      occurrences += 1
      if (probe < earliest) earliest = probe
    }
  }

  const instant = new Date(earliest)
  return { ok: true, instant, iso: instant.toISOString(), ambiguous: occurrences > 1 }
}

/**
 * UTC ISO for a venue day boundary such as `${dateKey}T00:00:00`.
 *
 * Range queries need a string, not a result to branch on. Canadian DST shifts
 * happen at 02:00 local, so midnight and 23:59:59 always exist — but rather
 * than assume that forever, walk forward to the first minute that does exist.
 * Never returns an invalid ISO, so callers can inline it into a query.
 */
export function venueBoundaryUtcIso(
  wallClock: string,
  timeZone: CanadianBusinessTimezone,
): string {
  const direct = resolveWallClockToUtc(wallClock, timeZone)
  if (direct.ok) return direct.iso

  const parts = parseWallClock(wallClock)
  if (!parts) {
    throw new Error(`venueBoundaryUtcIso: malformed wall clock "${wallClock}"`)
  }
  // Only reachable if a zone ever moves its transition onto a boundary minute.
  for (let add = 1; add <= 180; add++) {
    const min = wallClockToMinutesOfDay(parts) + add
    const dayShift = Math.floor(min / (24 * 60))
    const dateKey = addDaysToDateKey(wallClockDateKey(parts), dayShift)
    const hh = String(Math.floor((min % (24 * 60)) / 60)).padStart(2, '0')
    const mm = String(min % 60).padStart(2, '0')
    const probe = resolveWallClockToUtc(`${dateKey}T${hh}:${mm}:00`, timeZone)
    if (probe.ok) return probe.iso
  }
  throw new Error(
    `venueBoundaryUtcIso: no valid instant near "${wallClock}" in ${timeZone}`,
  )
}

export function wallClockDateKey(parts: WallClockParts): string {
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
}

/** Round a wall-clock time to the nearest booking slot interval (e.g. 15 min). */
export function snapWallClockToSlotInterval(
  wallClock: string,
  intervalMinutes: number,
): string | null {
  const parts = parseWallClock(wallClock)
  if (!parts || intervalMinutes < 1) return null
  const startMin = wallClockToMinutesOfDay(parts)
  const rounded = Math.round(startMin / intervalMinutes) * intervalMinutes
  const pad2 = (n: number) => String(n).padStart(2, '0')
  // Rounding 23:53 up gives 24:00 — that is 00:00 of the NEXT day, not a
  // rewind to this day's midnight.
  const dateKey =
    rounded >= 24 * 60
      ? addDaysToDateKey(wallClockDateKey(parts), 1)
      : wallClockDateKey(parts)
  const hour = Math.floor((rounded % (24 * 60)) / 60)
  const minute = rounded % 60
  return `${dateKey}T${pad2(hour)}:${pad2(minute)}:00`
}

/** Calendar date arithmetic on YYYY-MM-DD (timezone-safe for day boundaries). */
export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + deltaDays))
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
}

/**
 * Day of week (0=Sunday) for venue calendar digits. Pure arithmetic on the
 * digits via a UTC anchor, so no timezone is involved or needed.
 */
export function weekdayIndexFromParts(parts: WallClockParts): number {
  const t = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  return t.getUTCDay()
}

export function wallClockToMinutesOfDay(parts: WallClockParts): number {
  return parts.hour * 60 + parts.minute
}

export function formatWallClock(parts: WallClockParts): string {
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:00`
}

export function formatWallClockLabel(parts: WallClockParts): string {
  const h = parts.hour
  const m = parts.minute
  const period = h < 12 ? 'AM' : 'PM'
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  const dayLabel = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  if (m === 0) return `${dayLabel} at ${dh} ${period}`
  return `${dayLabel} at ${dh}:${String(m).padStart(2, '0')} ${period}`
}

/** Instant for venue calendar digits, or null when those digits do not exist. */
export function dateFromWallClockParts(
  parts: WallClockParts,
  timeZone: CanadianBusinessTimezone,
): Date | null {
  const resolved = resolveWallClockToUtc(formatWallClock(parts), timeZone)
  return resolved.ok ? resolved.instant : null
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

/** Parse clock time from guest/AI text (noon, midnight, 12 pm, 7:30 am). */
export function parseTimeFromText(
  text: string,
): { hour: number; minute: number } | null {
  const lower = text.toLowerCase()
  if (/\bnoon\b/.test(lower)) return { hour: 12, minute: 0 }
  if (/\bmidnight\b/.test(lower)) return { hour: 0, minute: 0 }

  const tm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (tm) {
    let hour = parseInt(tm[1], 10)
    const minute = tm[2] ? parseInt(tm[2], 10) : 0
    const ap = tm[3].toUpperCase()
    if (ap === 'PM' && hour < 12) hour += 12
    if (ap === 'AM' && hour === 12) hour = 0
    return { hour, minute }
  }

  return parseTimeWithoutAmPm(text)
}

/**
 * "6:50", "today 6:50", "at 7" — no am/pm.
 * Restaurant default: 5:00–11:59 → PM; morning/lunch keywords → AM.
 */
export function parseTimeWithoutAmPm(text: string): { hour: number; minute: number } | null {
  const lower = text.toLowerCase()
  const morning = /\b(morning|breakfast|brunch|lunch)\b/i.test(lower)

  const hm = text.match(/\b(\d{1,2}):(\d{2})\b/)
  if (hm) {
    let hour = parseInt(hm[1], 10)
    const minute = parseInt(hm[2], 10)
    if (hour > 23 || minute > 59) return null
    if (hour >= 13) return { hour, minute }
    if (morning) {
      if (hour === 12) hour = 0
      return { hour, minute }
    }
    if (hour >= 5 && hour <= 11) hour += 12
    else if (hour === 12) hour = 12
    else if (/\b(today|tonight|evening|dinner)\b/i.test(lower)) hour += 12
    return { hour, minute }
  }

  const hOnly = text.match(/\b(?:at\s+)?(\d{1,2})(?!\s*:|\s*\d)/i)
  if (hOnly) {
    let hour = parseInt(hOnly[1], 10)
    if (hour > 23) return null
    if (hour >= 13) return { hour, minute: 0 }
    if (morning) {
      if (hour === 12) hour = 0
      return { hour, minute: 0 }
    }
    if (hour >= 5 && hour <= 11) hour += 12
    else if (hour === 12) hour = 12
    else if (/\b(today|tonight|evening|dinner)\b/i.test(lower)) hour += 12
    return { hour, minute: 0 }
  }

  return null
}

function parseAmPmTime(text: string): { hour: number; minute: number } | null {
  return parseTimeFromText(text)
}

function wallClockOnDateKey(dateKey: string, hour: number, minute: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return formatWallClock({ year: y, month: m, day: d, hour, minute })
}

/** Default fallback when no time parsed: tonight 7pm venue (tomorrow if already past 7pm). */
export function defaultReservationWallClock(timeZone: CanadianBusinessTimezone): string {
  const now = getVenueNowParts(timeZone)
  const todayKey = wallClockDateKey(now)
  const dateKey = now.hour >= 19 ? addDaysToDateKey(todayKey, 1) : todayKey
  return wallClockOnDateKey(dateKey, 19, 0)
}

/**
 * Parse guest/AI text into venue wall-clock "YYYY-MM-DDTHH:mm:ss".
 * Never uses server or browser local timezone.
 */
export function parseScheduledAtToWallClock(
  text: string,
  timeZone: CanadianBusinessTimezone,
): string | null {
  if (!text.trim()) return null

  const now = getVenueNowParts(timeZone)
  const cy = now.year
  const cm = now.month
  const cd = now.day
  const ch = now.hour
  const cmin = now.minute
  const todayKey = wallClockDateKey(now)

  const iso = text.match(
    /(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?(?:\s*[AP]M)?)?/i,
  )
  if (iso) {
    const [y, m, d] = iso[1].split('-').map(Number)
    if (iso[2]) {
      const hour = parseInt(iso[2], 10)
      const minute = parseInt(iso[3], 10)
      return formatWallClock({ year: y, month: m, day: d, hour, minute })
    }
    const ap = parseAmPmTime(text)
    if (!ap) return null
    return formatWallClock({ year: y, month: m, day: d, hour: ap.hour, minute: ap.minute })
  }

  const slash = text.match(
    /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M)?)?/i,
  )
  if (slash) {
    let year = parseInt(slash[3], 10)
    if (year < 100) year += 2000
    const month = parseInt(slash[1], 10)
    const day = parseInt(slash[2], 10)
    if (slash[4]) {
      let hour = parseInt(slash[4], 10)
      const minute = parseInt(slash[5], 10)
      const ap = slash[6]?.toUpperCase()
      if (ap === 'PM' && hour < 12) hour += 12
      if (ap === 'AM' && hour === 12) hour = 0
      return formatWallClock({ year, month, day, hour, minute })
    }
    const ap = parseAmPmTime(text)
    if (!ap) return null
    return formatWallClock({ year, month, day, hour: ap.hour, minute: ap.minute })
  }

  const monthDay = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i,
  )
  if (monthDay) {
    const month = MONTH_INDEX[monthDay[1].slice(0, 3).toLowerCase()]
    if (month) {
      const day = parseInt(monthDay[2], 10)
      const year = monthDay[3] ? parseInt(monthDay[3], 10) : cy
      const ap = parseAmPmTime(text)
      if (!ap) return null
      return formatWallClock({ year, month, day, hour: ap.hour, minute: ap.minute })
    }
  }

  const wdMatch = text.match(
    /\b(?:(next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
  )
  if (wdMatch) {
    const modifier = wdMatch[1]?.toLowerCase()
    const targetWd = WEEKDAYS.indexOf(
      wdMatch[2].toLowerCase() as (typeof WEEKDAYS)[number],
    )
    const todayWd = weekdayIndexFromParts(now)
    let daysAhead = targetWd - todayWd
    if (daysAhead < 0) daysAhead += 7
    // A bare weekday matching today's weekday means TODAY; only "next" jumps a week.
    if (modifier === 'next') daysAhead += 7
    const dateKey = addDaysToDateKey(todayKey, daysAhead)
    const ap = parseAmPmTime(text)
    if (!ap) return null
    return wallClockOnDateKey(dateKey, ap.hour, ap.minute)
  }

  if (/\b(today|tonight)\b/i.test(text)) {
    const ap = parseAmPmTime(text)
    if (!ap) return null
    return wallClockOnDateKey(todayKey, ap.hour, ap.minute)
  }

  if (/\btomorr?ow\b/i.test(text) || /\btomm?orrow\b/i.test(text)) {
    const ap = parseAmPmTime(text)
    if (!ap) return null
    return wallClockOnDateKey(addDaysToDateKey(todayKey, 1), ap.hour, ap.minute)
  }

  const timeOnly = parseAmPmTime(text)
  if (timeOnly) {
    const pastToday = ch > timeOnly.hour || (ch === timeOnly.hour && cmin >= timeOnly.minute)
    const dateKey = addDaysToDateKey(todayKey, pastToday ? 1 : 0)
    return wallClockOnDateKey(dateKey, timeOnly.hour, timeOnly.minute)
  }

  // silence unused — kept for parity with prior signature shape
  void cm
  void cd

  return null
}

/** UTC instant for DB row or UI Date (handles naive wall-clock or ISO UTC). */
export function appointmentInstantFromRaw(
  raw: string,
  timeZone: CanadianBusinessTimezone,
): Date {
  const d = parseDbTimestampToDate(raw, timeZone)
  return d ?? new Date(NaN)
}

/**
 * Calendar cell YYYY-MM-DD from a Date that already represents a UI calendar day
 * in the runtime's local getters. Prefer venueCalendarDayKey for appointments.
 */
export function calendarDateKey(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function isSameVenueCalendarDay(
  scheduledAt: Date,
  calendarDay: Date,
  timeZone: CanadianBusinessTimezone,
): boolean {
  return (
    wallClockDateKey(getVenuePartsFromInstant(scheduledAt, timeZone)) ===
    calendarDateKey(calendarDay)
  )
}

export function formatVenueTime(date: Date, timeZone: CanadianBusinessTimezone): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(timeZone),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatVenueTimeParts(
  date: Date,
  timeZone: CanadianBusinessTimezone,
): { hm: string; period: string } {
  const str = formatVenueTime(date, timeZone)
  const match = str.match(/^(.+?)\s*([AP]M)$/i)
  if (match) return { hm: match[1].trim(), period: match[2].toUpperCase() }
  return { hm: str, period: '' }
}

export function venueTimeHmFromDate(d: Date, timeZone: CanadianBusinessTimezone): string {
  const p = getVenuePartsFromInstant(d, timeZone)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${pad2(p.hour)}:${pad2(p.minute)}`
}

/** YYYY-MM-DD for grouping bookings on the calendar (venue timezone). */
export function venueCalendarDayKey(d: Date, timeZone: CanadianBusinessTimezone): string {
  return wallClockDateKey(getVenuePartsFromInstant(d, timeZone))
}

/** YYYY-MM for grouping bookings by venue month (analytics). */
export function venueMonthKey(d: Date, timeZone: CanadianBusinessTimezone): string {
  const p = getVenuePartsFromInstant(d, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

/** Infer YYYY-MM-DD date key from natural language (venue calendar). */
export function inferDateKeyFromText(text: string, now: WallClockParts): string {
  const combined = text.toLowerCase()
  const todayKey = wallClockDateKey(now)

  if (/\btomorr?ow\b/.test(combined) || /\btomm?orrow\b/.test(combined)) {
    return addDaysToDateKey(todayKey, 1)
  }

  const wdMatch = combined.match(
    /\b(?:(next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  )
  if (wdMatch) {
    const target = WEEKDAYS.indexOf(
      wdMatch[2] as (typeof WEEKDAYS)[number],
    )
    const todayWd = weekdayIndexFromParts(now)
    let daysAhead = target - todayWd
    if (daysAhead < 0) daysAhead += 7
    // A bare weekday matching today's weekday means TODAY; only "next" jumps a week.
    if (wdMatch[1] === 'next') daysAhead += 7
    return addDaysToDateKey(todayKey, daysAhead)
  }

  const iso = text.match(/(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]

  if (/\btoday\b|\btonight\b/.test(combined)) return todayKey

  return todayKey
}

const DATE_HINT_RE =
  /\btomorr?ow\b|\btomm?orrow\b|\btoday\b|\btonight\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b|\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\d{4}-\d{2}-\d{2}/i

/**
 * Resolve booking time for chat.
 *
 * Strategy:
 * 1. Last user message with BOTH an explicit date hint AND a time
 * 2. Combine AI-confirmed TIME + user-stated DATE
 * 3. Full parse of threadText
 * 4. Full parse of assistantText
 * 5. Hard default
 */
export function resolveReservationWallClock(params: {
  assistantText: string
  threadText: string
  lastUserContent: string
  timeZone: CanadianBusinessTimezone
}): string {
  const tz = params.timeZone
  const now = getVenueNowParts(tz)
  const todayKey = wallClockDateKey(now)

  // 1. Last user message has BOTH a date hint AND a time
  if (
    params.lastUserContent.trim() &&
    DATE_HINT_RE.test(params.lastUserContent) &&
    parseTimeFromText(params.lastUserContent)
  ) {
    const wc = parseScheduledAtToWallClock(params.lastUserContent, tz)
    if (wc) return wc
  }

  // 2. AI-confirmed time + user-stated date
  const confirmedTime = parseTimeFromText(params.assistantText)
  if (confirmedTime) {
    let dateKey = todayKey
    for (const text of [params.lastUserContent, params.threadText]) {
      if (DATE_HINT_RE.test(text)) {
        dateKey = inferDateKeyFromText(text, now)
        break
      }
    }
    return wallClockOnDateKey(dateKey, confirmedTime.hour, confirmedTime.minute)
  }

  // 3. Full parse of thread history
  if (params.threadText.trim() && parseTimeFromText(params.threadText)) {
    const wc = parseScheduledAtToWallClock(params.threadText, tz)
    if (wc) return wc
  }

  // 4. Full parse of assistant text
  if (params.assistantText.trim()) {
    const wc = parseScheduledAtToWallClock(params.assistantText, tz)
    if (wc) return wc
  }

  return defaultReservationWallClock(tz)
}

/** Format a YYYY-MM-DD date key for emails (weekday) without server-local skew. */
export function formatDateKeyLabel(dateKey: string, options?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return dateKey
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return noonUtc.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
    ...options,
  })
}
