import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

import { isSlotAvailable } from '@/lib/booking-availability'
import { loadBusinessBookingContext } from '@/lib/booking-load'
import { getCalgaryNowParts } from '@/lib/booking-wall-clock'
import { escapeHtml } from '@/lib/escape-html'

/**
 * Closing the loop on the waitlist.
 *
 * The concierge offers the waitlist with the words "we'll reach out the moment a
 * table opens" — and nothing did. A guest joined the queue, a booking was
 * cancelled ten minutes later, and the freed table sat there while the guest
 * waited for a call nobody had been asked to make. The promise was real; the
 * mechanism was missing.
 *
 * Called whenever a slot is given back: a guest cancels through the bot, a
 * booking is moved to another time, or staff cancel one in the dashboard.
 *
 * Two rules keep this honest:
 *   • Exactly one guest is notified per freed slot. Telling five people the same
 *     table is free is worse than telling none.
 *   • The queue is worked in order. If the guest at the front left only a phone
 *     number, the owner is asked to call them — we do not skip past them to
 *     someone who happens to be emailable.
 */

export type WaitlistNotifyOutcome =
  | { notified: false; reason: 'no_entries' | 'nothing_available' | 'table_missing' | 'error' }
  | { notified: true; via: 'guest_email'; entryId: string; guestName: string }
  | { notified: true; via: 'owner_call_request'; entryId: string; guestName: string }

type WaitlistRow = {
  id: string
  guest_name: string | null
  phone: string | null
  email: string | null
  requested_date: string
  requested_time: string
  party_size: number | null
  zone_id: string | null
  notes: string | null
}

/** 'HH:MM' or 'HH:MM:SS' → 'YYYY-MM-DDTHH:MM:00'. */
function toWallClock(dateKey: string, time: string): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || hour > 23 || !Number.isFinite(minute) || minute > 59) return null
  return `${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
}

function formatDate(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim())
  if (!match) return time
  const hour = Number(match[1])
  const minute = match[2]
  return `${hour > 12 ? hour - 12 : hour || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`
}

export async function notifyWaitlistForFreedSlot(params: {
  supabase: SupabaseClient
  businessId: string
  /** The date the freed booking was on: only that day's queue can benefit. */
  dateKey: string
  restaurantName: string
  ownerEmail: string | null
}): Promise<WaitlistNotifyOutcome> {
  const { supabase, businessId, dateKey, restaurantName, ownerEmail } = params

  try {
    const { data, error } = await supabase
      .from('waitlist_entries')
      .select('id, guest_name, phone, email, requested_date, requested_time, party_size, zone_id, notes')
      .eq('business_id', businessId)
      .eq('requested_date', dateKey)
      .eq('status', 'waiting')
      // First in the queue is first offered the table.
      .order('created_at', { ascending: true })

    // Migration 015 may not have run on this project yet; a venue with no
    // waitlist table simply has no waitlist.
    if (error) {
      console.error('[waitlist] Could not read the queue:', error.message)
      return { notified: false, reason: 'table_missing' }
    }
    const entries = (data ?? []) as WaitlistRow[]
    if (entries.length === 0) return { notified: false, reason: 'no_entries' }

    // Loaded after the cancellation has been written, so the freed slot really
    // does read as free.
    const ctx = await loadBusinessBookingContext(supabase, businessId)
    const now = getCalgaryNowParts()

    const winner = entries.find((entry) => {
      const wallClock = toWallClock(entry.requested_date, entry.requested_time)
      if (!wallClock) return false
      return isSlotAvailable({
        wallClock,
        operatingHours: ctx.operatingHours,
        existing: ctx.existingBookings,
        settings: ctx.bookingSettings,
        now,
        zones: ctx.zones,
        partySize: entry.party_size ?? 2,
        // A guest who asked for the patio is not served by a table indoors.
        zoneId: entry.zone_id,
      })
    })

    if (!winner) return { notified: false, reason: 'nothing_available' }

    const guestName = winner.guest_name?.trim() || 'Guest'
    const guestEmail = winner.email?.trim() || ''
    const zoneName = winner.zone_id
      ? ctx.zones.find((z) => z.id === winner.zone_id)?.name ?? null
      : null

    // Claimed before the email goes out: two cancellations landing at once must
    // not both pick the same guest.
    const { error: claimError } = await supabase
      .from('waitlist_entries')
      .update({ status: 'contacted', updated_at: new Date().toISOString() })
      .eq('id', winner.id)
      .eq('status', 'waiting')
    if (claimError) {
      console.error('[waitlist] Could not claim the entry:', claimError.message)
      return { notified: false, reason: 'error' }
    }

    if (guestEmail) {
      void sendTableOpenedEmail({
        to: guestEmail,
        restaurantName,
        guestName,
        dateKey: winner.requested_date,
        time: winner.requested_time,
        partySize: winner.party_size ?? 2,
        zoneName,
      })
      // The owner needs to know too — a guest who replies "yes please" replies
      // into the chat, and staff should be expecting them.
      void sendOwnerWaitlistEmail({
        to: ownerEmail,
        restaurantName,
        guestName,
        phone: winner.phone,
        email: guestEmail,
        dateKey: winner.requested_date,
        time: winner.requested_time,
        partySize: winner.party_size ?? 2,
        zoneName,
        needsCall: false,
      })
      console.log('[waitlist] Told', guestEmail, 'a table opened for', winner.requested_date, winner.requested_time)
      return { notified: true, via: 'guest_email', entryId: winner.id, guestName }
    }

    // Phone only: the software cannot make the call, so it asks the humans to.
    void sendOwnerWaitlistEmail({
      to: ownerEmail,
      restaurantName,
      guestName,
      phone: winner.phone,
      email: null,
      dateKey: winner.requested_date,
      time: winner.requested_time,
      partySize: winner.party_size ?? 2,
      zoneName,
      needsCall: true,
    })
    console.log('[waitlist] Asked the owner to call', guestName, 'about', winner.requested_date, winner.requested_time)
    return { notified: true, via: 'owner_call_request', entryId: winner.id, guestName }
  } catch (err) {
    console.error('[waitlist] Unexpected failure:', err instanceof Error ? err.message : err)
    return { notified: false, reason: 'error' }
  }
}

/** Fire-and-forget; never throws. */
async function sendTableOpenedEmail(params: {
  to: string
  restaurantName: string
  guestName: string
  dateKey: string
  time: string
  partySize: number
  zoneName: string | null
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  try {
    const resend = new Resend(apiKey)
    const from = process.env.RESEND_FROM_EMAIL?.trim() || 'onboarding@resend.dev'
    const restaurant = escapeHtml(params.restaurantName)
    const firstName = escapeHtml(params.guestName.split(/\s+/)[0] || 'there')
    const dateLabel = escapeHtml(formatDate(params.dateKey))
    const timeLabel = escapeHtml(formatTime(params.time))
    const seating = params.zoneName ? escapeHtml(params.zoneName) : 'the dining room'

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>A table opened up — ${restaurant}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
  <tr><td style="background:#0c1a2e;border-radius:14px 14px 0 0;padding:28px 32px;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.14em;color:#4ade80;text-transform:uppercase;">${restaurant}</p>
    <p style="margin:0;font-size:22px;font-weight:700;color:#f8fafc;letter-spacing:-0.01em;">A table just opened up</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:24px 32px 8px;">
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;line-height:1.6;">Hi ${firstName} — you asked us to let you know, so here we are. The time you wanted is free again.</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e2e8f0;border-radius:10px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 6px;font-size:13px;color:#64748b;">When</p>
        <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;">${dateLabel} at ${timeLabel}</p>
        <p style="margin:0 0 6px;font-size:13px;color:#64748b;">Party</p>
        <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;">${params.partySize} ${params.partySize === 1 ? 'guest' : 'guests'} · ${seating}</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:4px 32px 28px;">
    <p style="margin:16px 0 0;font-size:13px;color:#475569;line-height:1.6;">It is not held yet — tables that free up go quickly. Reply to this email or open the chat on our site and we will lock it in for you.</p>
  </td></tr>
  <tr><td style="padding:14px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">Sent by ${restaurant} via OceanCore</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

    const result = await resend.emails.send({
      from,
      to: params.to,
      subject: `A table opened up at ${params.restaurantName} — ${formatDate(params.dateKey)}, ${formatTime(params.time)}`,
      html,
      text: `Hi ${params.guestName.split(/\s+/)[0] || 'there'} — the time you wanted at ${params.restaurantName} is free again: ${formatDate(params.dateKey)} at ${formatTime(params.time)}, ${params.partySize} ${params.partySize === 1 ? 'guest' : 'guests'}.\n\nIt is not held yet. Reply to this email or open the chat on our site and we will lock it in.`,
    })
    if (result.error) console.error('[email] Waitlist guest error:', result.error)
  } catch (err) {
    console.error('[email] Unexpected error sending waitlist opening:', err)
  }
}

/** Fire-and-forget; never throws. */
async function sendOwnerWaitlistEmail(params: {
  to: string | null
  restaurantName: string
  guestName: string
  phone: string | null
  email: string | null
  dateKey: string
  time: string
  partySize: number
  zoneName: string | null
  /** True when we could not reach the guest ourselves and staff must phone them. */
  needsCall: boolean
}) {
  const to = params.to?.trim()
  const apiKey = process.env.RESEND_API_KEY
  if (!to || !apiKey) return
  try {
    const resend = new Resend(apiKey)
    const from = process.env.RESEND_FROM_EMAIL?.trim() || 'onboarding@resend.dev'
    const restaurant = escapeHtml(params.restaurantName)
    const guest = escapeHtml(params.guestName)
    const dateLabel = escapeHtml(formatDate(params.dateKey))
    const timeLabel = escapeHtml(formatTime(params.time))
    const seating = params.zoneName ? escapeHtml(params.zoneName) : 'Main dining'
    const contact = params.phone?.trim()
      ? escapeHtml(params.phone.trim())
      : params.email
        ? escapeHtml(params.email)
        : 'no contact on file'

    const headline = params.needsCall
      ? 'Call a waitlisted guest'
      : 'Waitlisted guest notified'
    const accent = params.needsCall ? '#f59e0b' : '#4ade80'
    const lead = params.needsCall
      ? `A table freed up for <strong>${guest}</strong>, who left a phone number rather than an email — so this one is a call.`
      : `A table freed up and we have emailed <strong>${guest}</strong> to offer it. Nothing is held yet; expect them to reply.`

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${headline} — ${restaurant}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
  <tr><td style="background:#0c1a2e;border-radius:14px 14px 0 0;padding:28px 32px;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.14em;color:${accent};text-transform:uppercase;">Waitlist</p>
    <p style="margin:0;font-size:22px;font-weight:700;color:#f8fafc;letter-spacing:-0.01em;">${headline}</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:24px 32px 28px;">
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;line-height:1.6;">${lead}</p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e2e8f0;border-radius:10px;">
      <tr><td style="padding:14px 16px;font-size:14px;color:#0f172a;line-height:1.9;">
        <strong>Guest</strong> ${guest}<br/>
        <strong>Contact</strong> ${contact}<br/>
        <strong>When</strong> ${dateLabel} at ${timeLabel}<br/>
        <strong>Party</strong> ${params.partySize} · ${seating}
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:14px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">OceanCore</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

    const result = await resend.emails.send({
      from,
      to,
      subject: params.needsCall
        ? `Call ${params.guestName} — a table opened for ${formatDate(params.dateKey)}, ${formatTime(params.time)}`
        : `Waitlist offered: ${params.guestName} — ${formatDate(params.dateKey)}, ${formatTime(params.time)}`,
      html,
      text: `${headline}\n\nGuest: ${params.guestName}\nContact: ${params.phone || params.email || 'none on file'}\nWhen: ${formatDate(params.dateKey)} at ${formatTime(params.time)}\nParty: ${params.partySize} (${params.zoneName ?? 'Main dining'})`,
    })
    if (result.error) console.error('[email] Waitlist owner error:', result.error)
  } catch (err) {
    console.error('[email] Unexpected error sending waitlist owner alert:', err)
  }
}
