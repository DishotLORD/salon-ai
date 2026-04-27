'use client'

import { useEffect, useRef } from 'react'

const ACCENT = 'rgba(56, 189, 248, 0.55)'
const ACCENT_HOVER = 'rgba(56, 189, 248, 0.85)'

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null)
  const target = useRef({ x: 0, y: 0 })
  const current = useRef({ x: 0, y: 0 })
  const hover = useRef(false)
  const raf = useRef<number>(0)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    if (window.matchMedia('(pointer: coarse)').matches) {
      return
    }

    const dot = dotRef.current
    if (!dot) {
      return
    }

    document.documentElement.classList.add('ocean-cursor-active')

    const onMove = (e: MouseEvent) => {
      target.current.x = e.clientX
      target.current.y = e.clientY
    }

    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) {
        return
      }
      if (t.closest('a, button, [role="button"], input, textarea, select, label')) {
        hover.current = true
      }
    }

    const onOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null
      if (!related || !related.closest('a, button, [role="button"], input, textarea, select, label')) {
        hover.current = false
      }
    }

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t

    const tick = () => {
      const l = hover.current ? 0.28 : 0.18
      current.current.x = lerp(current.current.x, target.current.x, l)
      current.current.y = lerp(current.current.y, target.current.y, l)
      const size = hover.current ? 48 : 28
      const border = hover.current ? '1.5px' : '1px'
      dot.style.transform = `translate3d(${current.current.x - size / 2}px, ${current.current.y - size / 2}px, 0) scale(${hover.current ? 1.08 : 1})`
      dot.style.width = `${size}px`
      dot.style.height = `${size}px`
      dot.style.borderWidth = border
      dot.style.background = hover.current ? ACCENT_HOVER : ACCENT
      raf.current = requestAnimationFrame(tick)
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseover', onOver, true)
    document.addEventListener('mouseout', onOut, true)
    raf.current = requestAnimationFrame(tick)

    return () => {
      document.documentElement.classList.remove('ocean-cursor-active')
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseover', onOver, true)
      document.removeEventListener('mouseout', onOut, true)
      cancelAnimationFrame(raf.current)
    }
  }, [])

  return (
    <div
      ref={dotRef}
      aria-hidden
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: 28,
        height: 28,
        borderRadius: '50%',
        border: `1px solid ${ACCENT}`,
        background: ACCENT,
        pointerEvents: 'none',
        zIndex: 99999,
        willChange: 'transform, width, height',
        mixBlendMode: 'screen',
        display: 'none',
      }}
      className="ocean-custom-cursor-dot"
    />
  )
}
