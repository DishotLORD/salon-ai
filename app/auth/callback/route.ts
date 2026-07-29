import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { DEFAULT_SIGNED_IN_PATH, NEXT_PARAM, safeNextPath } from '@/lib/auth-routes'
import { resolveBusinessAccessServer } from '@/lib/business-access-server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.exchangeCodeForSession(code)

  if (user) {
    // Owner OR invited staff member — staff must not be bounced to onboarding,
    // where they would end up creating a duplicate business.
    const access = await resolveBusinessAccessServer(supabase, user.id)

    if (!access) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  // Whatever page sent them to sign in, if anything — an expired session on
  // /dashboard/bookings should come back to /dashboard/bookings.
  const next = safeNextPath(url.searchParams.get(NEXT_PARAM))
  if (next !== DEFAULT_SIGNED_IN_PATH) {
    return NextResponse.redirect(new URL(next, request.url))
  }

  // ?welcome=1 triggers the one-time post-login splash (DashboardSplash).
  return NextResponse.redirect(new URL('/dashboard?welcome=1', request.url))
}
