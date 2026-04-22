'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const blobs = Array.from({ length: 8 }).map((_, index) => {
      const colors = ['#4a0080', '#000428', '#8b0057', '#003366', '#6600cc', '#cc0066'] as const
      const radius = 300 + Math.random() * 200
      return {
        x: Math.random(),
        y: Math.random(),
        baseRadius: radius,
        pulse: Math.random() * Math.PI * 2,
        speedX: (Math.random() - 0.5) * 0.00018,
        speedY: (Math.random() - 0.5) * 0.00018,
        pulseSpeed: 0.0007 + Math.random() * 0.00055,
        color: colors[index % colors.length],
      }
    })

    let rafId = 0
    let width = 0
    let height = 0
    let dpr = 1
    let lastTime = 0

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    }

    const draw = (time: number) => {
      const delta = lastTime ? Math.min(time - lastTime, 33) : 16
      lastTime = time

      ctx.clearRect(0, 0, width, height)

      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, '#020010')
      gradient.addColorStop(1, '#020010')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)

      ctx.globalCompositeOperation = 'screen'

      for (const blob of blobs) {
        blob.x += blob.speedX * delta
        blob.y += blob.speedY * delta
        if (blob.x < -0.2) blob.x = 1.2
        if (blob.x > 1.2) blob.x = -0.2
        if (blob.y < -0.2) blob.y = 1.2
        if (blob.y > 1.2) blob.y = -0.2
        blob.pulse += blob.pulseSpeed * delta

        const px = blob.x * width
        const py = blob.y * height
        const radius = blob.baseRadius * (0.9 + Math.sin(blob.pulse) * 0.12)

        const radial = ctx.createRadialGradient(px, py, radius * 0.25, px, py, radius)
        radial.addColorStop(0, `${blob.color}88`)
        radial.addColorStop(0.55, `${blob.color}44`)
        radial.addColorStop(1, `${blob.color}00`)
        ctx.fillStyle = radial
        ctx.beginPath()
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Subtle water reflection shimmer.
      const shimmer = ctx.createLinearGradient(0, 0, width, height)
      shimmer.addColorStop(0.1, 'rgba(255,255,255,0.02)')
      shimmer.addColorStop(0.5, 'rgba(180,220,255,0.06)')
      shimmer.addColorStop(0.9, 'rgba(255,255,255,0.015)')
      ctx.fillStyle = shimmer
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillRect(0, 0, width, height)

      ctx.globalCompositeOperation = 'source-over'
      rafId = requestAnimationFrame(draw)
    }

    resize()
    rafId = requestAnimationFrame(draw)
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  const handleLogin = async () => {
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      console.log('Logged in:', data.user?.email)
      window.location.replace('/dashboard')
    }
  }

  const handleSignUp = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setError('Аккаунт создан! Теперь войдите.')
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: 'linear-gradient(145deg, #0a0a1a 0%, #1a0a2e 100%)',
        padding: '26px 28px 18px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          pointerEvents: 'none',
        }}
      />
      <main
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 460,
            borderRadius: 20,
            border: '1px solid rgba(255, 255, 255, 0.72)',
            background: 'rgba(255, 255, 255, 0.88)',
            padding: '28px 28px 24px',
            boxShadow: '0 22px 42px rgba(15, 23, 42, 0.1)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#dc2626',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.03em',
              }}
            >
              SA
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Salon AI</div>
          </div>

          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#111827' }}>
            Welcome Back
          </h1>
          <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 14 }}>Securely access your dashboard</p>

          <div style={{ marginTop: 20 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#4b5563',
                letterSpacing: '0.04em',
                marginBottom: 6,
              }}
            >
              BUSINESS EMAIL
            </label>
            <input
              type="email"
              placeholder="name@business.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginBottom: 14,
                padding: '12px 13px',
                borderRadius: 10,
                border: '1px solid #d1d5db',
                fontSize: 14,
                outline: 'none',
              }}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#4b5563',
                  letterSpacing: '0.04em',
                }}
              >
                PASSWORD
              </label>
              <a href="#" style={{ fontSize: 12, color: '#6b7280', textDecoration: 'none' }}>
                Forgot Password?
              </a>
            </div>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginBottom: 12,
                padding: '12px 13px',
                borderRadius: 10,
                border: '1px solid #d1d5db',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          {error && <p style={{ color: '#dc2626', margin: '0 0 12px', fontSize: 14 }}>{error}</p>}

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 10,
              padding: '12px 14px',
              background: '#dc2626',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.72 : 1,
            }}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>

          <div
            style={{
              margin: '16px 0 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#9ca3af',
              fontSize: 12,
            }}
          >
            <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            <span>Or continue with</span>
            <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              type="button"
              style={{
                borderRadius: 10,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                padding: '10px 12px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Google
            </button>
            <button
              type="button"
              style={{
                borderRadius: 10,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                padding: '10px 12px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Apple
            </button>
          </div>

          <p style={{ margin: '16px 0 0', fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
            New to Salon AI?{' '}
            <button
              type="button"
              onClick={handleSignUp}
              disabled={loading}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#dc2626',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                padding: 0,
              }}
            >
              Sign up for a 14-day trial
            </button>
          </p>
        </div>
      </main>

      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#6b7280',
          fontSize: 12,
          paddingTop: 10,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span>&copy; 2024 SALON AI</span>
        <div style={{ display: 'flex', gap: 14 }}>
          <a href="#" style={{ color: '#6b7280', textDecoration: 'none' }}>
            PRIVACY
          </a>
          <a href="#" style={{ color: '#6b7280', textDecoration: 'none' }}>
            TERMS
          </a>
          <a href="#" style={{ color: '#6b7280', textDecoration: 'none' }}>
            SECURITY
          </a>
        </div>
      </footer>
    </div>
  )
}