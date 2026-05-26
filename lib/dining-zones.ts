import type { BookingSettings } from '@/lib/booking-settings'

export type DiningZone = {
  id: string
  business_id: string
  name: string
  slug: string
  max_concurrent_parties: number
  min_party_size: number
  max_party_size: number
  turnover_minutes: number
  is_active: boolean
  sort_order: number
}

export const ZONE_PRESETS: { name: string; slug: string }[] = [
  { name: 'Main dining', slug: 'main-dining' },
  { name: 'Patio', slug: 'patio' },
  { name: 'Bar', slug: 'bar' },
  { name: 'Window seats', slug: 'window' },
  { name: 'Booths', slug: 'booths' },
  { name: 'Quiet area', slug: 'quiet' },
  { name: 'Large groups', slug: 'large-groups' },
]

export function slugifyZoneName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'zone'
}

export function parseDiningZoneRow(raw: Record<string, unknown>): DiningZone {
  return {
    id: String(raw.id),
    business_id: String(raw.business_id),
    name: String(raw.name ?? 'Zone'),
    slug: String(raw.slug ?? 'zone'),
    max_concurrent_parties: Math.max(1, Number(raw.max_concurrent_parties) || 4),
    min_party_size: Math.max(1, Number(raw.min_party_size) || 1),
    max_party_size: Math.max(1, Number(raw.max_party_size) || 12),
    turnover_minutes: Math.max(15, Number(raw.turnover_minutes) || 90),
    is_active: raw.is_active !== false,
    sort_order: Number(raw.sort_order) || 0,
  }
}

export function defaultMainDiningZone(
  businessId: string,
  settings: BookingSettings,
): Omit<DiningZone, 'id'> & { id?: string } {
  return {
    business_id: businessId,
    name: 'Main dining',
    slug: 'main-dining',
    max_concurrent_parties: settings.max_concurrent_reservations,
    min_party_size: 1,
    max_party_size: 12,
    turnover_minutes: settings.default_duration_minutes,
    is_active: true,
    sort_order: 0,
  }
}

const ZONE_KEYWORDS: Record<string, string[]> = {
  patio: ['patio', 'terrace', 'outdoor', 'outside', 'deck'],
  bar: ['bar', 'lounge', 'cocktail'],
  window: ['window', 'view'],
  booths: ['booth', 'booths'],
  quiet: ['quiet', 'private', 'corner'],
  'large-groups': ['large group', 'big group', 'banquet', 'private event'],
  'main-dining': ['main', 'dining room', 'inside'],
}

/** Match guest text to a zone slug; returns zone id when found. */
export function inferZoneIdFromText(
  text: string,
  zones: DiningZone[],
): string | null {
  const lower = text.toLowerCase()
  const active = zones.filter((z) => z.is_active)
  for (const zone of active) {
    const keys = ZONE_KEYWORDS[zone.slug] ?? [zone.slug.replace(/-/g, ' '), zone.name.toLowerCase()]
    for (const kw of keys) {
      if (lower.includes(kw)) return zone.id
    }
    if (lower.includes(zone.name.toLowerCase())) return zone.id
  }
  return null
}

export function zoneAcceptsParty(zone: DiningZone, partySize: number): boolean {
  if (!zone.is_active) return false
  return partySize >= zone.min_party_size && partySize <= zone.max_party_size
}

export function activeZonesForParty(zones: DiningZone[], partySize: number): DiningZone[] {
  return zones
    .filter((z) => zoneAcceptsParty(z, partySize))
    .sort((a, b) => a.sort_order - b.sort_order)
}

export function guestAcceptsAnyZone(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    /\b(any(?:where)?|no pref(?:erence)?|doesn'?t matter|don'?t care|whatever works|whatever is fine|surprise me|up to you|your choice|any area|any seating|first available|wherever|whichever|no specific|not picky)\b/i.test(
      lower,
    ) ||
    /\b(без разницы|не важно|любая зона|любое место|где есть место|всё равно|как получится)\b/i.test(
      lower,
    )
  )
}

export function formatZoneNamesList(zones: DiningZone[]): string {
  return zones.map((z) => z.name).join(', ')
}

export type ZoneResolution = {
  zoneId: string | null
  /** Guest chose a zone, said "any", or only one zone exists. */
  known: boolean
  zoneName: string | null
  /** Active zones that fit party size (for prompts). */
  eligibleZones: DiningZone[]
}

/**
 * Whether seating area is resolved for booking.
 * - 1 eligible zone → auto-select
 * - Guest named a zone or said "any preference"
 * - Otherwise unknown → bot should ask
 */
export function resolveZoneFromConversation(
  zones: DiningZone[],
  partySize: number,
  userText: string,
  assistantText: string,
): ZoneResolution {
  const eligibleZones = activeZonesForParty(
    zones.filter((z) => z.is_active),
    partySize,
  )

  if (eligibleZones.length === 0) {
    return { zoneId: null, known: false, zoneName: null, eligibleZones }
  }

  if (eligibleZones.length === 1) {
    const z = eligibleZones[0]
    return { zoneId: z.id, known: true, zoneName: z.name, eligibleZones }
  }

  const combined = `${userText}\n${assistantText}`

  if (guestAcceptsAnyZone(userText) || guestAcceptsAnyZone(assistantText)) {
    return {
      zoneId: null,
      known: true,
      zoneName: null,
      eligibleZones,
    }
  }

  const inferred = inferZoneIdFromText(combined, eligibleZones)
  if (inferred) {
    const z = eligibleZones.find((zone) => zone.id === inferred)!
    return { zoneId: z.id, known: true, zoneName: z.name, eligibleZones }
  }

  return { zoneId: null, known: false, zoneName: null, eligibleZones }
}
