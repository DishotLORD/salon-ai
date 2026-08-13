/**
 * Shared write-path wall-clock gate for create / reschedule.
 *
 * Callers MUST run this after date-window checks and slot snapping, and BEFORE
 * any availability lookup or appointment insert/update. Spring-forward gaps
 * therefore surface as DST_GAP_MESSAGE instead of generic not_available.
 */

import {
  resolveWallClockToUtc,
  snapWallClockToSlotInterval,
  type WallClockResolution,
} from '@/lib/booking-wall-clock'
import type { CanadianBusinessTimezone } from '@/lib/business-timezone'

export type PreparedReservationWriteWallClock = {
  /** Snapped venue wall-clock digits used for availability + storage. */
  wallClock: string
  /** Successful UTC resolution — reuse this; do not convert again. */
  resolved: Extract<WallClockResolution, { ok: true }>
}

export type PrepareReservationWriteWallClockResult =
  | { ok: true; prepared: PreparedReservationWriteWallClock }
  | {
      ok: false
      error: 'malformed' | 'nonexistent_local_time'
      message: string
    }

/** The failure half of a preparation, reused so the two cannot drift apart. */
type PrepareReservationWriteWallClockFailure = Extract<
  PrepareReservationWriteWallClockResult,
  { ok: false }
>

/**
 * What `afterResolvedWriteWallClock` can actually return.
 *
 * Success always carries `next`. Reusing
 * `PrepareReservationWriteWallClockResult` here would widen the success side to
 * include that type's own `{ ok: true; prepared }` member — a result the
 * implementation cannot produce, since the only success path builds `next` from
 * the callback. Callers then could not read `next` after checking `ok`, and had
 * to test for the property to narrow past a case that never happens.
 */
export type AfterResolvedWriteWallClockResult<T> =
  | PrepareReservationWriteWallClockFailure
  | {
      ok: true
      prepared: PreparedReservationWriteWallClock
      next: T
    }

/**
 * Snap to the booking grid, then resolve venue-local digits to a UTC instant.
 */
export function prepareReservationWriteWallClock(
  wallClock: string,
  timeZone: CanadianBusinessTimezone,
  slotIntervalMinutes: number,
): PrepareReservationWriteWallClockResult {
  const snapped =
    snapWallClockToSlotInterval(wallClock, slotIntervalMinutes) ?? wallClock
  const resolved = resolveWallClockToUtc(snapped, timeZone)
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.reason,
      message: resolved.message,
    }
  }
  return {
    ok: true,
    prepared: { wallClock: snapped, resolved },
  }
}

/**
 * Create/reschedule write ordering: resolve UTC first, then run `afterResolved`
 * (availability, insert, etc.). Spring-gap returns before `afterResolved` runs.
 *
 * Used by deterministic tests to prove availability is not consulted on a gap,
 * and by documenting the contract the chat tool handlers must follow.
 */
export function afterResolvedWriteWallClock<T>(
  wallClock: string,
  timeZone: CanadianBusinessTimezone,
  slotIntervalMinutes: number,
  afterResolved: (prepared: PreparedReservationWriteWallClock) => T,
): AfterResolvedWriteWallClockResult<T> {
  const prepared = prepareReservationWriteWallClock(
    wallClock,
    timeZone,
    slotIntervalMinutes,
  )
  if (!prepared.ok) return prepared
  return {
    ok: true,
    prepared: prepared.prepared,
    next: afterResolved(prepared.prepared),
  }
}
