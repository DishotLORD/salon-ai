/**
 * Shared parsing/serialization for the `customers.notes` column.
 *
 * The column doubles as a small structured profile written by the AI concierge
 * (allergies, preferences, occasions) AND a free-text field the owner can edit
 * in the CRM (ownerNotes). It is stored as a JSON blob when structured data is
 * present, or as plain text when only owner notes exist (backward-compatible
 * with legacy rows that were plain strings).
 */

export type GuestPreferences = {
  allergies?: string
  preferences?: string
  occasions?: string
  /** Free-text notes written by the restaurant owner in the CRM. */
  ownerNotes?: string
}

/**
 * Parse the raw `customers.notes` value. Legacy plain-text notes are treated as
 * owner notes so nothing the owner previously wrote is ever lost.
 */
export function parseGuestNotes(notes: string | null | undefined): GuestPreferences {
  if (!notes || !notes.trim()) return {}
  const trimmed = notes.trim()

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const out: GuestPreferences = {}
        if (typeof obj.allergies === 'string' && obj.allergies.trim()) {
          out.allergies = obj.allergies.trim()
        }
        if (typeof obj.preferences === 'string' && obj.preferences.trim()) {
          out.preferences = obj.preferences.trim()
        }
        if (typeof obj.occasions === 'string' && obj.occasions.trim()) {
          out.occasions = obj.occasions.trim()
        }
        const owner = obj.owner_notes ?? obj.ownerNotes ?? obj.notes
        if (typeof owner === 'string' && owner.trim()) {
          out.ownerNotes = owner.trim()
        }
        return out
      }
    } catch {
      // Not valid JSON — fall through and treat as plain owner notes.
    }
  }

  return { ownerNotes: trimmed }
}

/**
 * Serialize preferences back into the column. When only owner notes exist the
 * value is stored as plain text (keeps the column readable and backward-compatible);
 * otherwise a compact JSON blob is used. Returns null when everything is empty.
 */
export function serializeGuestNotes(prefs: GuestPreferences): string | null {
  const clean: Record<string, string> = {}
  if (prefs.allergies?.trim()) clean.allergies = prefs.allergies.trim()
  if (prefs.preferences?.trim()) clean.preferences = prefs.preferences.trim()
  if (prefs.occasions?.trim()) clean.occasions = prefs.occasions.trim()
  if (prefs.ownerNotes?.trim()) clean.owner_notes = prefs.ownerNotes.trim()

  const keys = Object.keys(clean)
  if (keys.length === 0) return null
  if (keys.length === 1 && clean.owner_notes) return clean.owner_notes
  return JSON.stringify(clean)
}

function appendUnique(
  existing: string | undefined,
  addition: string | null | undefined,
): string | undefined {
  const add = addition?.trim()
  if (!add) return existing
  const base = existing?.trim()
  if (!base) return add
  if (base.toLowerCase().includes(add.toLowerCase())) return base
  return `${base}; ${add}`
}

/**
 * Additively merge bot-discovered fields into existing preferences. Never erases
 * existing data and never touches owner notes — booking flow stays non-destructive.
 */
export function mergeGuestPreferences(
  existing: GuestPreferences,
  updates: {
    allergies?: string | null
    preferences?: string | null
    occasions?: string | null
  },
): GuestPreferences {
  return {
    ...existing,
    allergies: appendUnique(existing.allergies, updates.allergies),
    preferences: appendUnique(existing.preferences, updates.preferences),
    occasions: appendUnique(existing.occasions, updates.occasions),
  }
}

export function hasStructuredPreferences(prefs: GuestPreferences): boolean {
  return Boolean(prefs.allergies || prefs.preferences || prefs.occasions)
}

/** Build the lines injected into the returning-guest system prompt. */
export function formatGuestPreferencesForPrompt(prefs: GuestPreferences): string | null {
  const lines: string[] = []
  if (prefs.allergies) lines.push(`- Allergies / dietary: ${prefs.allergies}`)
  if (prefs.preferences) lines.push(`- Preferences: ${prefs.preferences}`)
  if (prefs.occasions) lines.push(`- Occasions: ${prefs.occasions}`)
  if (prefs.ownerNotes) lines.push(`- Staff notes: ${prefs.ownerNotes}`)
  return lines.length > 0 ? lines.join('\n') : null
}
