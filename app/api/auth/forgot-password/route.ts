import { NextResponse } from 'next/server'

import { checkAuthEmail } from '@/lib/auth-email'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { absoluteUrl } from '@/lib/site-url'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Send a password-reset link for an address the guest typed.
 *
 * The browser used to call `supabase.auth.resetPasswordForEmail` directly. That
 * hits GoTrue's public `/recover` endpoint, which normalizes the address and then
 * rejects a small set of placeholder addresses — including the literal
 * `test@test.com` — with `email_address_invalid`, even though the same address
 * signs in with a password without complaint. An owner locked out of a test
 * account (or any address that denylist catches) got a confusing "invalid email"
 * while the sign-in form accepted them.
 *
 * The admin `generateLink({ type: 'recovery' })` call sends the same recovery
 * mail and accepts those addresses. So the form still runs `checkAuthEmail`
 * (normalize, then validate — the same gate as login and signup, no second
 * regex), and this route is what talks to Auth.
 *
 * A missing account is reported as success on purpose: telling a stranger whether
 * an email is registered is how account-enumeration starts.
 */

const RATE_LIMIT = 5
const RATE_WINDOW_MS = 15 * 60 * 1000

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const limit = await checkRateLimit(`forgot-password:${ip}`, RATE_LIMIT, RATE_WINDOW_MS)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many reset requests. Please wait a few minutes and try again.' },
      { status: 429 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const raw =
    body && typeof body === 'object' && 'email' in body
      ? (body as { email: unknown }).email
      : ''

  /*
   * Same function login and signup use. Normalize first (strip invisibles, trim,
   * lowercase), then validate — never a separate regex on a mere trim().
   */
  const emailCheck = checkAuthEmail(typeof raw === 'string' ? raw : '')
  if (!emailCheck.ok || !emailCheck.email) {
    return NextResponse.json(
      { error: emailCheck.message ?? 'Enter a valid email address, like name@example.com.' },
      { status: 400 },
    )
  }

  const redirectTo = absoluteUrl('/auth/reset-password', request)

  const { error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: emailCheck.email,
    options: { redirectTo },
  })

  if (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code ?? '')
      : ''
    const message = error.message?.toLowerCase() ?? ''
    // Unknown address: same success the guest would see for a real account.
    if (code === 'user_not_found' || message.includes('not found')) {
      return NextResponse.json({ ok: true })
    }
    console.error('[auth] forgot-password generateLink failed:', error.message)
    return NextResponse.json(
      { error: 'Could not send a reset link. Please try again.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
