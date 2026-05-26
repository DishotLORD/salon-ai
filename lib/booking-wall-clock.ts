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
  return WALL_CLOCK_RE.test(value.trim()) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value.trim())
}

/**
 * Normalize DB/API scheduled_at to Calgary wall-clock "YYYY-MM-DDTHH:mm:ss".
 * timestamptz from Supabase is ISO UTC — must not be parsed as literal local digits.
 */
export function scheduledAtToWallClock(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (isNaiveWallClock(trimmed)) {
    const parts = parseWallClock(trimmed)
    return parts ? formatWallClock(parts) : null
  }

  const asDate = new Date(trimmed)
  if (!Number.isNaN(asDate.getTime())) {
    return formatWallClock(getCalgaryPartsFromInstant(asDate))
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

/** @deprecated Prefer getCalgaryPartsFromInstant; uses server local timezone. */
export function wallClockFromDate(date: Date): WallClockParts {
  return getCalgaryPartsFromInstant(date)
}
