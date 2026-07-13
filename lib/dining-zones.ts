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
    max_party_size: 999,
    turnover_minutes: 70,
    is_active: true,
    sort_order: 0,
  }
}

const ZONE_KEYWORDS: Record<string, string[]> = {
  patio: ['patio', 'terrace', 'outdoor', 'outside', 'deck', 'патио', 'терраса', 'тераса', 'веранда'],
  bar: ['bar', 'lounge', 'cocktail', 'бар'],
  window: ['window', 'view', 'окно', 'у окна', 'вікно'],
  booths: ['booth', 'booths'],
  quiet: ['quiet', 'private', 'corner', 'тихое', 'тихе'],
  'large-groups': ['large group', 'big group', 'banquet', 'private event'],
  'main-dining': ['main dining', 'dining room', 'inside', 'зал', 'основной зал'],
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Unicode-aware word-boundary regex. JS \b is ASCII-only — `\bпатио\b` can
 * never match, which silently broke every non-Latin zone mention.
 */
function wordBoundaryRegex(word: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(word)}(?![\\p{L}\\p{N}])`, 'iu')
}

/** Short keywords need word boundaries so "bar" does not match unrelated words. */
function textMatchesZoneKeyword(text: string, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return false
  if (kw.length <= 5 || !/\s/.test(kw)) {
    return wordBoundaryRegex(kw).test(text)
  }
  return text.toLowerCase().includes(kw)
}

/** Strip everything but letters/digits (Latin + Cyrillic) for space/punctuation-insensitive compare. */
function compactText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u0400-\u04ff]+/g, '')
}

/**
 * Distinctive tokens that identify a zone beyond its exact name:
 * - significant name words (≥3 chars): "Main dining" → "main", "dining"
 * - compacted name/slug so "maindining" / "main-dining" still match "Main dining".
 * Lets guests use shortened forms or drop spaces without breaking booking.
 */
function textReferencesZoneToken(text: string, zone: DiningZone): boolean {
  const nameWords = zone.name
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3)
  for (const w of nameWords) {
    if (wordBoundaryRegex(w).test(text)) return true
  }
  const compact = compactText(text)
  const compactTokens = [compactText(zone.name), compactText(zone.slug)].filter(
    (c) => c.length >= 3,
  )
  return compactTokens.some((c) => compact.includes(c))
}

// (?![\p{L}\p{N}]) instead of \b — JS \b is ASCII-only, so `да\b` never matches
// and every Russian affirmation was silently ignored.
const AFFIRMATIVE_RE =
  /^(y|ye|yes+|yeah|yep|yup|sure|ok|okay|okey|kk?|correct|right|exact(?:ly)?|perfect|great|fine|good|sounds? good|that works|works(?: for me)?|please do|go ahead|confirm(?:ed)?|да+|ага|угу|конечно|верно|давай(?:те)?|хорошо|ладно|ок|окей)(?![\p{L}\p{N}])/iu

/** True when a short reply is a plain affirmation ("yes", "correct", "да", …). */
export function isAffirmativeReply(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[!.…,\s]+$/g, '')
  if (!t || t.length > 24) return false
  return AFFIRMATIVE_RE.test(t)
}

/**
 * Returns a zone id only when EXACTLY ONE active zone is referenced in the text.
 * Used to confirm the single zone the assistant proposed — a multi-zone question
 * like "Main dining, Patio, or Bar?" references 3 zones and returns null.
 */
export function singleZoneMentioned(text: string, zones: DiningZone[]): string | null {
  const active = zones.filter((z) => z.is_active)
  const ids = new Set<string>()
  for (const zone of active) {
    if (textMatchesZoneKeyword(text, zone.name) || textReferencesZoneToken(text, zone)) {
      ids.add(zone.id)
      continue
    }
    const keys = ZONE_KEYWORDS[zone.slug] ?? []
    for (const kw of keys) {
      if (kw.toLowerCase() === zone.name.toLowerCase()) continue
      if (textMatchesZoneKeyword(text, kw)) {
        ids.add(zone.id)
        break
      }
    }
  }
  return ids.size === 1 ? [...ids][0] : null
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

  // Pass 3: distinctive name tokens / compacted forms — tolerant of shortened
  // words ("main"), dropped spaces ("maindining"). Only used when unambiguous,
  // so a stray token can never silently pick the wrong zone.
  const tokenMatches = active.filter((z) => textReferencesZoneToken(text, z))
  if (tokenMatches.length === 1) return tokenMatches[0].id

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
    // Unicode lookarounds, not \b — ASCII \b never fires on Cyrillic, which
    // silently disabled this entire list.
    /(?<![\p{L}\p{N}])(без разницы|не важно|неважно|любая зона|любое место|где есть место|вс[её] равно|как получится|будь-де|байдуже|не має значення)(?![\p{L}\p{N}])/iu.test(
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
