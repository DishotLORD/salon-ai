/**
 * Bookable activities: pool tables, ping-pong tables, courts, lanes.
 *
 * The capacity rule is deliberately different from dining zones. A zone holds
 * many parties at once and is checked against a cover count; one activity
 * resource is one physical thing, so it is either free or taken for the whole
 * session. That makes availability an interval-overlap question per resource,
 * with no party-size or seating rules involved.
 */

import type { ExistingBooking } from '@/lib/booking-availability'
import { parseWallClock, wallClockToMinutesOfDay } from '@/lib/booking-wall-clock'

/** Minutes past midnight for a "YYYY-MM-DDTHH:mm" wall clock, or null if unparseable. */
function minutesOfDay(wallClock: string): number | null {
  const parts = parseWallClock(wallClock)
  return parts ? wallClockToMinutesOfDay(parts) : null
}

export type ActivityType = 'pool' | 'tennis' | 'billiard' | 'other'

export type ActivityResource = {
  id: string
  business_id: string
  name: string
  slug: string
  type: ActivityType
  duration_minutes: number
  is_active: boolean
  sort_order: number
}

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  pool: 'Pool Table',
  tennis: 'Tennis / Ping-Pong',
  billiard: 'Billiard',
  other: 'Other',
}

/** Words a guest might use for each type, for matching free-text requests. */
const TYPE_SYNONYMS: Record<ActivityType, string[]> = {
  pool: ['pool', 'pool table', 'бильярд', 'пул'],
  billiard: ['billiard', 'billiards', 'snooker', 'бильярд'],
  tennis: ['tennis', 'ping pong', 'ping-pong', 'pingpong', 'table tennis', 'теннис', 'пинг понг', 'пинг-понг', 'настольный теннис'],
  other: [],
}

export function isActivityType(v: unknown): v is ActivityType {
  return v === 'pool' || v === 'tennis' || v === 'billiard' || v === 'other'
}

/**
 * Rows added in the settings panel carry a short generated id until they are
 * saved; a persisted row carries a uuid. This is how the save path tells an
 * insert from an update.
 */
export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export function slugifyActivityName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `activity-${Math.random().toString(36).slice(2, 7)}`
}

export function parseActivityResourceRow(raw: Record<string, unknown>): ActivityResource {
  const type = String(raw.type ?? 'other')
  return {
    id: String(raw.id),
    business_id: String(raw.business_id ?? ''),
    name: String(raw.name ?? 'Activity'),
    slug: String(raw.slug ?? 'activity'),
    type: isActivityType(type) ? type : 'other',
    duration_minutes: Math.max(15, Number(raw.duration_minutes) || 60),
    is_active: raw.is_active !== false,
    sort_order: Number(raw.sort_order) || 0,
  }
}

export function activeActivities(resources: ActivityResource[]): ActivityResource[] {
  return resources.filter((r) => r.is_active)
}

/** "Pool Table 1, Pool Table 2 and Tennis Table" */
export function formatActivityNamesList(resources: ActivityResource[]): string {
  const names = resources.map((r) => r.name).filter(Boolean)
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Which activity a guest means, from free text.
 *
 * Matches an exact resource name first, so "Pool Table 2" picks that table
 * rather than any pool table; falls back to the type, which is the common case
 * ("can we get a pool table at 8?") and leaves the choice of which unit to
 * `firstFreeActivity`.
 */
export function matchActivityRequest(
  text: string,
  resources: ActivityResource[],
): { resource: ActivityResource | null; type: ActivityType | null } {
  const t = text.toLowerCase()
  const active = activeActivities(resources)

  // Longest name first so "Pool Table 12" is not shadowed by "Pool Table 1".
  const byName = [...active].sort((a, b) => b.name.length - a.name.length)
  for (const r of byName) {
    const n = r.name.toLowerCase().trim()
    if (n && t.includes(n)) return { resource: r, type: r.type }
  }

  for (const [type, words] of Object.entries(TYPE_SYNONYMS) as [ActivityType, string[]][]) {
    if (words.some((w) => w && t.includes(w))) {
      if (active.some((r) => r.type === type)) return { resource: null, type }
    }
  }
  return { resource: null, type: null }
}

/** True when the guest's message is asking about an activity at all. */
export function mentionsActivity(text: string, resources: ActivityResource[]): boolean {
  const m = matchActivityRequest(text, resources)
  return m.resource != null || m.type != null
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** Cancelled and no-show bookings free the resource back up. */
function blocksResource(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase()
  return s !== 'cancelled' && s !== 'canceled' && s !== 'no-show' && s !== 'noshow'
}

export type ActivityBooking = ExistingBooking & { activity_id?: string | null }

/**
 * Is this resource free for a session starting at `wallClock`?
 *
 * `ignoreBookingId` lets a reschedule ignore the row it is moving, which would
 * otherwise collide with itself.
 */
export function isActivityFree(
  resource: ActivityResource,
  wallClock: string,
  existing: ActivityBooking[],
  ignoreBookingId?: string | null,
): boolean {
  const dateKey = wallClock.slice(0, 10)
  const start = minutesOfDay(wallClock)
  // An unparseable time cannot be proven free, so treat it as taken rather than
  // handing out a double booking.
  if (start == null) return false
  const end = start + resource.duration_minutes

  for (const b of existing) {
    if (!b.activity_id || b.activity_id !== resource.id) continue
    if (ignoreBookingId && b.id === ignoreBookingId) continue
    if (!blocksResource(b.status)) continue
    if (b.scheduled_at.slice(0, 10) !== dateKey) continue
    const bStart = minutesOfDay(b.scheduled_at)
    if (bStart == null) continue
    const bEnd = bStart + (b.duration_minutes || resource.duration_minutes)
    if (overlaps(start, end, bStart, bEnd)) return false
  }
  return true
}

/**
 * First free unit matching the request, so a guest asking for "a pool table"
 * gets whichever one is open instead of being told the specific one they named
 * is taken.
 */
export function firstFreeActivity(
  resources: ActivityResource[],
  wallClock: string,
  existing: ActivityBooking[],
  filter?: { resourceId?: string | null; type?: ActivityType | null },
): ActivityResource | null {
  let pool = activeActivities(resources)
  if (filter?.resourceId) pool = pool.filter((r) => r.id === filter.resourceId)
  else if (filter?.type) pool = pool.filter((r) => r.type === filter.type)

  const ordered = [...pool].sort((a, b) => a.sort_order - b.sort_order)
  return ordered.find((r) => isActivityFree(r, wallClock, existing)) ?? null
}

/** Every unit matching the request, split by whether it is free at that time. */
export function activityAvailabilityAt(
  resources: ActivityResource[],
  wallClock: string,
  existing: ActivityBooking[],
  filter?: { resourceId?: string | null; type?: ActivityType | null },
): { free: ActivityResource[]; taken: ActivityResource[] } {
  let pool = activeActivities(resources)
  if (filter?.resourceId) pool = pool.filter((r) => r.id === filter.resourceId)
  else if (filter?.type) pool = pool.filter((r) => r.type === filter.type)

  const free: ActivityResource[] = []
  const taken: ActivityResource[] = []
  for (const r of [...pool].sort((a, b) => a.sort_order - b.sort_order)) {
    if (isActivityFree(r, wallClock, existing)) free.push(r)
    else taken.push(r)
  }
  return { free, taken }
}

/**
 * Session start times on the same day that still have a free unit, so the bot
 * can offer alternatives when the requested time is taken. Steps by
 * `stepMinutes` between the venue's open and close for that day.
 */
export function freeActivityTimes(
  resources: ActivityResource[],
  dateKey: string,
  openMinutes: number,
  closeMinutes: number,
  existing: ActivityBooking[],
  filter?: { resourceId?: string | null; type?: ActivityType | null },
  stepMinutes = 30,
  limit = 6,
): string[] {
  const out: string[] = []
  for (let m = openMinutes; m + stepMinutes <= closeMinutes && out.length < limit; m += stepMinutes) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    const wall = `${dateKey}T${hh}:${mm}:00`
    if (firstFreeActivity(resources, wall, existing, filter)) out.push(wall)
  }
  return out
}
