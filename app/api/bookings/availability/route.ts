import { NextResponse } from 'next/server'

import { getOpenSlotsForDate, inferDateKeyFromText } from '@/lib/booking-availability'
import { getVenueNowParts } from '@/lib/booking-wall-clock'
import { loadBusinessBookingContext } from '@/lib/booking-load'
import { loadBusinessReadiness } from '@/lib/business-readiness'
import { createClient } from '@/lib/supabase-server'
import { verifyBusinessOwner } from '@/lib/verify-business-owner'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const businessId = searchParams.get('business_id')?.trim()
  const dateParam = searchParams.get('date')?.trim()
  const partyRaw = searchParams.get('partySize') ?? searchParams.get('party')
  const zoneId = searchParams.get('zoneId')?.trim() || null
  // When editing an existing reservation, exclude it from the occupancy count —
  // otherwise a booking can "collide with itself" and fail to re-save.
  const excludeAppointmentId = searchParams.get('exclude')?.trim() || undefined

  if (!businessId) {
    return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
  }

  const allowed = await verifyBusinessOwner(businessId)
  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const partySize = Math.max(1, parseInt(partyRaw ?? '2', 10) || 2)

  const supabase = await createClient()
  const readiness = await loadBusinessReadiness(supabase, businessId)
  const ctx = await loadBusinessBookingContext(supabase, businessId)

  const now = getVenueNowParts(ctx.timezone)
  const dateKey = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : inferDateKeyFromText(dateParam ?? 'today', now)

  if (!readiness.bookingReady) {
    return NextResponse.json({
      dateKey,
      partySize,
      zoneId,
      slots: [],
      zones: [],
      setup_incomplete: true,
      bookingReady: false,
      missingSteps: readiness.missingSteps.filter((s) => s.id !== 'menu'),
    })
  }

  const slots = getOpenSlotsForDate({
    dateKey,
    operatingHours: ctx.operatingHours,
    existing: ctx.existingBookings,
    settings: ctx.bookingSettings,
    timeZone: ctx.timezone,
    now,
    excludeAppointmentId,
    zones: ctx.zones,
    partySize,
    zoneId,
  })

  return NextResponse.json({
    dateKey,
    partySize,
    zoneId,
    slots,
    zones: ctx.zones.filter((z) => z.is_active),
    bookingReady: true,
  })
}
