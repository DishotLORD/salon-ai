import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

import {
  isAuthPath,
  isProtectedPath,
  isPublicPath,
  loginPathFor,
  NEXT_PARAM,
  safeNextPath,
} from '@/lib/auth-routes'

/**
 * Session plumbing and the front door for every page request. (Next 16 renamed
 * Middleware to Proxy; the file belongs at the project root, beside `app`.)
 *
 * Supabase access tokens expire after an hour and are renewed with a refresh
 * token that rotates on every use. A Server Component can read cookies but not
 * write them, so a refresh performed while rendering is thrown away — the
 * browser would keep sending a spent token until Supabase, which treats a
 * reused refresh token as a stolen one, killed the session. Refreshing here
 * and writing the rotated cookies onto the outgoing response is what lets an
 * owner reload, or come back tomorrow, and still be signed in.
 */
/**
 * Scratch pages that exist to eyeball a component locally. The page components
 * call notFound() too, but the root loading.tsx makes every response a streamed
 * one, and a streamed 404 is documented to arrive with status 200 — a soft 404.
 * Refused here, before a byte is streamed, the status is the real thing.
 */
const DEV_ONLY_PREFIXES = ['/loader-preview']

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (
    process.env.NODE_ENV === 'production' &&
    DEV_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return new NextResponse(null, { status: 404 })
  }

  // The embedded widget and its endpoints are opened by restaurant guests who
  // never have a session. Skipping them keeps a Supabase Auth round trip off
  // the path of every chat message.
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  /*
   * Only real page loads get the session treatment.
   *
   * Refresh tokens rotate, and Supabase treats a token used twice as a stolen
   * one — it kills the session. A dashboard opening fires a burst of parallel
   * requests (route handlers, prefetches, RSC segments); when every one of them
   * refreshed independently, they raced over the same token and could log the
   * owner straight back out. Route handlers authenticate themselves through
   * createClient(), and a prefetch is not a visit.
   */
  const isApi = pathname.startsWith('/api/')
  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch'
  if (isApi || isPrefetch) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh the session and find out who is asking. getUser() verifies the
  // token with Supabase Auth — getSession() would only decode the cookie the
  // browser sent, which anyone can forge.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const protectedPath = isProtectedPath(pathname)

  if (protectedPath && !user) {
    return carryCookies(
      NextResponse.redirect(new URL(loginPathFor(pathname, search), request.url)),
      supabaseResponse,
    )
  }

  if (isAuthPath(pathname) && user) {
    const destination = safeNextPath(request.nextUrl.searchParams.get(NEXT_PARAM))
    return carryCookies(
      NextResponse.redirect(new URL(destination, request.url)),
      supabaseResponse,
    )
  }

  if (protectedPath) {
    // Back after logging out must not resurrect the dashboard. no-store keeps
    // it out of the HTTP cache and out of the back/forward cache, so returning
    // to the page costs a real request — which the check above then sends to
    // the login form.
    supabaseResponse.headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, max-age=0',
    )
    supabaseResponse.headers.set('Pragma', 'no-cache')
    supabaseResponse.headers.set('Expires', '0')
  }

  return supabaseResponse
}

/** Carry refreshed auth cookies onto a redirect returned instead of the response. */
function carryCookies(redirect: NextResponse, carrier: NextResponse): NextResponse {
  carrier.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}

export const config = {
  matcher: [
    /*
     * Everything but static assets and the embed script. Auth wants to run
     * broadly: a path missed here is a path with no session refresh and no
     * gate.
     */
    '/((?!_next/static|_next/image|favicon.ico|widget.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|woff|woff2|ttf)$).*)',
  ],
}
