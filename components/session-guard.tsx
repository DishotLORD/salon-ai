'use client'

import { useEffect } from 'react'

import { isProtectedPath, loginPathFor } from '@/lib/auth-routes'
import { supabase } from '@/lib/supabase'

/**
 * Keeps an open dashboard honest between navigations.
 *
 * The proxy decides who may *load* a page, but a tab left open all afternoon
 * never asks it anything. If the owner signs out in another tab, or an admin
 * revokes the session, or the refresh token is rejected, this tab would go on
 * showing guest names and phone numbers until someone clicked a link. Supabase
 * broadcasts those events to every tab; here they end the page.
 *
 * Lives in the root layout on purpose. Mounted inside the dashboard layout it
 * was useless in the one case that matters most: a page the browser replayed
 * from its cache after logout hangs in a half-streamed Suspense boundary, and
 * anything rendered below it never mounts. The root shell always hydrates.
 *
 * Sends the guest back to the login form with the current path remembered, so
 * signing in again lands where they were.
 */
export function SessionGuard() {
  useEffect(() => {
    // Public pages have their own signed-out UI; only guard what is gated.
    if (!isProtectedPath(window.location.pathname)) return

    let done = false

    const toLogin = () => {
      if (done) return
      done = true
      // Full replace, not a router push: it drops the rendered dashboard from
      // the client router cache and leaves no history entry behind it.
      window.location.replace(loginPathFor(window.location.pathname, window.location.search))
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION fires once the client has read storage, so a null
      // session there is not "not loaded yet" — it is "nobody is signed in".
      // That is the case a page served from the browser's cache lands in:
      // the HTML is a signed-in render, the cookie is long gone.
      if (session) return
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        toLogin()
      }
    })

    // Restored from the back/forward cache: the tokens may have died while the
    // page sat frozen, so confirm before showing it again.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) toLogin()
      })
    }

    window.addEventListener('pageshow', onPageShow)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      data.subscription.unsubscribe()
    }
  }, [])

  return null
}
