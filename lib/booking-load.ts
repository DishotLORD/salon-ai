import type { SupabaseClient } from '@supabase/supabase-js'

import { parseActivityResourceRow, type ActivityResource } from '@/lib/activity-resources'
import type { ExistingBooking } from '@/lib/booking-availability'
import { logAvailabilityDebug } from '@/lib/booking-availability'
import { parseBookingSettings, type BookingSettings } from '@/lib/booking-settings'
import {
  isTimezoneSchemaError,
  resolveBusinessTimezone,
  type CanadianBusinessTimezone,
} from '@/lib/business-timezone'
import {
  parseDiningZoneRow,
  type DiningZone,
} from '@/lib/dining-zones'
import {
  addDaysToDateKey,
  formatWallClock,
  getVenueNowParts,
  scheduledAtToWallClock,
  wallClockDateKey,
  venueBoundaryUtcIso,
} from '@/lib/booking-wall-clock'
import { parseOperatingHours, type OperatingHours } from '@/lib/operating-hours'

export type BusinessBookingContext = {
  operatingHours: OperatingHours
  bookingSettings: BookingSettings
  existingBookings: ExistingBooking[]
  zones: DiningZone[]
  activities: ActivityResource[]
  /** Resolved Canadian IANA zone (null DB → America/Edmonton). */
  timezone: CanadianBusinessTimezone
}

/** Load hours, settings, zones, timezone, and upcoming appointments for availability checks. */
export async function loadBusinessBookingContext(
  supabase: SupabaseClient,
  businessId: string,
  lookaheadDays = 14,
): Promise<BusinessBookingContext> {
  let biz: Record<string, unknown> | null = null
  {
    const withTz = await supabase
      .from('businesses')
      .select('operating_hours, booking_settings, timezone')
      .eq('id', businessId)
      .maybeSingle()
    if (withTz.error && isTimezoneSchemaError(withTz.error.message)) {
      const fallback = await supabase
        .from('businesses')
        .select('operating_hours, booking_settings')
        .eq('id', businessId)
        .maybeSingle()
      biz = (fallback.data as Record<string, unknown> | null) ?? null
    } else {
      biz = (withTz.data as Record<string, unknown> | null) ?? null
    }
  }

  const timezone = resolveBusinessTimezone(
    biz && typeof (biz as { timezone?: unknown }).timezone === 'string'
      ? String((biz as { timezone: string }).timezone)
      : null,
  )
  const operatingHours = parseOperatingHours(biz?.operating_hours)
  const bookingSettings = parseBookingSettings(biz?.booking_settings)

  const { data: zoneRows } = await supabase
    .from('dining_zones')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order', { ascending: true })

  // Never invent seating capacity. Zones exist only after the owner saves them
  // (onboarding or Settings). Empty list → booking readiness fails upstream.
  const zones: DiningZone[] = (zoneRows ?? []).map((r) =>
    parseDiningZoneRow(r as Record<string, unknown>),
  )

  const now = getVenueNowParts(timezone)
  const todayKey = wallClockDateKey(now)
  const fromKey = addDaysToDateKey(todayKey, -1) + 'T00:00:00'
  const toKey = addDaysToDateKey(todayKey, lookaheadDays) + 'T23:59:59'

  const fromIso = venueBoundaryUtcIso(fromKey, timezone)
  const toIso = venueBoundaryUtcIso(toKey, timezone)

  // Activities are optional: a venue with no pool tables simply has none, and
  // the table is only present once migration 019 has run, so a failed read must
  // not take the whole booking context down with it.
  const { data: activityRows } = await supabase
    .from('activity_resources')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order', { ascending: true })

  const activities: ActivityResource[] = (activityRows ?? []).map((r) =>
    parseActivityResourceRow(r as Record<string, unknown>),
  )

  const { data: rows } = await supabase
    .from('appointments')
    .select('id, scheduled_at, status, duration_minutes, zone_id, party_size, activity_id')
    .eq('business_id', businessId)
    .gte('scheduled_at', fromIso)
    .lte('scheduled_at', toIso)

  const existingBookings: ExistingBooking[] = (rows ?? []).map((r) => {
    const row = r as Record<string, unknown>
    const raw = String(row.scheduled_at ?? '')
    const wallClock = scheduledAtToWallClock(raw, timezone) ?? raw
    return {
      id: row.id != null ? String(row.id) : undefined,
      scheduled_at: wallClock,
      status: row.status != null ? String(row.status) : null,
      duration_minutes:
        row.duration_minutes != null ? Number(row.duration_minutes) : null,
      zone_id: row.zone_id != null ? String(row.zone_id) : null,
      party_size: row.party_size != null ? Number(row.party_size) : null,
      activity_id: row.activity_id != null ? String(row.activity_id) : null,
    }
  })

  logAvailabilityDebug('load_context', {
    businessId,
    timezone,
    venueNow: formatWallClock(now),
    queryRangeVenue: { from: fromKey, to: toKey },
    queryRangeUtc: { from: fromIso, to: toIso },
    rowCount: existingBookings.length,
    bookings: existingBookings.map((b) => ({
      id: b.id,
      wallClock: b.scheduled_at,
      status: b.status,
    })),
  })

  return { operatingHours, bookingSettings, existingBookings, zones, activities, timezone }
}
