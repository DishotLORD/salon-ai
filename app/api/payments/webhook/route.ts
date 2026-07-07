import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

import { getStripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

/** Stripe webhook: keeps appointment deposit_status in sync with payments. */
export async function POST(request: Request) {
  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'payments_not_configured' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    const payload = await request.text()
    event = await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret)
  } catch (err) {
    console.error('[payments] Webhook signature verification failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const appointmentId = session.metadata?.appointment_id
      if (!appointmentId) break
      const paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null

      // A paid deposit also confirms a pending reservation.
      const { data: appt } = await supabaseAdmin
        .from('appointments')
        .select('id, status')
        .eq('id', appointmentId)
        .maybeSingle()
      if (!appt) break

      await supabaseAdmin
        .from('appointments')
        .update({
          deposit_status: 'paid',
          stripe_payment_intent_id: paymentIntentId,
          ...(appt.status === 'pending' ? { status: 'confirmed' } : {}),
        })
        .eq('id', appointmentId)
      console.log('[payments] Deposit paid for appointment:', appointmentId)
      break
    }

    case 'checkout.session.expired': {
      const session = event.data.object
      const appointmentId = session.metadata?.appointment_id
      if (!appointmentId) break
      // Only roll back if this exact session was the pending one.
      await supabaseAdmin
        .from('appointments')
        .update({ deposit_status: 'none', stripe_checkout_session_id: null })
        .eq('id', appointmentId)
        .eq('stripe_checkout_session_id', session.id)
        .eq('deposit_status', 'pending')
      break
    }

    case 'charge.refunded': {
      const charge = event.data.object
      const paymentIntentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null
      if (!paymentIntentId) break
      await supabaseAdmin
        .from('appointments')
        .update({ deposit_status: 'refunded' })
        .eq('stripe_payment_intent_id', paymentIntentId)
        .eq('deposit_status', 'paid')
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}
