import { NextResponse } from 'next/server'

import { depositAmountCents, parsePaymentSettings } from '@/lib/payment-settings'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { appBaseUrl, getStripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Creates a Stripe Checkout session for a reservation deposit.
 * Public (guests pay without an account); validates the appointment server-side.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rate = await checkRateLimit(`pay-checkout:${ip}`, 10, 60_000)
  if (!rate.allowed) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 })
  }

  let body: { appointment_id?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const appointmentId = typeof body.appointment_id === 'string' ? body.appointment_id.trim() : ''
  if (!appointmentId) {
    return NextResponse.json({ error: 'missing_appointment_id' }, { status: 400 })
  }

  const { data: appt } = await supabaseAdmin
    .from('appointments')
    .select('id, business_id, party_size, service_name, scheduled_at, status, deposit_status, stripe_checkout_session_id')
    .eq('id', appointmentId)
    .maybeSingle()

  if (!appt) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (appt.status === 'cancelled') {
    return NextResponse.json({ error: 'cancelled' }, { status: 409 })
  }
  if (appt.deposit_status === 'paid') {
    return NextResponse.json({ error: 'already_paid' }, { status: 409 })
  }

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, payment_settings')
    .eq('id', appt.business_id)
    .maybeSingle()
  if (!biz) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const settings = parsePaymentSettings(biz.payment_settings)
  const partySize = typeof appt.party_size === 'number' && appt.party_size > 0 ? appt.party_size : 1
  const amountCents = depositAmountCents(settings, partySize)
  if (amountCents == null) {
    return NextResponse.json({ error: 'deposits_disabled' }, { status: 409 })
  }

  const base = appBaseUrl(request)
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: partySize,
          price_data: {
            currency: 'cad',
            unit_amount: Math.round(amountCents / partySize),
            product_data: {
              name: `Reservation deposit — ${biz.name}`,
              description: `Party of ${partySize}`,
            },
          },
        },
      ],
      metadata: {
        appointment_id: appt.id,
        business_id: biz.id,
      },
      success_url: `${base}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/pay/cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    })

    await supabaseAdmin
      .from('appointments')
      .update({
        deposit_status: 'pending',
        deposit_amount_cents: amountCents,
        stripe_checkout_session_id: session.id,
      })
      .eq('id', appt.id)

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[payments] Checkout session failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'stripe_error' }, { status: 502 })
  }
}
