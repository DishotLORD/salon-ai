import { NextResponse } from 'next/server'

import { scheduledAtToWallClock } from '@/lib/booking-wall-clock'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { notifyWaitlistForFreedSlot } from '@/lib/waitlist-notify'

/**
 * "Staff just gave a table back — offer it to the queue."
 *
 * The bot calls the notifier directly, but the dashboard writes its own
 * cancellations through the browser Supabase client, which cannot send email or
 * read another guest's waitlist row. So it asks here instead. Same promise, same
 * one-guest-per-slot rule; the difference is only who freed the table.
 *
 * The caller is authenticated from their session cookie and the appointment must
 * belong to a business they can administer — the request carries an appointment
 * id, and an id is a thing anyone can guess.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)
  const limit = await checkRateLimit(`waitlist-freed:${ip}`, 60, 60_000)
  if (!limit.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let body: { appointment_id?: unknown }
  try {
    body = (await request.json()) as { appointment_id?: unknown }
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const appointmentId =
    typeof body.appointment_id === 'string' ? body.appointment_id.trim() : ''
  if (!appointmentId) {
    return NextResponse.json({ error: 'appointment_id_required' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

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

  const { data: business } = await supabase
    .from('businesses')
    .select('name, email')
    .eq('id', appt.business_id)
    .maybeSingle()

  // Admin client from here: the queue holds other guests' contact details, which
  // the caller's own client is not allowed to read.
  const outcome = await notifyWaitlistForFreedSlot({
    supabase: supabaseAdmin,
    businessId: String(appt.business_id),
    // scheduled_at is a UTC timestamp; the queue is keyed on the venue's own
    // calendar date, which is what scheduledAtToWallClock produces.
    dateKey: wallClockDateOf(String(appt.scheduled_at ?? '')),
    restaurantName: business?.name ? String(business.name) : 'the restaurant',
    ownerEmail: business?.email ? String(business.email) : null,
  })

  return NextResponse.json(outcome, { headers: { 'Cache-Control': 'no-store' } })
}

function wallClockDateOf(scheduledAt: string): string {
  const wallClock = scheduledAtToWallClock(scheduledAt) ?? scheduledAt
  return wallClock.slice(0, 10)
}
