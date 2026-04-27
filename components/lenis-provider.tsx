'use client'

import { startTransition, useLayoutEffect, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import { LenisReadyContext } from '@/components/lenis-context'
import { createLenis, destroyLenis } from '@/lib/lenis'

gsap.registerPlugin(ScrollTrigger)

let tickerFn: ((time: number) => void) | null = null

export function LenisProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(0)

  useLayoutEffect(() => {
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
  }, [])

  return <LenisReadyContext.Provider value={ready}>{children}</LenisReadyContext.Provider>
}
