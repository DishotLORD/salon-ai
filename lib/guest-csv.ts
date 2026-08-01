import type { CrmCustomer } from '@/lib/crm-customer'
import type { Reservation } from '@/components/reservation-card'
import { calgaryCalendarDayKey, calgaryTimeHmFromDate } from '@/lib/booking-wall-clock'
import { parseGuestNotes } from '@/lib/guest-preferences'

/**
 * The guest list and the booking list, as files a restaurant can actually keep.
 *
 * Their guests and reservations are their data — the Terms say so — and until
 * now the only way out was to read the screen. This is also the answer to "we're
 * trying another system" and to a GDPR/PIPEDA access request: a spreadsheet, in
 * one click, no support ticket.
 */

const COLUMNS = [
  'Name',
  'Phone',
  'Email',
  'First seen',
  'Bookings',
  'Last booking',
  'Average party size',
  'Tags',
  'Allergies',
  'Preferences',
  'Occasions',
  'Notes',
] as const

/**
 * Escape one field for CSV. Excel and Sheets both read a field as a formula when
 * it opens with `=`, `+`, `-` or `@`, so a guest whose note begins that way could
 * make a spreadsheet run something on open. Prefixing an apostrophe is the
 * standard defence, and it is invisible once the sheet is loaded.
 */
function csvField(value: string | number | null | undefined): string {
  if (value == null) return ''
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  // Doubling the quotes is how CSV escapes a quote inside a quoted field.
  return `"${text.replace(/"/g, '""')}"`
}

/** ISO date only — a spreadsheet reads 2026-07-30 as a date, "Jul 30" as text. */
function isoDate(raw: string | null): string {
  if (!raw) return ''
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

export function guestsToCsv(guests: CrmCustomer[]): string {
  const rows = guests.map((guest) =>
    [
      csvField(guest.isUnknownGuest ? 'Unknown guest' : guest.name),
      // The table shows an em dash for "nothing on file"; a spreadsheet wants a
      // blank cell, which is what filters and pivots treat as missing.
      csvField(guest.phone === '—' ? '' : guest.phone),
      csvField(guest.email),
      csvField(isoDate(guest.joinedRaw)),
      csvField(guest.bookingCount),
      csvField(isoDate(guest.lastBookingRaw)),
      csvField(guest.avgPartySize != null ? guest.avgPartySize.toFixed(1) : ''),
      csvField(guest.tags.join(', ')),
      /*
       * customers.notes is stored as a JSON blob once the concierge has learned
       * anything about a guest. Exporting it raw put
       * `{"allergies":"…","preferences":"…"}` into a spreadsheet cell — the
       * internal format, in a file whose whole purpose is being read by a person.
       * Split into columns the owner can actually sort and filter on.
       */
      ...(() => {
        const prefs = parseGuestNotes(guest.notes)
        return [
          csvField(prefs.allergies ?? ''),
          csvField(prefs.preferences ?? ''),
          csvField(prefs.occasions ?? ''),
          // Free text the owner typed; often multi-line, which the quoting keeps
          // inside one cell.
          csvField(prefs.ownerNotes ?? ''),
        ]
      })(),
    ].join(','),
  )

  /*
   * CRLF and a UTF-8 BOM, because the most likely thing to open this is Excel on
   * Windows — which without the BOM renders every accented name as mojibake.
   */
  return `﻿${[COLUMNS.map(csvField).join(','), ...rows].join('\r\n')}\r\n`
}

/** `oceancore-guests-2026-07-30.csv` */
export function guestCsvFilename(now = new Date()): string {
  return `oceancore-guests-${now.toISOString().slice(0, 10)}.csv`
}

const RESERVATION_COLUMNS = [
  'Date',
  'Time',
  'Guest',
  'Party size',
  'Seating',
  'Table',
  'Status',
  'Special requests',
] as const

export function reservationsToCsv(reservations: Reservation[]): string {
  // Chronological, which is how anyone reads a booking sheet — the dashboard's
  // own sort is for working a shift, not for filing.
  const ordered = [...reservations].sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
  )

  const rows = ordered.map((r) =>
    [
      // The venue's own calendar day and clock time, not the reader's — a
      // reservation at 7pm is at 7pm regardless of where the spreadsheet opens.
      csvField(calgaryCalendarDayKey(r.scheduledAt)),
      csvField(calgaryTimeHmFromDate(r.scheduledAt)),
      csvField(r.guestName),
      csvField(r.partySize ?? ''),
      csvField(r.activityName ?? r.zoneName ?? ''),
      // The table shows an em dash for "not assigned"; a spreadsheet wants an
      // empty cell, which is what a filter treats as missing.
      csvField(r.tableNumber === '—' ? '' : r.tableNumber),
      csvField(r.status),
      csvField(r.specialRequests),
    ].join(','),
  )

  return `﻿${[RESERVATION_COLUMNS.map(csvField).join(','), ...rows].join('\r\n')}\r\n`
}

/** `oceancore-reservations-2026-07-30.csv` */
export function reservationCsvFilename(now = new Date()): string {
  return `oceancore-reservations-${now.toISOString().slice(0, 10)}.csv`
}
