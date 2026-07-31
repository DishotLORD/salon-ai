/**
 * One reading of `appointments.status`, for everything that has to ask what a
 * booking means.
 *
 * There were five: the availability engine, the analytics report, the CRM guest
 * metrics, the guest detail panel and the bookings table each had their own
 * `isCancelled` / `isNoShow`, and they had already drifted — only the
 * availability engine recognised `no_show` with an underscore. Nothing writes
 * that spelling today, but the column is a bare `text not null default
 * 'pending'` with no CHECK constraint, so a hand-edited row in the Supabase
 * dashboard, a data import, or a future integration can put any string there.
 * The day one did, analytics would have counted a no-show as a served cover and
 * quietly inflated revenue.
 *
 * Unknown statuses count as active on purpose. A booking we cannot classify is
 * one the restaurant should still see on the floor plan; the cost of showing a
 * table that turns out to be free is a wasted glance, and the cost of hiding one
 * that is taken is a double-booked guest.
 */

export type AppointmentStatusKind =
  | 'pending'
  | 'confirmed'
  | 'seated'
  | 'completed'
  | 'cancelled'
  | 'no-show'

const CANCELLED = new Set(['cancelled', 'canceled'])
const NO_SHOW = new Set(['no-show', 'noshow', 'no_show'])
const SEATED = new Set(['seated'])
const COMPLETED = new Set(['completed', 'complete', 'finished'])
const CONFIRMED = new Set(['confirmed'])

function clean(status: string | null | undefined): string {
  return (status ?? '').trim().toLowerCase()
}

export function isCancelledStatus(status: string | null | undefined): boolean {
  return CANCELLED.has(clean(status))
}

export function isNoShowStatus(status: string | null | undefined): boolean {
  return NO_SHOW.has(clean(status))
}

export function isCompletedStatus(status: string | null | undefined): boolean {
  return COMPLETED.has(clean(status))
}

/**
 * The guest never sat down, so this booking is not a cover, not revenue, and not
 * a visit in anyone's history.
 */
export function isVoidStatus(status: string | null | undefined): boolean {
  const s = clean(status)
  return CANCELLED.has(s) || NO_SHOW.has(s)
}

/** Still holding a table: anything not cancelled, no-showed or already finished. */
export function holdsATable(status: string | null | undefined): boolean {
  const s = clean(status)
  return !CANCELLED.has(s) && !NO_SHOW.has(s) && !COMPLETED.has(s)
}

/** Collapse any spelling to the six the product actually reasons about. */
export function toStatusKind(status: string | null | undefined): AppointmentStatusKind {
  const s = clean(status)
  if (CONFIRMED.has(s)) return 'confirmed'
  if (SEATED.has(s)) return 'seated'
  if (COMPLETED.has(s)) return 'completed'
  if (CANCELLED.has(s)) return 'cancelled'
  if (NO_SHOW.has(s)) return 'no-show'
  return 'pending'
}
