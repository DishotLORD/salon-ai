import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

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

  return NextResponse.redirect(new URL('/dashboard', request.url))
}
