import type { SupabaseClient } from '@supabase/supabase-js'

import type { ExistingBooking } from '@/lib/booking-availability'
import { logAvailabilityDebug } from '@/lib/booking-availability'
import { parseBookingSettings, type BookingSettings } from '@/lib/booking-settings'
import {
  defaultMainDiningZone,
  parseDiningZoneRow,
  type DiningZone,
} from '@/lib/dining-zones'
import {
  addDaysToDateKey,
  formatWallClock,
  getCalgaryNowParts,
  scheduledAtToWallClock,
  wallClockDateKey,
  wallClockInCalgaryToUtcDate,
} from '@/lib/booking-wall-clock'
import { parseOperatingHours, type OperatingHours } from '@/lib/operating-hours'

export type BusinessBookingContext = {
  operatingHours: OperatingHours
  bookingSettings: BookingSettings
  existingBookings: ExistingBooking[]
  zones: DiningZone[]
}

/** Load hours, settings, zones, and upcoming appointments for availability checks. */
export async function loadBusinessBookingContext(
  supabase: SupabaseClient,
  businessId: string,
  lookaheadDays = 14,
): Promise<BusinessBookingContext> {
  const { data: biz } = await supabase
    .from('businesses')
    .select('operating_hours, booking_settings')
    .eq('id', businessId)
    .maybeSingle()

  const operatingHours = parseOperatingHours(biz?.operating_hours)
  const bookingSettings = parseBookingSettings(biz?.booking_settings)

  const { data: zoneRows } = await supabase
    .from('dining_zones')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order', { ascending: true })

  let zones: DiningZone[] = (zoneRows ?? []).map((r) =>
    parseDiningZoneRow(r as Record<string, unknown>),
  )

  if (zones.length === 0) {
    const seed = defaultMainDiningZone(businessId, bookingSettings)
    const { data: inserted } = await supabase
      .from('dining_zones')
      .insert({
        business_id: seed.business_id,
        name: seed.name,
        slug: seed.slug,
        max_concurrent_parties: seed.max_concurrent_parties,
        min_party_size: seed.min_party_size,
        max_party_size: seed.max_party_size,
        turnover_minutes: seed.turnover_minutes,
        is_active: seed.is_active,
        sort_order: seed.sort_order,
      })
      .select('*')
      .maybeSingle()

    if (inserted) {
      zones = [parseDiningZoneRow(inserted as Record<string, unknown>)]
    }
  }

  const now = getCalgaryNowParts()
  const todayKey = wallClockDateKey(now)
  const fromKey = addDaysToDateKey(todayKey, -1) + 'T00:00:00'
  const toKey = addDaysToDateKey(todayKey, lookaheadDays) + 'T23:59:59'

  const fromIso = wallClockInCalgaryToUtcDate(fromKey).toISOString()
  const toIso = wallClockInCalgaryToUtcDate(toKey).toISOString()

  const { data: rows } = await supabase
    .from('appointments')
    .select('id, scheduled_at, status, duration_minutes, zone_id, party_size')
    .eq('business_id', businessId)
    .gte('scheduled_at', fromIso)
    .lte('scheduled_at', toIso)

  const existingBookings: ExistingBooking[] = (rows ?? []).map((r) => {
    const row = r as Record<string, unknown>
    const raw = String(row.scheduled_at ?? '')
    const wallClock = scheduledAtToWallClock(raw) ?? raw
    return {
      id: row.id != null ? String(row.id) : undefined,
      scheduled_at: wallClock,
      status: row.status != null ? String(row.status) : null,
      duration_minutes:
        row.duration_minutes != null ? Number(row.duration_minutes) : null,
      zone_id: row.zone_id != null ? String(row.zone_id) : null,
      party_size: row.party_size != null ? Number(row.party_size) : null,
    }
  })

  logAvailabilityDebug('load_context', {
    businessId,
    calgaryNow: formatWallClock(now),
    queryRangeCalgary: { from: fromKey, to: toKey },
    queryRangeUtc: { from: fromIso, to: toIso },
    rowCount: existingBookings.length,
    bookings: existingBookings.map((b) => ({
      id: b.id,
      wallClock: b.scheduled_at,
      status: b.status,
    })),
  })

  return { operatingHours, bookingSettings, existingBookings, zones }
}
