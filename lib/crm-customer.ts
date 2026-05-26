import { formatGuestDisplayDate, isPlausibleGuestName, type CrmGuestTag } from '@/lib/guest-display'

export type CrmCustomer = {
  id: string
  name: string
  phone: string
  email: string
  joined: string
  joinedRaw: string | null
  notes: string
  isUnknownGuest: boolean
  bookingCount: number
  lastBooking: string
  lastBookingRaw: string | null
  avgPartySize: number | null
  tags: CrmGuestTag[]
}

export type CrmCustomerBase = {
  id: string
  name: string
  phone: string
  email: string
  joined: string
  joinedRaw: string | null
  notes: string
  isUnknownGuest: boolean
}

export function mapDbCustomerBase(row: Record<string, unknown>): CrmCustomerBase {
  const rawName = String(row.name ?? 'Guest')
  const joinedRaw = row.joined ?? row.created_at ?? row.createdAt
  return {
    id: String(row.id),
    name: rawName,
    phone: row.phone != null && String(row.phone).trim() ? String(row.phone) : '—',
    email: row.email != null ? String(row.email).trim() : '',
    joined: formatGuestDisplayDate(joinedRaw != null ? String(joinedRaw) : null),
    joinedRaw: joinedRaw != null ? String(joinedRaw) : null,
    notes: row.notes != null ? String(row.notes) : '',
    isUnknownGuest: !isPlausibleGuestName(rawName),
  }
}
