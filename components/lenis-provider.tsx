'use client'

import { startTransition, useLayoutEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

import { LenisReadyContext } from '@/components/lenis-context'
import { createLenis, destroyLenis } from '@/lib/lenis'

/*
 * This used to drive Lenis from `gsap.ticker` and wire up ScrollTrigger with a
 * scrollerProxy — about 106 KB of GSAP on every page load, marketing and
 * dashboard alike. Nothing ever used it: the only component that built GSAP
 * animations was `ocean-landing-page.tsx`, which was replaced by `app/page.tsx`
 * long ago and is not rendered anywhere. The live landing page reveals sections
 * with an IntersectionObserver and CSS.
 *
 * So the ticker is a plain requestAnimationFrame loop now. Same smooth scroll,
 * one fewer animation engine on the wire.
 *
 * If GSAP ScrollTrigger is ever genuinely needed, re-register it here and give
 * it back the scrollerProxy — Lenis translates the document, so ScrollTrigger
 * cannot read scroll position without one.
 */

// Lenis smooth scrolling is reserved for the marketing pages. App surfaces
// (dashboard, onboarding, widget, login) have nested scroll containers and
// fixed layouts where smooth scrolling fights trackpad gestures and breaks
// inner overflow regions.
function shouldUseLenis(pathname: string | null): boolean {
  if (!pathname) {
    return true
  }
  if (pathname.startsWith('/dashboard')) return false
  if (pathname.startsWith('/onboarding')) return false
  if (pathname.startsWith('/widget')) return false
  if (pathname.startsWith('/auth')) return false
  return true
}

export function LenisProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [ready, setReady] = useState(0)
  const enabled = shouldUseLenis(pathname)

  useLayoutEffect(() => {
    if (!enabled) {
      startTransition(() => setReady((n) => n + 1))
      return
    }

    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced) {
      startTransition(() => setReady((n) => n + 1))
      return
    }

    const lenis = createLenis()
    if (!lenis) {
      startTransition(() => setReady((n) => n + 1))
      return
    }

    // rAF hands milliseconds, which is exactly what lenis.raf wants — the old
    // gsap.ticker passed seconds, hence the `* 1000` that used to live here.
    let frame = 0
    const tick = (time: number) => {
      lenis.raf(time)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    startTransition(() => setReady((n) => n + 1))

    return () => {
      cancelAnimationFrame(frame)
      destroyLenis()
    }
  }, [enabled])

  return <LenisReadyContext.Provider value={ready}>{children}</LenisReadyContext.Provider>
}
