import { addDaysToDateKey } from './booking-wall-clock'

export type BookableWindowRefusal = {
  ok: false
  error: 'past_date' | 'beyond_booking_window'
  message: string
  /** Present when error is beyond_booking_window — configured restaurant setting. */
  max_advance_days?: number
  /** Present when error is beyond_booking_window — latest YYYY-MM-DD guests may book. */
  latest_bookable_date?: string
  /** Present when error is past_date. */
  today?: string
}

/** Latest YYYY-MM-DD guests may book given today's venue date and max_advance_days. */
export function latestBookableDateKey(
  todayKey: string,
  maxAdvanceDays: number,
): string {
  return addDaysToDateKey(todayKey, maxAdvanceDays)
}

/**
 * Server-side advance-booking / past-date gate. The LLM must never invent a
 * horizon — only this check (and the restaurant's booking_settings) decides.
 */
export function evaluateBookableWindow(
  dateKey: string,
  todayKey: string,
  maxAdvanceDays: number,
): BookableWindowRefusal | null {
  if (dateKey < todayKey) {
    return {
      ok: false,
      error: 'past_date',
      today: todayKey,
      message: `That date is in the past — today is ${todayKey}. Gently point this out and ask the guest for a future date. Do not offer alternatives for past dates.`,
    }
  }

  const horizonKey = latestBookableDateKey(todayKey, maxAdvanceDays)
  if (dateKey > horizonKey) {
    return {
      ok: false,
      error: 'beyond_booking_window',
      max_advance_days: maxAdvanceDays,
      latest_bookable_date: horizonKey,
      message: `Reservations open up to ${maxAdvanceDays} days ahead — the latest bookable date is ${horizonKey}. Relay exactly these numbers (do not convert to months or years yourself) and invite the guest to book within that window.`,
    }
  }

  return null
}

/**
 * Injected into the chat system prompt so the model knows the restaurant's real
 * configured horizon and never invents a different one (e.g. "90 days").
 */
export function bookingHorizonPromptSection(
  todayKey: string,
  maxAdvanceDays: number,
): string {
  const horizonKey = latestBookableDateKey(todayKey, maxAdvanceDays)
  return (
    `\nBOOKING HORIZON (configured for this restaurant — sole source of truth): ` +
    `guests may book up to ${maxAdvanceDays} days ahead; latest bookable date is ${horizonKey}. ` +
    `Never invent a different horizon (including "90 days", "3 months", or any other number). ` +
    `Do not refuse a date because it seems far ahead — call check_availability, create_reservation, ` +
    `or reschedule_reservation and let the system decide. Only when a tool returns beyond_booking_window ` +
    `may you refuse, and then relay that tool's exact day count and latest date.`
  )
}
