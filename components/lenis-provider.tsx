'use client'

import { startTransition, useLayoutEffect, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePathname } from 'next/navigation'

import { LenisReadyContext } from '@/components/lenis-context'
import { createLenis, destroyLenis } from '@/lib/lenis'

gsap.registerPlugin(ScrollTrigger)

let tickerFn: ((time: number) => void) | null = null

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

    lenis.on('scroll', ScrollTrigger.update)

    tickerFn = (time: number) => {
      lenis.raf(time * 1000)
    }
    gsap.ticker.add(tickerFn)
    gsap.ticker.lagSmoothing(0)

    ScrollTrigger.scrollerProxy(document.documentElement, {
      scrollTop(value) {
        if (typeof value === 'number') {
          lenis.scrollTo(value, { immediate: true })
        }
        return lenis.scroll
      },
      getBoundingClientRect() {
        return {
          top: 0,
          left: 0,
          width: window.innerWidth,
          height: window.innerHeight,
          right: window.innerWidth,
          bottom: window.innerHeight,
        }
      },
      pinType: document.documentElement.style.transform ? 'transform' : 'fixed',
    })

    startTransition(() => setReady((n) => n + 1))
    requestAnimationFrame(() => ScrollTrigger.refresh())

    return () => {
      if (tickerFn) {
        gsap.ticker.remove(tickerFn)
        tickerFn = null
      }
      destroyLenis()
      ScrollTrigger.refresh()
    }
  }, [enabled])

  return <LenisReadyContext.Provider value={ready}>{children}</LenisReadyContext.Provider>
}
