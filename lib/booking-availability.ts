import type { BookingSettings } from '@/lib/booking-settings'
import {
  activeZonesForParty,
  formatZoneNamesList,
  type DiningZone,
  type ZoneResolution,
} from '@/lib/dining-zones'
import {
  addDaysToDateKey,
  formatWallClock,
  formatWallClockLabel,
  getCalgaryNowParts,
  inferDateKeyFromText,
  parseTimeFromText,
  parseWallClock,
  scheduledAtToWallClock,
  snapWallClockToSlotInterval,
  wallClockDateKey,
  wallClockToMinutesOfDay,
  type WallClockParts,
} from '@/lib/booking-wall-clock'
import {
  BOOKING_SLOT_MINUTES,
  formatHoursRangeLabel,
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
  zone_id?: string | null
  party_size?: number | null
}

export type AvailableSlot = {
  wallClock: string
  label: string
  startMinutes: number
  zoneId?: string
  zoneName?: string
}

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'seated'])

/** Set BOOKING_AVAILABILITY_DEBUG=1 to log query date vs DB bookings (Calgary wall-clock). */
const AVAILABILITY_DEBUG = process.env.BOOKING_AVAILABILITY_DEBUG === '1'

export function logAvailabilityDebug(
  event: string,
  payload: Record<string, unknown>,
): void {
  if (!AVAILABILITY_DEBUG) return
  console.log(
    '[booking-availability]',
    event,
    JSON.stringify({
      businessTz: 'America/Edmonton',
      ...payload,
    }),
  )
}

function isActiveStatus(status: string | null | undefined): boolean {
  if (!status) return true
  const s = status.toLowerCase()
  if (s === 'cancelled' || s === 'canceled' || s === 'no-show' || s === 'noshow') return false
  return ACTIVE_STATUSES.has(s) || s.length > 0
}

function durationForBooking(
  row: ExistingBooking,
  settings: BookingSettings,
  zone?: DiningZone | null,
): number {
  if (row.duration_minutes != null && row.duration_minutes > 0) {
    return row.duration_minutes
  }
  if (zone?.turnover_minutes) return zone.turnover_minutes
  return settings.default_duration_minutes
}

function bookingCountsTowardZone(row: ExistingBooking, zone: DiningZone): boolean {
  if (row.zone_id != null) return row.zone_id === zone.id
  return zone.slug === 'main-dining'
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
  const normalized = scheduledAtToWallClock(scheduledAt) ?? scheduledAt
  const parts = parseWallClock(normalized)
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

function countOverlappingInZone(
  candidate: BookingInterval,
  existing: ExistingBooking[],
  zone: DiningZone,
  settings: BookingSettings,
  excludeId?: string,
): number {
  let covers = 0
  for (const row of existing) {
    if (excludeId && row.id === excludeId) continue
    if (!isActiveStatus(row.status)) continue
    if (!bookingCountsTowardZone(row, zone)) continue
    const interval = bookingToInterval(
      row.scheduled_at,
      durationForBooking(row, settings, zone),
    )
    if (!interval) continue
    if (intervalsOverlap(candidate, interval)) {
      covers += row.party_size != null && row.party_size > 0 ? row.party_size : 2
    }
  }
  return covers
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
function wallClockPartsForSlot(dateKey: string, startMin: number): WallClockParts {
  return {
    year: parseInt(dateKey.slice(0, 4), 10),
    month: parseInt(dateKey.slice(5, 7), 10),
    day: parseInt(dateKey.slice(8, 10), 10),
    hour: Math.floor((startMin % (24 * 60)) / 60),
    minute: startMin % 60,
  }
}

/** Whole-day difference toKey - fromKey (timezone-safe on YYYY-MM-DD). */
function dateKeyDiffDays(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

function slotPassesNowFilter(
  dateKey: string,
  startMin: number,
  now?: WallClockParts,
  minNoticeMinutes = 0,
): boolean {
  if (!now) return true
  const nowKey = wallClockDateKey(now)
  const diffDays = dateKeyDiffDays(nowKey, dateKey)
  if (diffDays < 0) return false

  const absoluteNow = wallClockToMinutesOfDay(now)
  const absoluteSlot = diffDays * 24 * 60 + startMin
  // Must be strictly in the future and respect the minimum-notice window.
  if (absoluteSlot <= absoluteNow) return false
  if (absoluteSlot < absoluteNow + Math.max(0, minNoticeMinutes)) return false
  return true
}

function collectSlotsForZone(params: {
  dateKey: string
  range: TimelineRange
  operatingHours: OperatingHours
  existing: ExistingBooking[]
  settings: BookingSettings
  zone: DiningZone
  partySize: number
  now?: WallClockParts
  excludeAppointmentId?: string
}): AvailableSlot[] {
  const { dateKey, range, existing, settings, zone, partySize, now, excludeAppointmentId } = params
  const durationMinutes = zone.turnover_minutes || settings.default_duration_minutes
  const slots = buildTimeSlots({ ...range, step: settings.slot_interval_minutes })
  const open: AvailableSlot[] = []

  for (const slot of slots) {
    const startMin = slot.minutes
    // Use slot_interval_minutes for the closing-fit check so the last shown slot
    // is one interval before closing — not (duration) minutes before closing.
    // The overlap candidate still uses the full duration for conflict detection.
    if (!slotFitsClosing(startMin, settings.slot_interval_minutes, range)) continue
    if (!slotPassesNowFilter(dateKey, startMin, now, settings.min_notice_minutes)) continue

    const parts = wallClockPartsForSlot(dateKey, startMin)
    const candidate: BookingInterval = {
      dateKey,
      startMin,
      endMin: startMin + durationMinutes,
    }

    const overlaps = countOverlappingInZone(
      candidate,
      existing,
      zone,
      settings,
      excludeAppointmentId,
    )
    if (overlaps + partySize > zone.max_concurrent_parties) continue

    const label = `${formatWallClockLabel(parts)} (${zone.name})`
    open.push({
      wallClock: formatWallClock(parts),
      label,
      startMinutes: startMin,
      zoneId: zone.id,
      zoneName: zone.name,
    })
  }

  return open
}

export function getOpenSlotsForDate(params: {
  dateKey: string
  operatingHours: OperatingHours
  existing: ExistingBooking[]
  settings: BookingSettings
  durationMinutes?: number
  now?: WallClockParts
  excludeAppointmentId?: string
  zones?: DiningZone[]
  partySize?: number
  zoneId?: string | null
}): AvailableSlot[] {
  const {
    dateKey,
    operatingHours,
    existing,
    settings,
    durationMinutes = settings.default_duration_minutes,
    now,
    excludeAppointmentId,
    zones,
    partySize = 2,
  } = params

  // Beyond the booking horizon → no slots (guests cannot book that far ahead).
  if (now) {
    const aheadDays = dateKeyDiffDays(wallClockDateKey(now), dateKey)
    if (aheadDays > settings.max_advance_days) {
      logAvailabilityDebug('beyond_max_advance', {
        queryDateKey: dateKey,
        maxAdvanceDays: settings.max_advance_days,
        aheadDays,
      })
      return []
    }
  }

  const range = rangeForDate(operatingHours, dateKey)
  if (!range) {
    logAvailabilityDebug('no_operating_hours', {
      queryDateKey: dateKey,
      calgaryNow: now ? wallClockDateKey(now) : getCalgaryNowParts(),
    })
    return []
  }

  const activeZones = zones?.length
    ? activeZonesForParty(zones, partySize)
    : []

  if (activeZones.length > 0) {
    const targetZones = params.zoneId
      ? activeZones.filter((z) => z.id === params.zoneId)
      : activeZones

    const merged: AvailableSlot[] = []
    const seen = new Set<string>()

    for (const zone of targetZones) {
      for (const slot of collectSlotsForZone({
        dateKey,
        range,
        operatingHours,
        existing,
        settings,
        zone,
        partySize,
        now,
        excludeAppointmentId,
      })) {
        const key = `${slot.wallClock}:${slot.zoneId ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(slot)
      }
    }

    merged.sort((a, b) => a.startMinutes - b.startMinutes || (a.zoneName ?? '').localeCompare(b.zoneName ?? ''))
    logAvailabilityDebug('open_slots', {
      queryDateKey: dateKey,
      calgaryNow: now ? formatWallClock(now) : formatWallClock(getCalgaryNowParts()),
      partySize: params.partySize,
      zoneId: params.zoneId ?? null,
      existingBookings: existing.map((b) => ({
        id: b.id,
        raw: b.scheduled_at,
        wallClock: scheduledAtToWallClock(b.scheduled_at),
        status: b.status,
        zone_id: b.zone_id ?? null,
      })),
      openSlotCount: merged.length,
      sampleSlots: merged.slice(0, 5).map((s) => s.label),
    })
    return merged
  }

  const slots = buildTimeSlots({ ...range, step: settings.slot_interval_minutes })
  const open: AvailableSlot[] = []

  for (const slot of slots) {
    const startMin = slot.minutes
    if (!slotFitsClosing(startMin, settings.slot_interval_minutes, range)) continue
    if (!slotPassesNowFilter(dateKey, startMin, now, settings.min_notice_minutes)) continue

    const parts = wallClockPartsForSlot(dateKey, startMin)
    const candidate: BookingInterval = {
      dateKey,
      startMin,
      endMin: startMin + durationMinutes,
    }

    const overlaps = countOverlapping(candidate, existing, settings, excludeAppointmentId)
    if (overlaps >= settings.max_concurrent_reservations) continue

    open.push({
      wallClock: formatWallClock(parts),
      label: formatWallClockLabel(parts),
      startMinutes: startMin,
    })
  }

  logAvailabilityDebug('open_slots', {
    queryDateKey: dateKey,
    calgaryNow: now ? formatWallClock(now) : formatWallClock(getCalgaryNowParts()),
    partySize: params.partySize,
    existingBookings: existing.map((b) => ({
      id: b.id,
      raw: b.scheduled_at,
      wallClock: scheduledAtToWallClock(b.scheduled_at),
      status: b.status,
    })),
    openSlotCount: open.length,
    maxConcurrent: settings.max_concurrent_reservations,
    sampleSlots: open.slice(0, 5).map((s) => s.label),
  })

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
  zones?: DiningZone[]
  partySize?: number
  zoneId?: string | null
}): boolean {
  const parts = parseWallClock(params.wallClock)
  if (!parts) return false
  const dateKey = wallClockDateKey(parts)
  const startMin = wallClockToMinutesOfDay(parts)

  const open = getOpenSlotsForDate({
    dateKey,
    operatingHours: params.operatingHours,
    existing: params.existing,
    settings: params.settings,
    durationMinutes: params.durationMinutes,
    now: params.now,
    excludeAppointmentId: params.excludeAppointmentId,
    zones: params.zones,
    partySize: params.partySize,
    zoneId: params.zoneId,
  })

  if (params.zoneId) {
    return open.some((s) => s.startMinutes === startMin && s.zoneId === params.zoneId)
  }
  return open.some((s) => s.startMinutes === startMin)
}

export function pickZoneForSlot(
  wallClock: string,
  zones: DiningZone[],
  partySize: number,
  operatingHours: OperatingHours,
  existing: ExistingBooking[],
  settings: BookingSettings,
  preferredZoneId?: string | null,
  now?: WallClockParts,
): DiningZone | null {
  const parts = parseWallClock(wallClock)
  if (!parts) return null
  const dateKey = wallClockDateKey(parts)
  const open = getOpenSlotsForDate({
    dateKey,
    operatingHours,
    existing,
    settings,
    zones,
    partySize,
    now,
  })
  const startMin = wallClockToMinutesOfDay(parts)
  const matching = open.filter((s) => s.startMinutes === startMin)
  if (matching.length === 0) return null
  if (preferredZoneId) {
    const preferred = matching.find((s) => s.zoneId === preferredZoneId)
    if (preferred) {
      return zones.find((z) => z.id === preferredZoneId) ?? null
    }
    // Guest chose this zone — do not silently book another area.
    return null
  }
  const first = matching[0]
  return zones.find((z) => z.id === first.zoneId) ?? null
}

export function findNearestOpenSlots(params: {
  targetWallClock: string
  operatingHours: OperatingHours
  existing: ExistingBooking[]
  settings: BookingSettings
  durationMinutes?: number
  limit?: number
  now?: WallClockParts
  zones?: DiningZone[]
  partySize?: number
  zoneId?: string | null
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
    zones: params.zones,
    partySize: params.partySize,
    zoneId: params.zoneId,
  })

  const scored = sameDay
    .map((s) => ({ slot: s, delta: Math.abs(s.startMinutes - targetMin) }))
    .sort((a, b) => a.delta - b.delta)

  const picked = scored.slice(0, limit).map((s) => s.slot)
  if (picked.length >= limit) return picked

  // Next open day (up to 7 days)
  for (let d = 1; d <= 7 && picked.length < limit; d++) {
    const nextKey = addDaysToDateKey(dateKey, d)
    const daySlots = getOpenSlotsForDate({
      dateKey: nextKey,
      operatingHours: params.operatingHours,
      existing: params.existing,
      settings: params.settings,
      durationMinutes: duration,
      now: params.now,
      zones: params.zones,
      partySize: params.partySize,
      zoneId: params.zoneId,
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

/** Slots to show in chat prompts: from "now" onward on the same day, capped. */
function slotsForPromptDisplay(
  open: AvailableSlot[],
  dateKey: string,
  now?: WallClockParts,
  limit = 28,
): AvailableSlot[] {
  let list = open
  if (now) {
    const nowKey = wallClockDateKey(now)
    if (nowKey === dateKey) {
      const nowMin = wallClockToMinutesOfDay(now)
      const afterNow = open.filter((s) => s.startMinutes > nowMin)
      if (afterNow.length > 0) list = afterNow
    }
  }
  if (list.length <= limit) return list
  return list.slice(0, limit)
}

function lastBookableStartMinutes(range: TimelineRange, slotIntervalMinutes: number): number {
  return range.end - slotIntervalMinutes
}

/** Build prompt block for chat from inferred date + party context. */
export function buildAvailabilityPromptSection(params: {
  operatingHours: OperatingHours
  existing: ExistingBooking[]
  settings: BookingSettings
  targetDateKey: string
  partySize: number
  /** When false, partySize is only a placeholder for slot math — guest has not said a number yet. */
  partySizeKnown?: boolean
  preferredWallClock?: string | null
  now?: WallClockParts
  zones?: DiningZone[]
  preferredZoneId?: string | null
  zoneResolution?: ZoneResolution
}): string {
  const zones = params.zones ?? []
  const hasZones = zones.length > 0
  const duration = params.settings.default_duration_minutes

  const open = getOpenSlotsForDate({
    dateKey: params.targetDateKey,
    operatingHours: params.operatingHours,
    existing: params.existing,
    settings: params.settings,
    durationMinutes: duration,
    now: params.now,
    zones: hasZones ? zones : undefined,
    partySize: params.partySize,
    zoneId: params.preferredZoneId,
  })

  const dayHours = getDayHoursForDate(params.operatingHours, params.targetDateKey)
  const range = rangeForDate(params.operatingHours, params.targetDateKey)
  const slotStep = params.settings.slot_interval_minutes

  const partyKnown = params.partySizeKnown !== false

  let section = hasZones
    ? partyKnown
      ? `BOOKING CAPACITY: Party of ${params.partySize} (guest already stated this size). Dining zones configured — only offer times from the list (zone in parentheses). Do NOT ask how many guests.\n`
      : `BOOKING CAPACITY: Party size not confirmed yet — slots below assume ${params.partySize} for planning only. Ask party size once if still unknown. Dining zones configured.\n`
    : partyKnown
      ? `BOOKING CAPACITY: Party of ${params.partySize} (guest already stated). Typical table turn ${duration} minutes. Max ${params.settings.max_concurrent_reservations} overlapping reservations. Do NOT ask how many guests.\n`
      : `BOOKING CAPACITY: Party size not confirmed — availability below assumes ${params.partySize} for planning. Ask party size if still unknown. Typical turn ${duration} min.\n`

  if (params.settings.min_notice_minutes > 0) {
    const hrs = Math.floor(params.settings.min_notice_minutes / 60)
    const mins = params.settings.min_notice_minutes % 60
    const noticeLabel = hrs > 0 ? `${hrs}h${mins > 0 ? ` ${mins}m` : ''}` : `${mins}m`
    section += `BOOKING WINDOW: requires at least ${noticeLabel} notice; guests may book up to ${params.settings.max_advance_days} days ahead.\n`
  } else {
    section += `BOOKING WINDOW: guests may book up to ${params.settings.max_advance_days} days ahead.\n`
  }

  if (dayHours.closed) {
    section += 'RESTAURANT HOURS this day: Closed. Do not offer reservations for this date.\n'
  } else if (range) {
    const lastStart = lastBookableStartMinutes(range, slotStep)
    const lastLabel = formatWallClockLabel(wallClockPartsForSlot(params.targetDateKey, lastStart))
    section += `RESTAURANT HOURS this day: ${formatHoursRangeLabel(dayHours)}. Bookable start times use ${slotStep}-minute steps; last start about ${lastLabel}.\n`
  } else {
    section += `RESTAURANT HOURS this day: ${formatHoursRangeLabel(dayHours)}.\n`
  }

  const zoneRes = params.zoneResolution
  const eligible =
    zoneRes?.eligibleZones ??
    (hasZones && partyKnown ? activeZonesForParty(zones, params.partySize) : [])

  if (hasZones && partyKnown) {
    if (eligible.length === 0) {
      section +=
        'No dining zone accepts this party size. Ask the guest to adjust party size or contact the restaurant.\n'
    } else if (eligible.length === 1) {
      section += `Seating: ${eligible[0].name} (only zone for this party size).\n`
    } else if (zoneRes && !zoneRes.known) {
      section += `DINING ZONES — guest must choose before you confirm: ${formatZoneNamesList(eligible)}. Ask: "Do you have a seating preference — ${formatZoneNamesList(eligible)} — or is anywhere fine?" Do NOT confirm a table until they pick a zone or say no preference.\n`
    } else if (zoneRes?.known && zoneRes.zoneId && zoneRes.zoneName) {
      section += `Seating area: ${zoneRes.zoneName}. Offer times only for that zone when possible.\n`
    } else if (zoneRes?.known && !zoneRes.zoneId) {
      section += `Seating: guest has NO zone preference — any open zone is fine. Show times from the list (any zone). When confirming, name the zone they got (e.g. Patio at 7:00 PM).\n`
    } else {
      section += `Zones for party of ${params.partySize}: ${formatZoneNamesList(eligible)}.\n`
    }
  } else if (hasZones && !partyKnown) {
    section +=
      'Once party size is known, ask seating preference if multiple zones apply. Until then, do not confirm a reservation.\n'
  }

  let preferredWallClock = params.preferredWallClock
  let preferredRawLabel: string | null = null
  if (preferredWallClock) {
    const rawParts = parseWallClock(preferredWallClock)
    if (rawParts) preferredRawLabel = formatWallClockLabel(rawParts)
    const snapped = snapWallClockToSlotInterval(preferredWallClock, slotStep)
    if (snapped && snapped !== preferredWallClock) {
      preferredWallClock = snapped
    }
  }

  if (preferredWallClock) {
    const available = isSlotAvailable({
      wallClock: preferredWallClock,
      operatingHours: params.operatingHours,
      existing: params.existing,
      settings: params.settings,
      durationMinutes: duration,
      now: params.now,
      zones: hasZones ? zones : undefined,
      partySize: params.partySize,
      zoneId: params.preferredZoneId,
    })
    const label = formatWallClockLabel(parseWallClock(preferredWallClock)!)
    if (preferredRawLabel && preferredRawLabel !== label) {
      section += `Guest asked for ${preferredRawLabel}; bookable slots are every ${slotStep} minutes — use ${label} (nearest slot).\n`
    }
    if (available) {
      section += `Requested time (${label}) is AVAILABLE. You may confirm this exact time.\n`
    } else {
      if (range) {
        const latestStart = lastBookableStartMinutes(range, slotStep)
        if (latestStart >= range.start) {
          const latestParts = wallClockPartsForSlot(params.targetDateKey, latestStart)
          section += `Requested time (${label}) is NOT available (only ${slotStep}-minute start times; we are open ${formatHoursRangeLabel(dayHours)}). Latest bookable start today is about ${formatWallClockLabel(latestParts)}. Offer NEARBY AVAILABLE TIMES — do NOT say the restaurant is fully booked if the list below has options.\n`
        } else {
          section += `Requested time (${label}) is NOT available. Do NOT confirm that time.\n`
        }
      } else {
        section += `Requested time (${label}) is NOT available. Do NOT confirm that time.\n`
      }
      const alts = findNearestOpenSlots({
        targetWallClock: preferredWallClock,
        operatingHours: params.operatingHours,
        existing: params.existing,
        settings: params.settings,
        durationMinutes: duration,
        limit: 8,
        now: params.now,
        zones: hasZones ? zones : undefined,
        partySize: params.partySize,
        zoneId: params.preferredZoneId,
      })
      section += formatSlotsListForPrompt(alts, 'NEARBY AVAILABLE TIMES')
      section += '\n'
    }
  }

  const promptSlots = slotsForPromptDisplay(open, params.targetDateKey, params.now)
  const slotHeader =
    open.length > promptSlots.length
      ? `AVAILABLE RESERVATION TIMES (${promptSlots.length} of ${open.length} open starts shown; only offer times from this list)`
      : `AVAILABLE RESERVATION TIMES (${open.length} open starts; only offer times from this list)`
  section += formatSlotsListForPrompt(promptSlots, slotHeader)
  return section
}

export { inferDateKeyFromText }

export function preferredWallClockFromText(
  text: string,
  dateKey: string,
  _now: WallClockParts,
): string | null {
  const clock = parseTimeFromText(text)
  if (!clock) return null
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const [y, m, d] = dateKey.split('-').map(Number)
  return `${y}-${pad2(m)}-${pad2(d)}T${pad2(clock.hour)}:${pad2(clock.minute)}:00`
}

export { timeToMinutes }
