/** Wall-clock timestamps stored as "YYYY-MM-DDTHH:mm:ss" (no timezone offset). */

export const CALGARY_TZ = 'America/Edmonton'

export function getCalgaryNowParts(): WallClockParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CALGARY_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  }
}

export type WallClockParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export function parseWallClock(value: string): WallClockParts | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/)
  if (!m) return null
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
    hour: parseInt(m[4], 10),
    minute: parseInt(m[5], 10),
  }
}

export function wallClockDateKey(parts: WallClockParts): string {
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
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
  const date = new Date(parts.year, parts.month - 1, parts.day)
  const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (m === 0) return `${dayLabel} at ${dh} ${period}`
  return `${dayLabel} at ${dh}:${String(m).padStart(2, '0')} ${period}`
}

export function dateFromWallClockParts(parts: WallClockParts): Date {
  const d = new Date(parts.year, parts.month - 1, parts.day)
  d.setHours(parts.hour, parts.minute, 0, 0)
  return d
}

export function wallClockFromDate(date: Date): WallClockParts {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  }
}
