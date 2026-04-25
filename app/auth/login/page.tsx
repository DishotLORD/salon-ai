'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { supabase } from '@/lib/supabase'

type AuthMode = 'login' | 'register'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mode = searchParams.get('mode')
    setAuthMode(mode === 'signup' ? 'register' : 'login')
  }, [searchParams])

  useEffect(() => {
    function syncViewport() {
      setIsMobile(window.innerWidth < 900)
    }
    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const userId = data.user?.id
    if (!userId) {
      window.location.replace('/dashboard')
      return
    }
    const { data: business } = await supabase.from('businesses').select('id').eq('user_id', userId).maybeSingle()
    window.location.replace(business ? '/dashboard' : '/onboarding')
  }

  const handleSignUp = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    window.location.replace('/onboarding')
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  const handlePrimaryAction = () => {
    if (authMode === 'login') {
      void handleLogin()
    } else {
      void handleSignUp()
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#ffffff',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <section
        style={{
          flex: 1,
          minHeight: isMobile ? 240 : '100vh',
          background:
            'radial-gradient(circle at 18% 18%, rgba(220, 38, 38, 0.28), transparent 48%), linear-gradient(155deg, #0f172a 0%, #111827 52%, #3f0b0b 100%)',
          color: '#e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          padding: isMobile ? '28px 22px' : '56px 52px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 520 }}>
          <div>
            <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.02em', color: '#ffffff' }}>Salon AI</div>
            <div style={{ marginTop: 10, width: 40, height: 3, background: '#dc2626' }} />
          </div>
          <p
            style={{
              margin: '16px 0 0',
              fontSize: isMobile ? 20 : 28,
              lineHeight: 1.2,
              color: '#f3f4f6',
              fontWeight: 600,
            }}
          >
            AI-powered operations for modern salons
          </p>
          <div style={{ marginTop: 24, display: 'grid', gap: 10, color: '#d1d5db', fontSize: 15 }}>
            <p style={{ margin: 0 }}>• Smart booking assistant</p>
            <p style={{ margin: 0 }}>• Automated client follow-ups</p>
            <p style={{ margin: 0 }}>• Real-time business insights</p>
          </div>
        </div>
      </section>

      <section
        style={{
          flex: 1,
          minHeight: isMobile ? 'auto' : '100vh',
          background: '#ffffff',
          display: 'grid',
          placeItems: 'center',
          padding: isMobile ? '22px 16px 30px' : '32px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#111827' }}>
            {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 15 }}>
            {authMode === 'login' ? 'Securely access your dashboard' : 'Create your Salon AI account'}
          </p>

          <div style={{ marginTop: 22 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 700,
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
                  fontWeight: 700,
                  color: '#4b5563',
                  letterSpacing: '0.04em',
                }}
              >
                PASSWORD
              </label>
              <a href="#" style={{ fontSize: 12, color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>
                Forgot?
              </a>
            </div>

            <input
              type="password"
              placeholder="••••••••"
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
            type="button"
            onClick={handlePrimaryAction}
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
            {loading
              ? authMode === 'login'
                ? 'Signing In...'
                : 'Creating account...'
              : authMode === 'login'
                ? 'Sign In'
                : 'Register'}
          </button>

          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={loading}
            style={{
              marginTop: 10,
              width: '100%',
              borderRadius: 10,
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              padding: '10px 12px',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.72 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                display: 'inline-block',
                backgroundImage: 'url(https://developers.google.com/identity/images/g-logo.png)',
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            />
            Google
          </button>

          <p style={{ margin: '14px 0 0', fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
            {authMode === 'login' ? (
              <>
                New to Salon AI?{' '}
                <Link href="/auth/login?mode=signup" style={{ color: '#dc2626', fontWeight: 600, textDecoration: 'none' }}>
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <Link href="/auth/login" style={{ color: '#dc2626', fontWeight: 600, textDecoration: 'none' }}>
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </section>
    </div>
  )
}