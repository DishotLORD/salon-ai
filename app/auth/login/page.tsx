'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { supabase } from '@/lib/supabase'
import { fadeUp, staggerChildren } from '@/lib/ocean-motion'

type AuthMode = 'login' | 'register'

function LoginContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const authMode: AuthMode = searchParams.get('mode') === 'signup' ? 'register' : 'login'

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

  const input = {
    display: 'block' as const,
    width: '100%',
    padding: '12px 14px',
    borderRadius: 'var(--ocean-radius-md)',
    border: '1px solid var(--ocean-border)',
    background: 'var(--ocean-surface)',
    color: 'var(--ocean-text)',
    fontSize: 14,
    outline: 'none' as const,
  }

  const label = {
    display: 'block' as const,
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--ocean-text-muted)',
    letterSpacing: '0.06em',
    marginBottom: 6,
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
      }}
    >
      <motion.section
        initial={{ opacity: 0, x: isMobile ? 0 : -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{
          flex: 1,
          minHeight: isMobile ? 260 : '100vh',
          background:
            'linear-gradient(160deg, var(--ocean-black) 0%, var(--ocean-ink) 42%, var(--ocean-surface) 100%)',
          color: 'var(--ocean-text)',
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
              'radial-gradient(ellipse 80% 50% at 20% -10%, rgba(56, 189, 248, 0.25), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(232, 220, 200, 0.12), transparent)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.2,
            backgroundImage:
              'linear-gradient(rgba(125,211,252,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,0.08) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            pointerEvents: 'none',
          }}
        />
        <motion.div
          variants={staggerChildren}
          initial="hidden"
          animate="visible"
          style={{ position: 'relative', zIndex: 1, maxWidth: 520 }}
        >
          <motion.div variants={fadeUp}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.28em', color: 'var(--ocean-sky)' }}>
              OCEANCORE
            </div>
            <div style={{ marginTop: 10, width: 48, height: 3, borderRadius: 2, background: 'var(--ocean-sand)' }} />
          </motion.div>
          <motion.p
            variants={fadeUp}
            style={{
              margin: '18px 0 0',
              fontSize: isMobile ? 22 : 30,
              lineHeight: 1.15,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            Calm operations. Clear conversations. Deep automation.
          </motion.p>
          <motion.div variants={fadeUp} style={{ marginTop: 26, display: 'grid', gap: 12, color: 'var(--ocean-text-muted)', fontSize: 15 }}>
            <p style={{ margin: 0 }}>• Smart booking assistant</p>
            <p style={{ margin: 0 }}>• Automated client follow-ups</p>
            <p style={{ margin: 0 }}>• Real-time business insights</p>
          </motion.div>
        </motion.div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        style={{
          flex: 1,
          minHeight: isMobile ? 'auto' : '100vh',
          background: 'var(--ocean-mid)',
          display: 'grid',
          placeItems: 'center',
          padding: isMobile ? '28px 18px 36px' : '32px',
          borderLeft: isMobile ? 'none' : '1px solid var(--ocean-border)',
        }}
      >
        <div style={{ width: '100%', maxWidth: 400 }}>
          <motion.div key={authMode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--ocean-text)' }}>
              {authMode === 'login' ? 'Welcome back' : 'Create account'}
            </h1>
            <p style={{ margin: '10px 0 0', color: 'var(--ocean-text-muted)', fontSize: 15 }}>
              {authMode === 'login' ? 'Sign in to your OceanCore workspace' : 'Start your OceanCore workspace'}
            </p>
          </motion.div>

          <div style={{ marginTop: 26 }}>
            <label style={label}>BUSINESS EMAIL</label>
            <input
              type="email"
              placeholder="name@business.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ ...input, marginBottom: 16 }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ ...label, marginBottom: 0 }}>PASSWORD</label>
              <span style={{ fontSize: 12, color: 'var(--ocean-sky)', fontWeight: 600 }}>Forgot?</span>
            </div>

            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...input, marginBottom: 12 }}
            />
          </div>

          {error ? <p style={{ color: 'var(--ocean-danger)', margin: '0 0 12px', fontSize: 14 }}>{error}</p> : null}

          <motion.button
            type="button"
            onClick={handlePrimaryAction}
            disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 'var(--ocean-radius-md)',
              padding: '12px 14px',
              background: loading ? 'var(--ocean-surface)' : 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)',
              color: loading ? 'var(--ocean-text-subtle)' : 'var(--ocean-black)',
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : 'var(--ocean-shadow-glow)',
            }}
          >
            {loading
              ? authMode === 'login'
                ? 'Signing in…'
                : 'Creating account…'
              : authMode === 'login'
                ? 'Sign in'
                : 'Register'}
          </motion.button>

          <motion.button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            style={{
              marginTop: 12,
              width: '100%',
              borderRadius: 'var(--ocean-radius-md)',
              border: '1px solid var(--ocean-border-strong)',
              background: 'var(--ocean-surface)',
              color: 'var(--ocean-text)',
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
          </motion.button>

          <p style={{ margin: '16px 0 0', fontSize: 13, color: 'var(--ocean-text-muted)', textAlign: 'center' }}>
            {authMode === 'login' ? (
              <>
                New to OceanCore?{' '}
                <Link href="/auth/login?mode=signup" style={{ color: 'var(--ocean-sky-bright)', fontWeight: 600, textDecoration: 'none' }}>
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <Link href="/auth/login" style={{ color: 'var(--ocean-sky-bright)', fontWeight: 600, textDecoration: 'none' }}>
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </motion.section>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: 'var(--ocean-deep)' }} />
      }
    >
      <LoginContent />
    </Suspense>
  )
}
