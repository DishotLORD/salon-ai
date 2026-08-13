import type { SupabaseClient } from '@supabase/supabase-js'

import {
  isCanadianBusinessTimezone,
  resolveBusinessTimezone,
} from '@/lib/business-timezone'
import {
  DINING_ZONE_TURNOVER_MIN_MINUTES,
  isBookableDiningZoneFields,
  type DiningZoneRawFields,
} from '@/lib/dining-zones'
import {
  DAY_ORDER,
  parseOperatingHours,
  validateOperatingHours,
  type OperatingHours,
} from '@/lib/operating-hours'

/** Guest-facing copy when the venue is not booking-ready. No internal details. */
export const SETUP_INCOMPLETE_GUEST_MESSAGE =
  'Online reservations are not available while this restaurant finishes its setup. Please contact the restaurant directly.'

/** Soft upper bounds for owner-submitted first-zone / settings values. */
export const ZONE_CAPACITY_MAX = 500
export const ZONE_PARTY_SIZE_MAX = 100
/** Re-exported so existing callers/tests keep working — this is the same
 *  floor `validateDiningZoneFields` and `parseDiningZoneRow` enforce. */
export const ZONE_TURNOVER_MIN_MINUTES = DINING_ZONE_TURNOVER_MIN_MINUTES

export type ReadinessStepId = 'timezone' | 'hours' | 'seating' | 'menu'

export type ReadinessMissingStep = {
  id: ReadinessStepId
  title: string
  description: string
  href: string
}

export type BusinessReadiness = {
  bookingReady: boolean
  conciergeReady: boolean
  missingSteps: ReadinessMissingStep[]
  warnings: string[]
  hoursConfirmed: boolean
  hasOpenDay: boolean
  hasUsableZone: boolean
  hasMenu: boolean
  timezoneResolved: string
  timezoneExplicit: boolean
}

export type DiningZoneReadinessInput = {
  is_active?: boolean | null
  max_concurrent_parties?: number | null
  min_party_size?: number | null
  max_party_size?: number | null
  turnover_minutes?: number | null
}

export type BusinessReadinessInput = {
  /** Raw businesses.timezone (null is valid legacy → Edmonton). */
  timezone: string | null | undefined
  /** Raw businesses.operating_hours JSON. */
  operatingHours: unknown
  /** Owner confirmation timestamp — null means not explicitly saved. */
  operatingHoursConfirmedAt: string | null | undefined
  zones: DiningZoneReadinessInput[]
  /** Count of structured menu rows (services). */
  menuItemCount: number
  menuPdfText: string | null | undefined
}

export function hasAtLeastOneOpenDay(hours: OperatingHours): boolean {
  return DAY_ORDER.some(({ key }) => !hours[key].closed)
}

/**
 * A zone counts toward readiness only if it is both structurally valid and
 * active. Delegates entirely to the shared contract in lib/dining-zones.ts —
 * this must never re-implement its own, looser rules, or a row the strict
 * reader rejects could still make a business look bookingReady.
 */
export function isUsableDiningZone(zone: DiningZoneReadinessInput): boolean {
  return isBookableDiningZoneFields(zone as DiningZoneRawFields)
}

export type ZoneFieldValidation =
  | {
      ok: true
      capacity: number
      minParty: number
      maxParty: number
      turnoverMinutes: number
      name: string
    }
  | { ok: false; message: string }

/** Server-side validation for the first-zone / seating form. */
export function validateZoneCapacityInput(input: {
  name?: string | null
  capacity?: unknown
  minPartySize?: unknown
  maxPartySize?: unknown
  turnoverMinutes?: unknown
}): ZoneFieldValidation {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 1) {
    return { ok: false, message: 'Enter a seating area name.' }
  }
  const capacity = Number(input.capacity)
  const minParty = Number(input.minPartySize)
  const maxParty = Number(input.maxPartySize)
  if (!Number.isFinite(capacity) || !Number.isInteger(capacity) || capacity < 1) {
    return { ok: false, message: 'Total capacity must be a whole number greater than 0.' }
  }
  if (capacity > ZONE_CAPACITY_MAX) {
    return {
      ok: false,
      message: `Total capacity cannot exceed ${ZONE_CAPACITY_MAX} guests.`,
    }
  }
  if (!Number.isFinite(minParty) || !Number.isInteger(minParty) || minParty < 1) {
    return { ok: false, message: 'Minimum party size must be at least 1.' }
  }
  if (!Number.isFinite(maxParty) || !Number.isInteger(maxParty)) {
    return { ok: false, message: 'Maximum party size must be a whole number.' }
  }
  if (maxParty < minParty) {
    return { ok: false, message: 'Maximum party size must be at least the minimum.' }
  }
  if (maxParty > ZONE_PARTY_SIZE_MAX) {
    return {
      ok: false,
      message: `Maximum party size cannot exceed ${ZONE_PARTY_SIZE_MAX}.`,
    }
  }
  if (maxParty > capacity) {
    return {
      ok: false,
      message: 'Maximum party size cannot exceed total capacity.',
    }
  }
  const turnoverMinutes = Number(input.turnoverMinutes)
  if (
    !Number.isFinite(turnoverMinutes) ||
    !Number.isInteger(turnoverMinutes) ||
    turnoverMinutes < ZONE_TURNOVER_MIN_MINUTES
  ) {
    return {
      ok: false,
      message: `Average turnover time must be a whole number of at least ${ZONE_TURNOVER_MIN_MINUTES} minutes.`,
    }
  }
  return { ok: true, capacity, minParty, maxParty, turnoverMinutes, name }
}

/**
 * Derive launch readiness from real DB fields. Never treats UI-only defaults as
 * saved configuration — hours require operatingHoursConfirmedAt.
 */
export function evaluateBusinessReadiness(
  input: BusinessReadinessInput,
): BusinessReadiness {
  const timezoneResolved = resolveBusinessTimezone(
    typeof input.timezone === 'string' ? input.timezone : null,
  )
  const timezoneExplicit =
    typeof input.timezone === 'string' &&
    isCanadianBusinessTimezone(input.timezone)

  const hoursConfirmed =
    typeof input.operatingHoursConfirmedAt === 'string' &&
    input.operatingHoursConfirmedAt.trim().length > 0

  const hours = parseOperatingHours(input.operatingHours)
  const hoursValidShape = validateOperatingHours(hours) === null
  const hasOpenDay = hasAtLeastOneOpenDay(hours)
  const hoursReady = hoursConfirmed && hoursValidShape && hasOpenDay

  const hasUsableZone = input.zones.some(isUsableDiningZone)

  const menuPdf =
    typeof input.menuPdfText === 'string' ? input.menuPdfText.trim() : ''
  const hasMenu = input.menuItemCount > 0 || menuPdf.length > 0

  const missingSteps: ReadinessMissingStep[] = []
  const warnings: string[] = []

  // Null timezone is fine for legacy Alberta venues once they are otherwise
  // ready. New incomplete venues still need an explicit timezone confirmation.
  if (!timezoneExplicit && !hoursReady) {
    missingSteps.push({
      id: 'timezone',
      title: 'Confirm timezone',
      description: 'Guests book in your restaurant’s local time.',
      href: '/onboarding',
    })
  }

  if (!hoursReady) {
    missingSteps.push({
      id: 'hours',
      title: 'Save operating hours',
      description:
        'Confirm and save the days and times you take reservations. Defaults shown in the editor are not live until you save.',
      href: '/onboarding',
    })
  }

  if (!hasUsableZone) {
    missingSteps.push({
      id: 'seating',
      title: 'Add seating and capacity',
      description:
        'Add at least one dining area with real capacity and party-size limits.',
      href: '/onboarding',
    })
  }

  if (!hasMenu) {
    missingSteps.push({
      id: 'menu',
      title: 'Add your menu',
      description:
        'Upload a PDF or enter dishes manually so the concierge can answer menu questions without guessing.',
      href: '/dashboard/settings?tab=menu',
    })
    warnings.push(
      'Without a menu, the concierge will say menu details are unavailable rather than invent dishes or prices.',
    )
  }

  if (hoursConfirmed && !hasOpenDay) {
    warnings.push('Every day is marked closed — guests cannot book any date.')
  }

  const bookingReady = hoursReady && hasUsableZone
  const conciergeReady = bookingReady && hasMenu

  return {
    bookingReady,
    conciergeReady,
    missingSteps,
    warnings,
    hoursConfirmed,
    hasOpenDay,
    hasUsableZone,
    hasMenu,
    timezoneResolved,
    timezoneExplicit,
  }
}

type BizRow = {
  timezone?: string | null
  operating_hours?: unknown
  operating_hours_confirmed_at?: string | null
  menu_pdf_text?: string | null
}

/**
 * Load the fields needed for readiness. Tolerates a missing
 * operating_hours_confirmed_at column (pre-migration) by treating confirmed
 * as "has usable zone" for compatibility — never invents readiness for
 * brand-new empty venues.
 */
export async function loadBusinessReadiness(
  supabase: SupabaseClient,
  businessId: string,
): Promise<BusinessReadiness> {
  let biz: BizRow | null = null
  let confirmedColumnPresent = true

  {
    const withConfirmed = await supabase
      .from('businesses')
      .select(
        'timezone, operating_hours, operating_hours_confirmed_at, menu_pdf_text',
      )
      .eq('id', businessId)
      .maybeSingle()

    if (
      withConfirmed.error &&
      /operating_hours_confirmed_at/i.test(withConfirmed.error.message)
    ) {
      confirmedColumnPresent = false
      const fallback = await supabase
        .from('businesses')
        .select('timezone, operating_hours, menu_pdf_text')
        .eq('id', businessId)
        .maybeSingle()
      biz = (fallback.data as BizRow | null) ?? null
    } else {
      biz = (withConfirmed.data as BizRow | null) ?? null
    }
  }

  const { data: zoneRows } = await supabase
    .from('dining_zones')
    .select(
      'is_active, max_concurrent_parties, min_party_size, max_party_size, turnover_minutes',
    )
    .eq('business_id', businessId)

  const { count: menuItemCount } = await supabase
    .from('services')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)

  const zones = (zoneRows ?? []) as DiningZoneReadinessInput[]
  const hasUsableZone = zones.some(isUsableDiningZone)

  let confirmedAt = biz?.operating_hours_confirmed_at ?? null
  if (!confirmedColumnPresent) {
    // Pre-migration: only treat hours as confirmed when real seating exists
    // (same compatibility idea as the SQL backfill). Empty new businesses stay
    // not-ready.
    confirmedAt = hasUsableZone ? new Date(0).toISOString() : null
  }

  return evaluateBusinessReadiness({
    timezone: biz?.timezone,
    operatingHours: biz?.operating_hours,
    operatingHoursConfirmedAt: confirmedAt,
    zones,
    menuItemCount: menuItemCount ?? 0,
    menuPdfText: biz?.menu_pdf_text,
  })
}
