'use client'

import { useEffect, useRef, useState } from 'react'

const VIDEO_SRC =
  'https://ffophqyrencnuxpkwlqk.supabase.co/storage/v1/object/public/media/ocean.mp4'

/**
 * The moving backdrop behind the sign-in and sign-up panels.
 *
 * The file is 47 MB and the storage bucket serves it with `no-cache`, so the
 * browser re-fetches it on every single visit — and with `preload="auto"` it
 * did so before the login form's own scripts and styles had finished loading.
 * Landing on this page repeatedly, which is exactly what signing out and
 * pressing Back does, left the panel dark while the download hogged the
 * connection.
 *
 * So: nothing is fetched until the page has finished loading, and the video
 * fades in once it can actually play. Until then the gradient underneath is
 * the panel — the page never looks broken, just quieter for a moment. Readers
 * who asked for less motion get the gradient and no download at all.
 */
export function AuthBrandVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let cancelled = false
    let startTimer: number | undefined

    const tryPlay = () => {
      void video.play().catch(() => {
        // Autoplay blocked until the visitor interacts with the page.
        const resume = () => {
          void video.play().catch(() => {})
          window.removeEventListener('pointerdown', resume)
        }
        window.addEventListener('pointerdown', resume, { once: true })
      })
    }

    const begin = () => {
      if (cancelled) return
      // Assigning src is what starts the download; preload="none" holds it
      // back until here.
      video.src = VIDEO_SRC
      tryPlay()
    }

    // Wait for the page itself to be done, then a beat more.
    if (document.readyState === 'complete') {
      startTimer = window.setTimeout(begin, 200)
    } else {
      window.addEventListener('load', () => {
        startTimer = window.setTimeout(begin, 200)
      }, { once: true })
    }

    const onCanPlay = () => {
      setVisible(true)
      tryPlay()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && video.src) tryPlay()
    }

    video.addEventListener('canplay', onCanPlay)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      if (startTimer) window.clearTimeout(startTimer)
      video.removeEventListener('canplay', onCanPlay)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      // Abandon a half-finished download instead of letting it run on a page
      // the visitor has already left.
      video.removeAttribute('src')
      video.load()
    }
  }, [])

  return (
    <video
      ref={videoRef}
      aria-hidden
      muted
      loop
      playsInline
      preload="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        zIndex: -2,
        opacity: visible ? 1 : 0,
        transition: 'opacity 700ms ease-out',
      }}
    />
  )
}
