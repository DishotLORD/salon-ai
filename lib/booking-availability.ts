import type { BookingSettings } from '@/lib/booking-settings'
import {
  dateFromWallClockParts,
  formatWallClock,
  formatWallClockLabel,
  parseWallClock,
  wallClockDateKey,
  wallClockFromDate,
  wallClockToMinutesOfDay,
  type WallClockParts,
} from '@/lib/booking-wall-clock'
import {
  BOOKING_SLOT_MINUTES,
  getDayHoursForDate,
  timelineRangeFromDayHours,
  type OperatingHours,
} from '@/lib/operating-hours'
import { buildTimeSlots, timeToMinutes, type TimelineRange } from '@/lib/time-timeline'

export type ExistingBooking = {
  id?: string
  scheduled_at: string
  status: string | null
  duration_minutes?: number | null
}

export type AvailableSlot = {
  wallClock: string
  label: string
  startMinutes: number
}

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'seated'])

function isActiveStatus(status: string | null | undefined): boolean {
  if (!status) return true
  const s = status.toLowerCase()
  if (s === 'cancelled' || s === 'canceled' || s === 'no-show' || s === 'noshow') return false
  return ACTIVE_STATUSES.has(s) || s.length > 0
}

function durationForBooking(
  row: ExistingBooking,
  settings: BookingSettings,
): number {
  if (row.duration_minutes != null && row.duration_minutes > 0) {
    return row.duration_minutes
  }
  return settings.default_duration_minutes
}

export type BookingInterval = {
  dateKey: string
  startMin: number
  endMin: number
}

/** Interval on minutes axis; endMin may exceed 24*60 when turn crosses midnight. */
export function bookingToInterval(
  scheduledAt: string,
  durationMinutes: number,
): BookingInterval | null {
  const parts = parseWallClock(scheduledAt)
  if (!parts) return null
  const startMin = wallClockToMinutesOfDay(parts)
  return {
    dateKey: wallClockDateKey(parts),
    startMin,
    endMin: startMin + durationMinutes,
  }
}

function intervalsOverlap(a: BookingInterval, b: BookingInterval): boolean {
  if (a.dateKey !== b.dateKey) return false
  return a.startMin < b.endMin && b.startMin < a.endMin
}

function countOverlapping(
  candidate: BookingInterval,
  existing: ExistingBooking[],
  settings: BookingSettings,
  excludeId?: string,
): number {
  let count = 0
  for (const row of existing) {
    if (excludeId && row.id === excludeId) continue
    if (!isActiveStatus(row.status)) continue
    const interval = bookingToInterval(row.scheduled_at, durationForBooking(row, settings))
    if (!interval) continue
    if (intervalsOverlap(candidate, interval)) count += 1
  }
  return count
}

function rangeForDate(hours: OperatingHours, dateKey: string): TimelineRange | null {
  const day = getDayHoursForDate(hours, dateKey)
  const range = timelineRangeFromDayHours(day, BOOKING_SLOT_MINUTES)
  if (!range) return null
  return range
}

function slotFitsClosing(
  startMin: number,
  durationMinutes: number,
  range: TimelineRange,
): boolean {
  const endMin = startMin + durationMinutes
  if (range.wrapAfterMidnight) {
    return endMin <= range.end
  }
  return endMin <= range.end && startMin >= range.start
}

/**
 * Open start times on a date when a new booking of `durationMinutes` can fit.
 */
export function getOpenSlotsForDate(params: {
  dateKey: string
  operatingHours: OperatingHours
  existing: ExistingBooking[]
  settings: BookingSettings
  durationMinutes?: number
  now?: WallClockParts
  excludeAppointmentId?: string
}): AvailableSlot[] {
  const {
    dateKey,
    operatingHours,
    existing,
    settings,
    durationMinutes = settings.default_duration_minutes,
    now,
    excludeAppointmentId,
  } = params

  const range = rangeForDate(operatingHours, dateKey)
  if (!range) return []

  const slots = buildTimeSlots({ ...range, step: settings.slot_interval_minutes })
  const open: AvailableSlot[] = []

  for (const slot of slots) {
    const startMin = slot.minutes
    if (!slotFitsClosing(startMin, durationMinutes, range)) continue

    if (now) {
      const nowKey = wallClockDateKey(now)
      if (dateKey === nowKey) {
        const nowMin = wallClockToMinutesOfDay(now)
        if (startMin <= nowMin) continue
      } else if (dateKey < nowKey) {
        continue
      }
    }

    const parts: WallClockParts = {
      year: parseInt(dateKey.slice(0, 4), 10),
      month: parseInt(dateKey.slice(5, 7), 10),
      day: parseInt(dateKey.slice(8, 10), 10),
      hour: Math.floor((startMin % (24 * 60)) / 60),
      minute: startMin % 60,
    }

    const candidate: BookingInterval = {
      dateKey,
      startMin,
      endMin: startMin + durationMinutes,
    }

    const overlaps = countOverlapping(candidate, existing, settings, params.excludeAppointmentId)
    if (overlaps >= settings.max_concurrent_reservations) continue

    open.push({
      wallClock: formatWallClock(parts),
      label: formatWallClockLabel(parts),
      startMinutes: startMin,
    })
  }

  return open
}

export function isSlotAvailable(params: {
  wallClock: string
  operatingHours: OperatingHours
  existing: ExistingBooking[]
  settings: BookingSettings
  durationMinutes?: number
  now?: WallClockParts
  excludeAppointmentId?: string
}): boolean {
  const parts = parseWallClock(params.wallClock)
  if (!parts) return false
  const duration = params.durationMinutes ?? params.settings.default_duration_minutes
  const dateKey = wallClockDateKey(parts)
  const startMin = wallClockToMinutesOfDay(parts)

  const open = getOpenSlotsForDate({
    dateKey,
    operatingHours: params.operatingHours,
    existing: params.existing,
    settings: params.settings,
    durationMinutes: duration,
    now: params.now,
    excludeAppointmentId: params.excludeAppointmentId,
  })

  return open.some((s) => s.startMinutes === startMin)
}

export function findNearestOpenSlots(params: {
  targetWallClock: string
  operatingHours: OperatingHours
  existing: ExistingBooking[]
  settings: BookingSettings
  durationMinutes?: number
  limit?: number
  now?: WallClockParts
}): AvailableSlot[] {
  const parts = parseWallClock(params.targetWallClock)
  if (!parts) return []
  const duration = params.durationMinutes ?? params.settings.default_duration_minutes
  const dateKey = wallClockDateKey(parts)
  const targetMin = wallClockToMinutesOfDay(parts)
  const limit = params.limit ?? 5

  const sameDay = getOpenSlotsForDate({
    dateKey,
    operatingHours: params.operatingHours,
    existing: params.existing,
    settings: params.settings,
    durationMinutes: duration,
    now: params.now,
  })

  const scored = sameDay
    .map((s) => ({ slot: s, delta: Math.abs(s.startMinutes - targetMin) }))
    .sort((a, b) => a.delta - b.delta)

  const picked = scored.slice(0, limit).map((s) => s.slot)
  if (picked.length >= limit) return picked

  // Next open day (up to 7 days)
  const base = dateFromWallClockParts(parts)
  for (let d = 1; d <= 7 && picked.length < limit; d++) {
    const next = new Date(base)
    next.setDate(next.getDate() + d)
    const nextKey = wallClockDateKey(wallClockFromDate(next))
    const daySlots = getOpenSlotsForDate({
      dateKey: nextKey,
      operatingHours: params.operatingHours,
      existing: params.existing,
      settings: params.settings,
      durationMinutes: duration,
      now: params.now,
    })
    for (const slot of daySlots.slice(0, limit - picked.length)) {
      picked.push(slot)
    }
  }

  return picked
}

export function formatSlotsListForPrompt(slots: AvailableSlot[], header?: string): string {
  if (slots.length === 0) {
    return 'No open reservation times are available for that date. Suggest another day or ask the guest for flexibility.'
  }
  const lines = slots.map((s) => `- ${s.label}`)
  const title = header ?? 'AVAILABLE RESERVATION TIMES (only offer times from this list when confirming)'
  return `${title}:\n${lines.join('\n')}`
}

/** Build prompt block for chat from inferred date + party context. */
export function buildAvailabilityPromptSection(params: {
  operatingHours: OperatingHours
  existing: ExistingBooking[]
  settings: BookingSettings
  targetDateKey: string
  partySize: number
  preferredWallClock?: string | null
  now?: WallClockParts
}): string {
  const duration = params.settings.default_duration_minutes
  const open = getOpenSlotsForDate({
    dateKey: params.targetDateKey,
    operatingHours: params.operatingHours,
    existing: params.existing,
    settings: params.settings,
    durationMinutes: duration,
    now: params.now,
  })

  let section = `BOOKING CAPACITY: Party of ${params.partySize}. Typical table turn ${duration} minutes. Max ${params.settings.max_concurrent_reservations} reservations can overlap at once.\n`

  if (params.preferredWallClock) {
    const available = isSlotAvailable({
      wallClock: params.preferredWallClock,
      operatingHours: params.operatingHours,
      existing: params.existing,
      settings: params.settings,
      durationMinutes: duration,
      now: params.now,
    })
    const label = formatWallClockLabel(parseWallClock(params.preferredWallClock)!)
    if (available) {
      section += `Requested time (${label}) is AVAILABLE. You may confirm this exact time.\n`
    } else {
      section += `Requested time (${label}) is NOT available. Do NOT confirm that time. Offer alternatives from the list below.\n`
      const alts = findNearestOpenSlots({
        targetWallClock: params.preferredWallClock,
        operatingHours: params.operatingHours,
        existing: params.existing,
        settings: params.settings,
        durationMinutes: duration,
        limit: 6,
        now: params.now,
      })
      section += formatSlotsListForPrompt(alts, 'NEARBY AVAILABLE TIMES')
      section += '\n'
    }
  }

  section += formatSlotsListForPrompt(open.slice(0, 12))
  return section
}

export function inferDateKeyFromText(
  text: string,
  now: WallClockParts,
): string {
  const combined = text.toLowerCase()
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const todayKey = wallClockDateKey(now)

  if (/\btomorrow\b/.test(combined)) {
    const d = new Date(now.year, now.month - 1, now.day + 1)
    return wallClockDateKey(wallClockFromDate(d))
  }

  const wdMatch = combined.match(
    /\b(?:(next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  )
  if (wdMatch) {
    const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const target = WEEKDAYS.indexOf(wdMatch[2])
    const today = new Date(now.year, now.month - 1, now.day)
    let daysAhead = target - today.getDay()
    if (wdMatch[1] === 'next' || daysAhead <= 0) daysAhead += 7
    const d = new Date(today)
    d.setDate(d.getDate() + daysAhead)
    return wallClockDateKey(wallClockFromDate(d))
  }

  const iso = text.match(/(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]

  if (/\btoday\b|\btonight\b/.test(combined)) return todayKey

  return todayKey
}

export function preferredWallClockFromText(
  text: string,
  dateKey: string,
  now: WallClockParts,
): string | null {
  const tm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (!tm) return null
  let h = parseInt(tm[1], 10)
  const mi = tm[2] ? parseInt(tm[2], 10) : 0
  const ap = tm[3].toUpperCase()
  if (ap === 'PM' && h < 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const [y, m, d] = dateKey.split('-').map(Number)
  return `${y}-${pad2(m)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}:00`
}

export { timeToMinutes }
