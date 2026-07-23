'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { OceanCoreLoader } from '@/components/oceancore-loader'

/** Long enough for the loader's full draw-in choreography (~1.8s at its
 *  current tempo); the route render that follows covers the tail. */
const NAV_DELAY_MS = 1600

/**
 * Link that plays the OceanCore draw-in loader as a full-screen interstitial,
 * then navigates. Modifier/middle clicks and reduced-motion users get plain
 * instant navigation. bfcache restores (browser Back) clear the overlay.
 */
export function BrandTransitionLink({
  href,
  className,
  style,
  ariaLabel,
  children,
}: {
  href: string
  className?: string
  style?: React.CSSProperties
  ariaLabel?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [navigating, setNavigating] = useState(false)
  const timer = useRef(0)

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setNavigating(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      window.clearTimeout(timer.current)
    }
  }, [])

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    e.preventDefault()
    router.prefetch(href)
    setNavigating(true)
    timer.current = window.setTimeout(() => router.push(href), NAV_DELAY_MS)
  }

  return (
    <>
      <Link href={href} onClick={onClick} className={className} style={style} aria-label={ariaLabel}>
        {children}
      </Link>
      {/* Portalled to body on purpose. Both auth pages place this link inside a
          panel carrying `isolate`, which is a stacking context: rendered in
          place, the overlay's z-index could not rise above that panel's
          siblings, so the sign-in column kept painting over the loader and only
          half the screen was covered. */}
      {navigating &&
        typeof document !== 'undefined' &&
        createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 4000, animation: 'btl-in .25s ease both' }}>
            <style>{'@keyframes btl-in{from{opacity:0}to{opacity:1}}'}</style>
            <OceanCoreLoader />
          </div>,
          document.body,
        )}
    </>
  )
}
