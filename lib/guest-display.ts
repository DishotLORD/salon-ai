export type CrmGuestTag = 'New' | 'Regular' | 'Loyal' | 'No-show' | 'Large party'

export type GuestTagFilter = 'All' | 'New' | 'Regular' | 'Loyal' | 'No-show'

export type GuestTagMetricsInput = {
  bookingCount: number
  avgPartySize: number | null
  hasNoShow: boolean
}

export type TagChipStyle = { bg: string; border: string; color: string; dot: string }

const PLACEHOLDER_NAMES = /^(guest|website visitor|unknown)$/i

const BOT_PHRASE_WORDS = new Set([
  'placing',
  'place',
  'reservation',
  'reservations',
  'booking',
  'bookings',
  'confirm',
  'confirmed',
  'confirming',
  'your',
  'now',
  'table',
  'party',
  'guests',
  'guest',
  'please',
  'thank',
  'thanks',
  'hello',
  'welcome',
  'assist',
  'help',
  'moment',
  'soon',
  'ready',
  'processing',
  'working',
  'hold',
  'wait',
  'checking',
  'availability',
  'available',
  'tonight',
  'tomorrow',
  'today',
])

export function isPlausibleGuestName(name: string): boolean {
  const trimmed = name.trim()
  if (trimmed.length < 2 || trimmed.length > 80) return false
  if (PLACEHOLDER_NAMES.test(trimmed)) return false
  if (/^\d+$/.test(trimmed.replace(/\s/g, ''))) return false

  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length > 4) return false

  const botHits = words.filter((w) => BOT_PHRASE_WORDS.has(w)).length
  if (botHits >= 2) return false
  if (words.length >= 3 && botHits >= 1 && words.some((w) => w.includes('reserv'))) return false
  if (/reservation|booking|placing|confirm/i.test(trimmed) && words.length >= 2) return false

  return true
}

export function isUnknownGuest(name: string): boolean {
  return !isPlausibleGuestName(name)
}

export function displayGuestName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || !isPlausibleGuestName(trimmed)) return 'Unknown Guest'
  return trimmed
}

export function guestNameForAvatar(name: string): string {
  return isPlausibleGuestName(name) ? name : '?'
}

export function getGuestInitials(name: string): string {
  const display = guestNameForAvatar(name)
  if (display === '?') return '?'
  return display
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
}

export function guestNameHue(name: string): number {
  const seed = guestNameForAvatar(name)
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

/** Flat grey avatar for unknown guests */
export const unknownGuestAvatarStyle = {
  background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
  color: '#94a3b8',
} as const

export function deriveGuestTags(input: GuestTagMetricsInput): CrmGuestTag[] {
  const tags: CrmGuestTag[] = []
  const count = input.bookingCount

  if (count <= 1) tags.push('New')
  else if (count <= 5) tags.push('Regular')
  else tags.push('Loyal')

  if (input.hasNoShow) tags.push('No-show')
  if (input.avgPartySize != null && input.avgPartySize >= 6) tags.push('Large party')

  return tags
}

export function guestMatchesFilter(tags: CrmGuestTag[], filter: GuestTagFilter): boolean {
  if (filter === 'All') return true
  return tags.includes(filter)
}

export function crmTagChipStyle(tag: CrmGuestTag): TagChipStyle {
  switch (tag) {
    case 'New':
      return { bg: '#dcfce7', border: '#bbf7d0', color: '#16a34a', dot: '#16a34a' }
    case 'Regular':
      return { bg: '#dbeafe', border: '#bfdbfe', color: '#2563eb', dot: '#2563eb' }
    case 'Loyal':
      return { bg: '#ede9fe', border: '#ddd6fe', color: '#7c3aed', dot: '#7c3aed' }
    case 'No-show':
      return { bg: '#fee2e2', border: '#fecaca', color: '#dc2626', dot: '#dc2626' }
    case 'Large party':
      return { bg: '#ffedd5', border: '#fed7aa', color: '#ea580c', dot: '#ea580c' }
    default:
      return { bg: '#f1f5f9', border: '#e2e8f0', color: '#64748b', dot: '#64748b' }
  }
}

export function formatAvgPartySize(avg: number | null): string {
  if (avg == null) return '—'
  const rounded = Math.round(avg * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function formatGuestDisplayDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export const GUEST_TAG_FILTERS: GuestTagFilter[] = ['All', 'New', 'Regular', 'Loyal', 'No-show']
