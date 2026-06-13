/** Wall-clock timestamps for reservations: always interpreted in Calgary (America/Edmonton). */

export const CALGARY_TZ = 'America/Edmonton'

const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

export type WallClockParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export function getCalgaryPartsFromInstant(date: Date): WallClockParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CALGARY_TZ,
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

export function getCalgaryNowParts(): WallClockParts {
  return getCalgaryPartsFromInstant(new Date())
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
 * - Naive "YYYY-MM-DDTHH:mm:ss" without offset → UTC (Postgres timestamptz), NOT Calgary digits
 * - Fallback → literal Calgary wall-clock (legacy rows)
 */
export function parseDbTimestampToDate(raw: string): Date | null {
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
    const calgary = wallClockInCalgaryToUtcDate(trimmed)
    return Number.isNaN(calgary.getTime()) ? null : calgary
  }

  const d = new Date(trimmed)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Normalize DB/API scheduled_at to Calgary wall-clock "YYYY-MM-DDTHH:mm:ss".
 */
export function scheduledAtToWallClock(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const instant = parseDbTimestampToDate(trimmed)
  if (instant) {
    return formatWallClock(getCalgaryPartsFromInstant(instant))
  }

  const parts = parseWallClock(trimmed)
  return parts ? formatWallClock(parts) : null
}

/** UTC instant for a Calgary wall-clock moment (for timestamptz queries). */
export function wallClockInCalgaryToUtcDate(wallClock: string): Date {
  const target = parseWallClock(wallClock)
  if (!target) return new Date(NaN)

  const targetKey = wallClockDateKey(target)
  const targetMin = wallClockToMinutesOfDay(target)

  let guessMs = Date.UTC(target.year, target.month - 1, target.day, target.hour + 7, target.minute, 0)

  for (let i = 0; i < 96; i++) {
    const p = getCalgaryPartsFromInstant(new Date(guessMs))
    const key = wallClockDateKey(p)
    const min = wallClockToMinutesOfDay(p)

    if (key === targetKey && min === targetMin) {
      return new Date(guessMs)
    }

    const keyCmp = key.localeCompare(targetKey)
    if (keyCmp < 0 || (keyCmp === 0 && min < targetMin)) {
      guessMs += 15 * 60 * 1000
    } else {
      guessMs -= 15 * 60 * 1000
    }
  }

  return new Date(guessMs)
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
  const hour = Math.floor((rounded % (24 * 60)) / 60)
  const minute = rounded % 60
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(hour)}:${pad2(minute)}:00`
}

/** Calendar date arithmetic on YYYY-MM-DD (timezone-safe for day boundaries). */
export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + deltaDays))
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
}

export function calgaryWeekdayIndex(parts: WallClockParts): number {
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

export function dateFromWallClockParts(parts: WallClockParts): Date {
  return wallClockInCalgaryToUtcDate(formatWallClock(parts))
}

/** @deprecated Prefer getCalgaryPartsFromInstant. */
export function wallClockFromDate(date: Date): WallClockParts {
  return getCalgaryPartsFromInstant(date)
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

/** Default fallback when no time parsed: tonight 7pm Calgary (tomorrow if already past 7pm). */
export function defaultReservationWallClock(): string {
  const now = getCalgaryNowParts()
  const todayKey = wallClockDateKey(now)
  const dateKey = now.hour >= 19 ? addDaysToDateKey(todayKey, 1) : todayKey
  return wallClockOnDateKey(dateKey, 19, 0)
}

/**
 * Parse guest/AI text into Calgary wall-clock "YYYY-MM-DDTHH:mm:ss".
 * Never uses server or browser local timezone.
 */
export function parseScheduledAtToWallClock(text: string): string | null {
  if (!text.trim()) return null

  const now = getCalgaryNowParts()
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
    const todayWd = calgaryWeekdayIndex(now)
    let daysAhead = targetWd - todayWd
    if (modifier === 'next' || daysAhead <= 0) daysAhead += 7
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

  return null
}

/** UTC instant for DB row or UI Date (handles naive wall-clock or ISO UTC). */
export function appointmentInstantFromRaw(raw: string): Date {
  const d = parseDbTimestampToDate(raw)
  return d ?? new Date(NaN)
}

/** Calendar cell YYYY-MM-DD (UI day label, not timezone-shifted). */
export function calendarDateKey(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function isSameCalgaryCalendarDay(scheduledAt: Date, calendarDay: Date): boolean {
  return (
    wallClockDateKey(getCalgaryPartsFromInstant(scheduledAt)) ===
    calendarDateKey(calendarDay)
  )
}

export function formatCalgaryTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CALGARY_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatCalgaryTimeParts(date: Date): { hm: string; period: string } {
  const str = formatCalgaryTime(date)
  const match = str.match(/^(.+?)\s*([AP]M)$/i)
  if (match) return { hm: match[1].trim(), period: match[2].toUpperCase() }
  return { hm: str, period: '' }
}

export function calgaryTimeHmFromDate(d: Date): string {
  const p = getCalgaryPartsFromInstant(d)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${pad2(p.hour)}:${pad2(p.minute)}`
}

/** YYYY-MM-DD for grouping bookings on the calendar (always Calgary). */
export function calgaryCalendarDayKey(d: Date): string {
  return wallClockDateKey(getCalgaryPartsFromInstant(d))
}

/** Infer YYYY-MM-DD date key from natural language (Calgary). */
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
    const todayWd = calgaryWeekdayIndex(now)
    let daysAhead = target - todayWd
    if (wdMatch[1] === 'next' || daysAhead <= 0) daysAhead += 7
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
 * 1. Last user message with BOTH an explicit date hint AND a time (e.g. "tomorrow 7pm") — highest
 *    confidence, guest stated the full datetime explicitly in the most recent turn.
 * 2. Combine AI-confirmed TIME + user-stated DATE:
 *    - TIME comes from assistantText — the AI picked this from the available-slots list, so it is
 *      the most reliable source for the *agreed-upon* slot, especially after the guest changed their
 *      mind mid-conversation (e.g. asked for 4:20 PM, then accepted 7:00 PM).
 *    - DATE comes from user messages — the guest is authoritative on date; the AI sometimes writes
 *      "today" when the guest clearly said "tomorrow".
 * 3. Full parse of threadText (fallback — may contain the original requested time).
 * 4. Full parse of assistantText.
 * 5. Hard default.
 */
export function resolveReservationWallClock(params: {
  assistantText: string
  threadText: string
  lastUserContent: string
}): string {
  const now = getCalgaryNowParts()
  const todayKey = wallClockDateKey(now)

  // 1. Last user message has BOTH a date hint ("tomorrow", "Friday", etc.) AND a time
  if (
    params.lastUserContent.trim() &&
    DATE_HINT_RE.test(params.lastUserContent) &&
    parseTimeFromText(params.lastUserContent)
  ) {
    const wc = parseScheduledAtToWallClock(params.lastUserContent)
    if (wc) return wc
  }

  // 2. AI-confirmed time + user-stated date
  const confirmedTime = parseTimeFromText(params.assistantText)
  if (confirmedTime) {
    // Prefer user's date over the AI's date — AI occasionally writes "today" for "tomorrow"
    let dateKey = todayKey
    for (const text of [params.lastUserContent, params.threadText]) {
      if (DATE_HINT_RE.test(text)) {
        dateKey = inferDateKeyFromText(text, now)
        break
      }
    }
    return wallClockOnDateKey(dateKey, confirmedTime.hour, confirmedTime.minute)
  }

  // 3. Full parse of thread history (contains the original requested time)
  if (params.threadText.trim() && parseTimeFromText(params.threadText)) {
    const wc = parseScheduledAtToWallClock(params.threadText)
    if (wc) return wc
  }

  // 4. Full parse of assistant text
  if (params.assistantText.trim()) {
    const wc = parseScheduledAtToWallClock(params.assistantText)
    if (wc) return wc
  }

  return defaultReservationWallClock()
}
