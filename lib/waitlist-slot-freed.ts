/**
 * "A table just came back — is anyone waiting for it?"
 *
 * Two things free a table from the dashboard, and only one of them used to ask.
 * Marking a booking Cancelled or No-show called /api/waitlist/slot-freed;
 * deleting the booking outright did not, even though deletion frees exactly the
 * same capacity. A guest the concierge had promised to call back sat in the
 * queue while their table stood empty.
 *
 * The two paths cannot send the same request. A cancelled booking still exists,
 * so the server can look it up by id and see for itself that it is cancelled. A
 * deleted one is gone by the time there is anything to report, so the caller has
 * to carry the context it captured before deleting.
 *
 * Import-free so it can be unit-tested directly.
 */

/** Statuses that hand a table back without removing the booking. */
export const SLOT_FREEING_STATUSES = ['cancelled', 'canceled', 'no-show'] as const

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export function statusFreesATable(status: string | null | undefined): boolean {
  if (typeof status !== 'string') return false
  const normalized = status.trim().toLowerCase()
  return (SLOT_FREEING_STATUSES as readonly string[]).includes(normalized)
}

/** The server resolves the booking itself. */
export type SlotFreedByAppointment = { appointment_id: string }

/**
 * The booking no longer exists, so the caller states which venue and which of
 * its days opened up. The server still re-checks that a table is genuinely
 * available before promising one.
 */
export type SlotFreedByDeletion = { business_id: string; date_key: string }

export type SlotFreedRequest = SlotFreedByAppointment | SlotFreedByDeletion

/**
 * Request for a status change, or null when this status frees nothing — which
 * is what keeps "Seated" or "Confirmed" from mailing the queue.
 */
export function slotFreedRequestForStatusChange(
  appointmentId: string | null | undefined,
  status: string | null | undefined,
): SlotFreedByAppointment | null {
  if (typeof appointmentId !== 'string' || !appointmentId.trim()) return null
  if (!statusFreesATable(status)) return null
  return { appointment_id: appointmentId.trim() }
}

/**
 * Request for a deletion. Null when the context was not captured — better no
 * notification than one aimed at the wrong venue or the wrong day.
 *
 * `dateKey` is the venue's own calendar day for the booking, not the browser's:
 * a 12:30 AM reservation belongs to the day the venue calls it, and the queue is
 * keyed that way.
 */
export function slotFreedRequestForDeletion(
  businessId: string | null | undefined,
  dateKey: string | null | undefined,
): SlotFreedByDeletion | null {
  if (typeof businessId !== 'string' || !businessId.trim()) return null
  if (typeof dateKey !== 'string' || !DATE_KEY_RE.test(dateKey.trim())) return null
  return { business_id: businessId.trim(), date_key: dateKey.trim() }
}

export function isDeletionRequest(request: SlotFreedRequest): request is SlotFreedByDeletion {
  return 'business_id' in request
}
