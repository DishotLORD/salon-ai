import type { SupabaseClient } from '@supabase/supabase-js'

import type { ExistingBooking } from '@/lib/booking-availability'
import { parseBookingSettings, type BookingSettings } from '@/lib/booking-settings'
import { getCalgaryNowParts, wallClockDateKey, wallClockFromDate } from '@/lib/booking-wall-clock'
import { parseOperatingHours, type OperatingHours } from '@/lib/operating-hours'

export type BusinessBookingContext = {
  operatingHours: OperatingHours
  bookingSettings: BookingSettings
  existingBookings: ExistingBooking[]
}

/** Load hours, settings, and upcoming appointments for availability checks. */
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

  const now = getCalgaryNowParts()
  const fromDate = new Date(now.year, now.month - 1, now.day)
  fromDate.setDate(fromDate.getDate() - 1)
  const fromKey = wallClockDateKey(wallClockFromDate(fromDate))

  const toDate = new Date(now.year, now.month - 1, now.day + lookaheadDays)
  const toKey = wallClockDateKey(wallClockFromDate(toDate)) + 'T23:59:59'

  const { data: rows } = await supabase
    .from('appointments')
    .select('id, scheduled_at, status, duration_minutes')
    .eq('business_id', businessId)
    .gte('scheduled_at', fromKey)

  const existingBookings: ExistingBooking[] = (rows ?? [])
    .filter((r) => {
      const row = r as Record<string, unknown>
      return String(row.scheduled_at ?? '') <= toKey
    })
    .map((r) => {
      const row = r as Record<string, unknown>
      return {
        id: row.id != null ? String(row.id) : undefined,
        scheduled_at: String(row.scheduled_at),
        status: row.status != null ? String(row.status) : null,
        duration_minutes:
          row.duration_minutes != null ? Number(row.duration_minutes) : null,
      }
    })

  return { operatingHours, bookingSettings, existingBookings }
}
