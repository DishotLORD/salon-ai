/**
 * When the desktop compact bookings table may offer Delete.
 *
 * Cancel and Confirm live on active rows. Delete is only for bookings that have
 * already been released (cancelled / no-show) — the same rule the card and the
 * older list use — so an owner can clear the row and the waitlist slot-freed
 * path behind deleteReservation becomes reachable from the main table.
 */

export function compactRowAllowsDelete(status: string | null | undefined): boolean {
  if (typeof status !== 'string') return false
  const normalized = status.trim().toLowerCase()
  return normalized === 'cancelled' || normalized === 'canceled' || normalized === 'no-show'
}

export const COMPACT_DELETE_CONFIRM_MESSAGE =
  'Delete this reservation permanently? This cannot be undone.'

/**
 * Gate a delete behind an explicit confirm. Returns whether the delete ran.
 * Import-free so the compact-table rule can be unit-tested without React.
 */
export function requestConfirmedDelete(
  id: string,
  deleteReservation: (id: string) => void | Promise<void>,
  confirm: (message: string) => boolean = (message) =>
    typeof window !== 'undefined' ? window.confirm(message) : false,
  message: string = COMPACT_DELETE_CONFIRM_MESSAGE,
): boolean {
  if (!id.trim()) return false
  if (!confirm(message)) return false
  void deleteReservation(id)
  return true
}
