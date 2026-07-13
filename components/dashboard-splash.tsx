'use client'

import { useLayoutEffect, useState } from 'react'

import { OceanCoreLoader } from '@/components/oceancore-loader'

/** Set right before redirecting into the dashboard after login/signup/onboarding. */
export const WELCOME_SPLASH_FLAG = 'oc-welcome-splash'

/** How long the full draw-in choreography plays before fading out (ms). */
const HOLD_MS = 4200
const FADE_MS = 650

/**
 * Post-login welcome splash: plays the full OceanCore draw-in animation over
 * the dashboard, then dissolves. Triggered by a one-shot sessionStorage flag
 * (email login / signup / onboarding) or ?welcome=1 (OAuth callback redirect),
 * so regular navigation and reloads never show it.
 */
export function DashboardSplash() {
  const [phase, setPhase] = useState<'hidden' | 'show' | 'fading'>('hidden')

  useLayoutEffect(() => {
    let triggered = false
    try {
      if (sessionStorage.getItem(WELCOME_SPLASH_FLAG) === '1') {
        sessionStorage.removeItem(WELCOME_SPLASH_FLAG)
        triggered = true
      }
    } catch { /* storage blocked — skip the splash */ }

    const url = new URL(window.location.href)
    if (url.searchParams.get('welcome') === '1') {
      url.searchParams.delete('welcome')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
      triggered = true
    }

    if (!triggered) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot pre-paint gate: the trigger lives in sessionStorage/URL, unreadable during SSR
    setPhase('show')
    const fadeTimer = window.setTimeout(() => setPhase('fading'), HOLD_MS)
    const doneTimer = window.setTimeout(() => setPhase('hidden'), HOLD_MS + FADE_MS)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(doneTimer)
    }
  }, [])

  if (phase === 'hidden') return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        opacity: phase === 'fading' ? 0 : 1,
        transition: `opacity ${FADE_MS}ms cubic-bezier(.22,1,.36,1)`,
        pointerEvents: phase === 'fading' ? 'none' : 'auto',
      }}
    >
      <OceanCoreLoader background="var(--t-bg-app)" />
    </div>
  )
}
