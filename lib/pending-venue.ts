import type { CanadianBusinessTimezone } from '@/lib/business-timezone'
import { normalizeVenueType, type VenueType } from '@/lib/venue-types'

/** sessionStorage key for venue fields entered before Google OAuth. */
export const PENDING_VENUE_STORAGE_KEY = 'oceancore_pending_venue'

export type PendingVenueDraft = {
  businessName: string
  businessType: VenueType
  address: string
  timezone: CanadianBusinessTimezone | ''
  phone: string
  agentName: string
}

export function savePendingVenueDraft(draft: PendingVenueDraft): void {
  try {
    sessionStorage.setItem(PENDING_VENUE_STORAGE_KEY, JSON.stringify(draft))
  } catch {
    /* storage blocked */
  }
}

export function readPendingVenueDraft(): PendingVenueDraft | null {
  try {
    const raw = sessionStorage.getItem(PENDING_VENUE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingVenueDraft>
    if (typeof parsed.businessName !== 'string') return null
    return {
      businessName: parsed.businessName,
      businessType: normalizeVenueType(parsed.businessType),
      address: typeof parsed.address === 'string' ? parsed.address : '',
      timezone:
        typeof parsed.timezone === 'string'
          ? (parsed.timezone as CanadianBusinessTimezone | '')
          : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      agentName: typeof parsed.agentName === 'string' ? parsed.agentName : '',
    }
  } catch {
    return null
  }
}

export function clearPendingVenueDraft(): void {
  try {
    sessionStorage.removeItem(PENDING_VENUE_STORAGE_KEY)
  } catch {
    /* storage blocked */
  }
}
