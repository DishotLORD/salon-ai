import { BOOKING_SLOT_MINUTES } from '@/lib/operating-hours'

export type BookingSettings = {
  default_duration_minutes: number
  max_concurrent_reservations: number
  slot_interval_minutes: number
  /** Minimum notice before a reservation start (minutes). 0 = allow next slot. */
  min_notice_minutes: number
  /** How far ahead guests may book (days). */
  max_advance_days: number
  /** Require a phone number or email from the guest before the bot may book. */
  require_contact_before_booking: boolean
}

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  default_duration_minutes: 90,
  max_concurrent_reservations: 12,
  slot_interval_minutes: BOOKING_SLOT_MINUTES,
  min_notice_minutes: 0,
  max_advance_days: 180,
  require_contact_before_booking: true,
}

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function parseBookingSettings(raw: unknown): BookingSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_BOOKING_SETTINGS }
  }
  const row = raw as Record<string, unknown>
  return {
    default_duration_minutes:
      typeof row.default_duration_minutes === 'number' && row.default_duration_minutes >= 15
        ? Math.round(row.default_duration_minutes)
        : DEFAULT_BOOKING_SETTINGS.default_duration_minutes,
    max_concurrent_reservations:
      typeof row.max_concurrent_reservations === 'number' && row.max_concurrent_reservations >= 1
        ? Math.round(row.max_concurrent_reservations)
        : DEFAULT_BOOKING_SETTINGS.max_concurrent_reservations,
    slot_interval_minutes:
      typeof row.slot_interval_minutes === 'number' && row.slot_interval_minutes >= 5
        ? Math.round(row.slot_interval_minutes)
        : DEFAULT_BOOKING_SETTINGS.slot_interval_minutes,
    min_notice_minutes: clampInt(
      row.min_notice_minutes,
      DEFAULT_BOOKING_SETTINGS.min_notice_minutes,
      0,
      24 * 60,
    ),
    max_advance_days: clampInt(
      row.max_advance_days,
      DEFAULT_BOOKING_SETTINGS.max_advance_days,
      1,
      365,
    ),
    require_contact_before_booking:
      typeof row.require_contact_before_booking === 'boolean'
        ? row.require_contact_before_booking
        : DEFAULT_BOOKING_SETTINGS.require_contact_before_booking,
  }
}
