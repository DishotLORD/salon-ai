'use client'

import { useEffect, useRef } from 'react'

export default function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    let animId = 0
    let t = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const w = canvas.width
      const h = canvas.height
      t += 0.005

      // Dark base
      ctx.fillStyle = '#040d1a'
      ctx.fillRect(0, 0, w, h)

      // BIG aurora blob 1 - cyan/blue
      const g1 = ctx.createRadialGradient(
        w * 0.3 + Math.sin(t * 0.5) * w * 0.15,
        h * 0.4 + Math.cos(t * 0.3) * h * 0.1,
        0,
        w * 0.3,
        h * 0.4,
        w * 0.6,
      )
      g1.addColorStop(0, 'rgba(56,189,248,0.35)')
      g1.addColorStop(0.5, 'rgba(14,165,233,0.15)')
      g1.addColorStop(1, 'rgba(14,165,233,0)')
      ctx.fillStyle = g1
      ctx.fillRect(0, 0, w, h)

      // BIG aurora blob 2 - purple
      const g2 = ctx.createRadialGradient(
        w * 0.7 + Math.sin(t * 0.4 + 1) * w * 0.12,
        h * 0.3 + Math.cos(t * 0.6) * h * 0.08,
        0,
        w * 0.7,
        h * 0.3,
        w * 0.55,
      )
      g2.addColorStop(0, 'rgba(139,92,246,0.30)')
      g2.addColorStop(0.5, 'rgba(99,102,241,0.12)')
      g2.addColorStop(1, 'rgba(99,102,241,0)')
      ctx.fillStyle = g2
      ctx.fillRect(0, 0, w, h)

      // BIG aurora blob 3 - teal
      const g3 = ctx.createRadialGradient(
        w * 0.5 + Math.sin(t * 0.35 + 2) * w * 0.2,
        h * 0.6 + Math.cos(t * 0.4 + 1) * h * 0.12,
        0,
        w * 0.5,
        h * 0.6,
        w * 0.5,
      )
      g3.addColorStop(0, 'rgba(34,211,238,0.25)')
      g3.addColorStop(0.5, 'rgba(6,182,212,0.10)')
      g3.addColorStop(1, 'rgba(6,182,212,0)')
      ctx.fillStyle = g3
      ctx.fillRect(0, 0, w, h)

      animId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  )
}
