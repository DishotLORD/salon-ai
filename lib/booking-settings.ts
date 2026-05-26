import { BOOKING_SLOT_MINUTES } from '@/lib/operating-hours'

export type BookingSettings = {
  default_duration_minutes: number
  max_concurrent_reservations: number
  slot_interval_minutes: number
}

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  default_duration_minutes: 90,
  max_concurrent_reservations: 12,
  slot_interval_minutes: BOOKING_SLOT_MINUTES,
}

export function parseBookingSettings(raw: unknown): BookingSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_BOOKING_SETTINGS }
  }
  const row = raw as Record<string, unknown>
  const duration =
    typeof row.default_duration_minutes === 'number' && row.default_duration_minutes >= 15
      ? Math.round(row.default_duration_minutes)
      : DEFAULT_BOOKING_SETTINGS.default_duration_minutes
  const maxConcurrent =
    typeof row.max_concurrent_reservations === 'number' && row.max_concurrent_reservations >= 1
      ? Math.round(row.max_concurrent_reservations)
      : DEFAULT_BOOKING_SETTINGS.max_concurrent_reservations
  const interval =
    typeof row.slot_interval_minutes === 'number' && row.slot_interval_minutes >= 5
      ? Math.round(row.slot_interval_minutes)
      : DEFAULT_BOOKING_SETTINGS.slot_interval_minutes
  return {
    default_duration_minutes: duration,
    max_concurrent_reservations: maxConcurrent,
    slot_interval_minutes: interval,
  }
}
