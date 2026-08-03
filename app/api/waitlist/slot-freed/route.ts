import { NextResponse } from 'next/server'

import {
  isTimezoneSchemaError,
  resolveBusinessTimezone,
  type CanadianBusinessTimezone,
} from '@/lib/business-timezone'
import { scheduledAtToWallClock } from '@/lib/booking-wall-clock'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyWaitlistForFreedSlot } from '@/lib/waitlist-notify'

/**
 * "Staff just gave a table back — offer it to the queue."
 *
 * The bot calls the notifier directly, but the dashboard writes its own changes
 * through the browser Supabase client, which cannot send email or read another
 * guest's waitlist row. So it asks here instead. Same promise, same
 * one-guest-per-slot rule; the difference is only who freed the table.
 *
 * Two shapes, because the dashboard frees a table two ways:
 *
 *   { appointment_id }            the booking was cancelled or marked no-show
 *                                 and still exists, so the server resolves it
 *                                 and checks for itself that it is really free.
 *
 *   { business_id, date_key }     the booking was deleted. There is nothing left
 *                                 to look up, so the caller carries the context
 *                                 it captured before deleting.
 *
 * Both are authorized the same way: the caller must be signed in, and the
 * business must be one their own RLS grant lets them read. The deletion shape
 * takes a date from the client, which is why the notifier's own availability
 * check matters — it re-reads the day and will not promise a table that is not
 * actually free, whatever date it was handed.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)
  const limit = await checkRateLimit(`waitlist-freed:${ip}`, 60, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let body: { appointment_id?: unknown; business_id?: unknown; date_key?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const appointmentId =
    typeof body.appointment_id === 'string' ? body.appointment_id.trim() : ''
  const deletedBusinessId =
    typeof body.business_id === 'string' ? body.business_id.trim() : ''
  const deletedDateKey = typeof body.date_key === 'string' ? body.date_key.trim() : ''

  if (!appointmentId && !(deletedBusinessId && DATE_KEY_RE.test(deletedDateKey))) {
    return NextResponse.json({ error: 'appointment_id_required' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let businessId: string
  let dateKey = ''
  let freedScheduledAt: string | null = null

  if (appointmentId) {
    /*
     * Read through the caller's own client, not the admin one: RLS then decides
     * whether this appointment is theirs to see, and we inherit the same rule the
     * dashboard already runs under instead of restating it here.
     */
    const { data: appt } = await supabase
      .from('appointments')
      .select('id, business_id, scheduled_at, status')
      .eq('id', appointmentId)
      .maybeSingle()

    if (!appt?.business_id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }

    // A booking still standing has freed nothing. Guarding here means a
    // mis-fired call cannot promise a table that is still taken.
    const status = String(appt.status ?? '').toLowerCase()
    if (status !== 'cancelled' && status !== 'canceled' && status !== 'no-show') {
      return NextResponse.json({ error: 'not_freed', status }, { status: 409 })
    }

    businessId = String(appt.business_id)
    freedScheduledAt = String(appt.scheduled_at ?? '')
  } else {
    businessId = deletedBusinessId
    dateKey = deletedDateKey
  }

  /*
   * Doubles as the authorization check for the deletion shape: `businesses` is
   * readable only for a business the caller belongs to, so a row coming back is
   * proof of membership. For the appointment shape it was already proven above.
   */
  let business: Record<string, unknown> | null = null
  {
    const withTz = await supabase
      .from('businesses')
      .select('name, email, timezone')
      .eq('id', businessId)
      .maybeSingle()
    if (withTz.error && isTimezoneSchemaError(withTz.error.message)) {
      const fallback = await supabase
        .from('businesses')
        .select('name, email')
        .eq('id', businessId)
        .maybeSingle()
      business = (fallback.data as Record<string, unknown> | null) ?? null
    } else {
      business = (withTz.data as Record<string, unknown> | null) ?? null
    }
  }

  if (!business) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const timeZone = resolveBusinessTimezone(
    typeof business.timezone === 'string' ? business.timezone : null,
  )

  if (freedScheduledAt != null) {
    // scheduled_at is a UTC timestamp; the queue is keyed on the venue's own
    // calendar date, which is what scheduledAtToWallClock produces.
    dateKey = wallClockDateOf(freedScheduledAt, timeZone)
  }

  // Admin client from here: the queue holds other guests' contact details, which
  // the caller's own client is not allowed to read.
  const outcome = await notifyWaitlistForFreedSlot({
    supabase: supabaseAdmin,
    businessId,
    dateKey,
    restaurantName: business.name ? String(business.name) : 'the restaurant',
    ownerEmail: typeof business.email === 'string' ? business.email : null,
  })

  return NextResponse.json(outcome, { headers: { 'Cache-Control': 'no-store' } })
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

function wallClockDateOf(
  scheduledAt: string,
  timeZone: CanadianBusinessTimezone,
): string {
  const wallClock = scheduledAtToWallClock(scheduledAt, timeZone) ?? scheduledAt
  return wallClock.slice(0, 10)
}
