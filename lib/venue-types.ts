export const VENUE_TYPE_OPTIONS = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bar', label: 'Bar / lounge' },
  { value: 'cafe', label: 'Café' },
  { value: 'pub', label: 'Pub' },
  { value: 'cocktail_bar', label: 'Cocktail bar' },
  { value: 'brewery', label: 'Brewery / taproom' },
  { value: 'nightclub', label: 'Nightclub' },
  { value: 'other', label: 'Other food & drink' },
] as const

export type VenueType = (typeof VENUE_TYPE_OPTIONS)[number]['value']

const LABELS: Record<VenueType, string> = Object.fromEntries(
  VENUE_TYPE_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<VenueType, string>

export function normalizeVenueType(value: unknown): VenueType {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s/-]+/g, '_')
    : ''

  if (normalized === 'restaurant') return 'restaurant'
  if (normalized === 'bar' || normalized === 'lounge' || normalized === 'bar_lounge') return 'bar'
  if (normalized === 'cafe' || normalized === 'café' || normalized.includes('coffee')) return 'cafe'
  if (normalized === 'pub') return 'pub'
  if (normalized === 'cocktail_bar' || normalized === 'cocktail') return 'cocktail_bar'
  if (normalized === 'brewery' || normalized === 'taproom' || normalized === 'brewery_taproom') return 'brewery'
  if (normalized === 'nightclub' || normalized === 'night_club' || normalized === 'club') return 'nightclub'

  // Legacy bakery and generic hospitality values remain valid, but are grouped
  // under the focused food-and-drink fallback instead of creating stale options.
  return 'other'
}

export function venueTypeLabel(value: unknown): string {
  return LABELS[normalizeVenueType(value)]
}
