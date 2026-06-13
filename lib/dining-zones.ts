import type { BookingSettings } from '@/lib/booking-settings'

export type DiningZone = {
  id: string
  business_id: string
  name: string
  slug: string
  /** Zone capacity in concurrent guests (covers). */
  max_concurrent_parties: number
  min_party_size: number
  max_party_size: number
  /** Average table occupancy in minutes. */
  turnover_minutes: number
  is_active: boolean
  sort_order: number
}

const ZONE_NAME_BLOCKLIST = new Set(
  [
    'patio',
    'bar',
    'booths',
    'booth',
    'window',
    'windows',
    'quiet',
    'main',
    'dining',
    'main dining',
    'window seats',
    'quiet area',
    'large groups',
    'terrace',
    'lounge',
    'outdoor',
    'inside',
    'anywhere',
  ].map((s) => s.toLowerCase()),
)

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
    // Values under 20 are legacy "max tables" counts, not cover capacity.
    max_concurrent_parties: (() => {
      const n = Number(raw.max_concurrent_parties)
      if (!Number.isFinite(n) || n < 1) return 150
      if (n < 20) return 150
      return Math.round(n)
    })(),
    min_party_size: Math.max(1, Number(raw.min_party_size) || 1),
    max_party_size: Math.max(1, Number(raw.max_party_size) || 12),
    turnover_minutes: Math.max(15, Number(raw.turnover_minutes) || 70),
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
    max_concurrent_parties: 150,
    min_party_size: 1,
    max_party_size: 12,
    turnover_minutes: 70,
    is_active: true,
    sort_order: 0,
  }
}

const ZONE_KEYWORDS: Record<string, string[]> = {
  patio: ['patio', 'terrace', 'outdoor', 'outside', 'deck'],
  bar: ['bar', 'lounge', 'cocktail', 'бар'],
  window: ['window', 'view'],
  booths: ['booth', 'booths'],
  quiet: ['quiet', 'private', 'corner'],
  'large-groups': ['large group', 'big group', 'banquet', 'private event'],
  'main-dining': ['main dining', 'dining room', 'inside'],
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Short keywords need word boundaries so "bar" does not match unrelated words. */
function textMatchesZoneKeyword(text: string, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return false
  if (kw.length <= 5 || !/\s/.test(kw)) {
    return new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(text)
  }
  return text.toLowerCase().includes(kw)
}

/**
 * Match text to a zone id.
 *
 * Two-pass algorithm so that an explicit zone-name mention always beats a
 * keyword-synonym match from a different zone:
 *   Pass 1 – exact zone name match across ALL active zones
 *   Pass 2 – keyword synonym match across ALL active zones
 *
 * Within each pass zones are checked in sort_order (ascending) — only relevant
 * when two zones share a synonym, which should never happen with clean data.
 */
export function inferZoneIdFromText(
  text: string,
  zones: DiningZone[],
): string | null {
  if (!text.trim()) return null
  const active = zones.filter((z) => z.is_active)

  // Pass 1: zone name match (e.g. zone named "Bar" matches "bar please")
  for (const zone of active) {
    if (textMatchesZoneKeyword(text, zone.name)) {
      return zone.id
    }
  }

  // Pass 2: keyword synonym match (e.g. "lounge" → bar zone)
  for (const zone of active) {
    const keys = ZONE_KEYWORDS[zone.slug] ?? [zone.slug.replace(/-/g, ' ')]
    for (const kw of keys) {
      // Skip if keyword duplicates the zone name (already handled in pass 1)
      if (kw.toLowerCase() === zone.name.toLowerCase()) continue
      if (textMatchesZoneKeyword(text, kw)) {
        return zone.id
      }
    }
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

/** True when text is a dining zone label, not a person name (e.g. "Patio", "Main dining"). */
export function isLikelyDiningZoneLabel(
  text: string,
  zones?: Pick<DiningZone, 'name' | 'slug'>[],
): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const lower = trimmed.toLowerCase()

  if (ZONE_NAME_BLOCKLIST.has(lower)) return true

  for (const z of zones ?? []) {
    if (z.name.toLowerCase() === lower) return true
    if (z.slug.replace(/-/g, ' ') === lower) return true
    if (z.slug.replace(/-/g, ' ') === lower.replace(/\s+/g, ' ')) return true
  }

  for (const preset of ZONE_PRESETS) {
    if (preset.name.toLowerCase() === lower) return true
  }

  return false
}

export type ZoneResolution = {
  zoneId: string | null
  /** Guest chose a zone, said "any", or only one zone exists. */
  known: boolean
  zoneName: string | null
  /** Active zones that fit party size (for prompts). */
  eligibleZones: DiningZone[]
  /**
   * Where the zone was resolved from:
   * - 'user'      – guest explicitly named it in their own messages (highest trust)
   * - 'assistant' – inferred from what the bot said (lower trust)
   * - 'auto'      – only one eligible zone existed, auto-selected
   * - 'none'      – not resolved
   */
  source: 'user' | 'assistant' | 'auto' | 'none'
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
    return { zoneId: null, known: false, zoneName: null, eligibleZones, source: 'none' }
  }

  if (eligibleZones.length === 1) {
    const z = eligibleZones[0]
    return { zoneId: z.id, known: true, zoneName: z.name, eligibleZones, source: 'auto' }
  }

  // Guest choice always wins over assistant copy (AI often says "Main dining" by default).
  if (guestAcceptsAnyZone(userText)) {
    return { zoneId: null, known: true, zoneName: null, eligibleZones, source: 'user' }
  }

  const fromUser = inferZoneIdFromText(userText, eligibleZones)
  if (fromUser) {
    const z = eligibleZones.find((zone) => zone.id === fromUser)!
    return { zoneId: z.id, known: true, zoneName: z.name, eligibleZones, source: 'user' }
  }

  if (guestAcceptsAnyZone(assistantText)) {
    return { zoneId: null, known: true, zoneName: null, eligibleZones, source: 'assistant' }
  }

  const fromAssistant = inferZoneIdFromText(assistantText, eligibleZones)
  if (fromAssistant) {
    const z = eligibleZones.find((zone) => zone.id === fromAssistant)!
    return { zoneId: z.id, known: true, zoneName: z.name, eligibleZones, source: 'assistant' }
  }

  return { zoneId: null, known: false, zoneName: null, eligibleZones, source: 'none' }
}
