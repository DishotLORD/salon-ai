import { NextResponse } from 'next/server'

import { VENUE_TIMEZONE_STATUS } from '@/lib/booking-wall-clock'

/**
 * Uptime probe. Point Vercel monitoring, Better Stack, Pingdom or a status page
 * at this — hitting `/` instead would only prove that a static shell rendered,
 * which stays true while the database is unreachable and every booking is
 * failing.
 *
 * It reports which integrations are configured but never their values, and it
 * returns 503 when a dependency the product cannot work without is down, so an
 * alert fires on the thing that actually broke.
 */
export const dynamic = 'force-dynamic'

type Check = { ok: boolean; detail?: string; ms?: number }

const TIMEOUT_MS = 4000

/** Ask Supabase's auth service for its health — no table, no RLS, no secret. */
async function checkDatabase(): Promise<Check> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) return { ok: false, detail: 'not_configured' }

  const startedAt = Date.now()
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    return {
      ok: res.ok,
      ms: Date.now() - startedAt,
      detail: res.ok ? undefined : `http_${res.status}`,
    }
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - startedAt,
      detail: err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'unreachable',
    }
  }
}

export async function GET() {
  const database = await checkDatabase()

  /*
   * Config presence, not reachability: calling OpenAI or Stripe on every probe
   * would bill us for monitoring. A missing key is still worth surfacing — that
   * is the failure mode of a fresh deploy where an env var never made it over.
   */
  const configured = {
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    supabase_admin: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    email: Boolean(process.env.RESEND_API_KEY?.trim()),
    payments: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    payment_webhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    address_lookup: Boolean(process.env.GEOAPIFY_API_KEY?.trim()),
    distributed_rate_limit: Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim()),
  }

  // The concierge cannot answer a guest without the model or the database, and
  // it cannot write a booking without the service-role key. Everything else
  // degrades: no Stripe means no deposits, no Resend means no confirmation mail.
  const critical = database.ok && configured.openai && configured.supabase_admin
  const degraded = !configured.email || !configured.payments

  return NextResponse.json(
    {
      status: critical ? (degraded ? 'degraded' : 'ok') : 'down',
      time: new Date().toISOString(),
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
      region: process.env.VERCEL_REGION ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      // Reservations are interpreted per business (businesses.timezone), so
      // there is no single deployment timezone any more. Reported so ops can
      // spot a legacy NEXT_PUBLIC_BUSINESS_TIMEZONE still set and delete it.
      timezone: VENUE_TIMEZONE_STATUS,
      checks: { database },
      configured,
    },
    {
      status: critical ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
