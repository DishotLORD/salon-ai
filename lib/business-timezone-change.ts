import type { SupabaseClient } from '@supabase/supabase-js'

import { holdsATable } from '@/lib/appointment-status'
import type { CanadianBusinessTimezone } from '@/lib/business-timezone'

/**
 * Owner-facing copy when a timezone change would silently reinterpret live
 * future bookings / waitlist rows. We never rewrite scheduled_at, so changing
 * the zone while those exist would make wall-clock labels lie.
 */
export const TIMEZONE_CHANGE_BLOCKED_MESSAGE =
  'Timezone can’t be changed while this restaurant still has upcoming reservations or live waitlist guests. Existing bookings are tied to the current venue timezone — complete, cancel, or ask support to help first. Past bookings are fine to leave as-is.'

export type TimezoneChangeBlockers = {
  futureActiveAppointments: number
  liveWaitlistEntries: number
}

export type TimezoneChangeGate =
  | { ok: true }
  | { ok: false; message: string; blockers: TimezoneChangeBlockers }

/** Pure gate used by tests and by the settings save path. */
export function evaluateTimezoneChangeGate(
  blockers: TimezoneChangeBlockers,
): TimezoneChangeGate {
  if (blockers.futureActiveAppointments > 0 || blockers.liveWaitlistEntries > 0) {
    return {
      ok: false,
      message: TIMEZONE_CHANGE_BLOCKED_MESSAGE,
      blockers,
    }
  }
  return { ok: true }
}

/**
 * Count future active appointments and waiting/contacted waitlist rows.
 * Past appointments are ignored — they may keep their stored instants forever.
 */
export async function loadTimezoneChangeBlockers(
  supabase: SupabaseClient,
  businessId: string,
  nowIso: string = new Date().toISOString(),
): Promise<TimezoneChangeBlockers> {
  const { data: apptRows } = await supabase
    .from('appointments')
    .select('id, status, scheduled_at')
    .eq('business_id', businessId)
    .gte('scheduled_at', nowIso)

  let futureActiveAppointments = 0
  for (const row of apptRows ?? []) {
    const status = (row as { status?: string | null }).status
    if (holdsATable(status)) futureActiveAppointments += 1
  }

  const { count: waitCount } = await supabase
    .from('waitlist_entries')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .in('status', ['waiting', 'contacted'])

  return {
    futureActiveAppointments,
    liveWaitlistEntries: waitCount ?? 0,
  }
}

/**
 * Block a timezone change when the new value differs and live future work exists.
 * Same-zone saves (and first-time null → Edmonton default with no change of
 * meaning) are always allowed.
 */
export async function assertTimezoneChangeAllowed(
  supabase: SupabaseClient,
  params: {
    businessId: string
    currentTimezone: string | null | undefined
    nextTimezone: CanadianBusinessTimezone
  },
): Promise<TimezoneChangeGate> {
  if (params.currentTimezone === params.nextTimezone) {
    return { ok: true }
  }
  // First stored value for a legacy null row is still a "change" of the
  // persisted column, but runtime already used Edmonton — allow when the next
  // zone is Edmonton so Alberta venues can persist the default without friction.
  if (
    (params.currentTimezone == null || params.currentTimezone === '') &&
    params.nextTimezone === 'America/Edmonton'
  ) {
    return { ok: true }
  }

  const blockers = await loadTimezoneChangeBlockers(supabase, params.businessId)
  return evaluateTimezoneChangeGate(blockers)
}
