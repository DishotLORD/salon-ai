import { parsePartySizeFromServiceName } from '@/lib/appointment-service-name'
import type { CrmCustomer, CrmCustomerBase } from '@/lib/crm-customer'
import { deriveGuestTags, formatGuestDisplayDate } from '@/lib/guest-display'

export type CrmAppointmentRow = {
  customer_id: string | null
  scheduled_at: string
  status: string | null
  service_name: string | null
}

export type CustomerBookingMetrics = {
  bookingCount: number
  lastBookingRaw: string | null
  avgPartySize: number | null
  hasNoShow: boolean
}

function isNoShowStatus(status: string | null | undefined): boolean {
  const s = (status ?? '').toLowerCase()
  return s === 'no-show' || s === 'noshow'
}

/** All appointments linked to a customer_id (any status). */
export function buildCustomerMetricsMap(
  appointments: CrmAppointmentRow[],
): Map<string, CustomerBookingMetrics> {
  const byCustomer = new Map<
    string,
    { count: number; lastRaw: string | null; partySizes: number[]; hasNoShow: boolean }
  >()

  for (const row of appointments) {
    const cid = row.customer_id
    if (!cid) continue

    let entry = byCustomer.get(cid)
    if (!entry) {
      entry = { count: 0, lastRaw: null, partySizes: [], hasNoShow: false }
      byCustomer.set(cid, entry)
    }

    entry.count += 1
    if (!entry.lastRaw || row.scheduled_at > entry.lastRaw) {
      entry.lastRaw = row.scheduled_at
    }
    if (isNoShowStatus(row.status)) entry.hasNoShow = true

    const party = parsePartySizeFromServiceName(row.service_name)
    if (party != null) entry.partySizes.push(party)
  }

  const result = new Map<string, CustomerBookingMetrics>()
  for (const [id, entry] of byCustomer) {
    const avgPartySize =
      entry.partySizes.length > 0
        ? entry.partySizes.reduce((a, b) => a + b, 0) / entry.partySizes.length
        : null
    result.set(id, {
      bookingCount: entry.count,
      lastBookingRaw: entry.lastRaw,
      avgPartySize,
      hasNoShow: entry.hasNoShow,
    })
  }
  return result
}

const emptyMetrics: CustomerBookingMetrics = {
  bookingCount: 0,
  lastBookingRaw: null,
  avgPartySize: null,
  hasNoShow: false,
}

export function enrichCrmCustomer(base: CrmCustomerBase, metrics?: CustomerBookingMetrics): CrmCustomer {
  const m = metrics ?? emptyMetrics
  const tags = deriveGuestTags({
    bookingCount: m.bookingCount,
    avgPartySize: m.avgPartySize,
    hasNoShow: m.hasNoShow,
  })
  return {
    ...base,
    bookingCount: m.bookingCount,
    lastBookingRaw: m.lastBookingRaw,
    lastBooking: formatGuestDisplayDate(m.lastBookingRaw),
    avgPartySize: m.avgPartySize,
    tags,
  }
}

export function enrichCrmCustomers(
  bases: CrmCustomerBase[],
  appointments: CrmAppointmentRow[],
): CrmCustomer[] {
  const metricsMap = buildCustomerMetricsMap(appointments)
  return bases.map((base) => enrichCrmCustomer(base, metricsMap.get(base.id)))
}

/**
 * Anonymous chat placeholders ("Website visitor" rows created for every widget
 * conversation) are noise in the guest list: no real name, no contact, no
 * bookings, no notes. They stay in the DB (conversations link to them and they
 * merge into a real profile once the guest shares contact) but are hidden here.
 */
export function isVisibleCrmCustomer(c: CrmCustomer): boolean {
  if (!c.isUnknownGuest) return true
  const hasPhone = c.phone.trim() !== '' && c.phone !== '—'
  const hasEmail = c.email.trim() !== ''
  return hasPhone || hasEmail || c.bookingCount > 0 || c.notes.trim() !== ''
}

export function filterVisibleCrmCustomers(list: CrmCustomer[]): CrmCustomer[] {
  return list.filter(isVisibleCrmCustomer)
}
