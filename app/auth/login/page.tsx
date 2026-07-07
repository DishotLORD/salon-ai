'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { OceanCoreLogoCompact } from '@/components/oceancore-logo'
import { Suspense, useEffect, useRef, useState } from 'react'

import { supabase } from '@/lib/supabase'

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M2.25 12s3.75-6 9.75-6 9.75 6 9.75 6-3.75 6-9.75 6-9.75-6-9.75-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 3 21 21" />
      <path d="M10.58 10.58a2 2 0 0 0 2.84 2.84" />
      <path d="M9.88 5.08A10.88 10.88 0 0 1 12 4.88c6 0 9.75 6 9.75 6a17.82 17.82 0 0 1-3.14 3.68" />
      <path d="M6.23 6.22A18.1 18.1 0 0 0 2.25 12s3.75 6 9.75 6c1.53 0 2.93-.3 4.2-.8" />
    </svg>
  )
}

type FloatingFieldProps = {
  id: string
  label: string
  type: string
  value: string
  focused: boolean
  onChange: (v: string) => void
  onFocus: () => void
  onBlur: () => void
  icon: React.ReactNode
  rightSlot?: React.ReactNode
  autoComplete?: string
}

function FloatingField({ id, label, type, value, focused, onChange, onFocus, onBlur, icon, rightSlot, autoComplete }: FloatingFieldProps) {
  const active = focused || value.length > 0
  return (
    <motion.div
      className="relative mb-[14px]"
      style={{ borderRadius: 13, borderWidth: 1, borderStyle: 'solid' }}
      animate={{
        borderColor: focused ? 'rgba(56,189,248,0.55)' : 'rgba(255,255,255,0.10)',
        background: focused ? 'rgba(56,189,248,0.05)' : 'rgba(255,255,255,0.035)',
        boxShadow: focused ? '0 0 0 3px rgba(56,189,248,0.10)' : '0 0 0 0px rgba(56,189,248,0)',
      }}
      transition={{ duration: 0.2 }}
    >
      <span
        className="pointer-events-none absolute flex"
        style={{ left: 15, top: '50%', transform: 'translateY(-50%)' }}
      >
        <motion.span animate={{ color: active ? '#38bdf8' : 'rgba(242,247,252,0.40)' }} transition={{ duration: 0.2 }}>
          {icon}
        </motion.span>
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        autoComplete={autoComplete}
        className="w-full border-none bg-transparent text-[15px] text-[#f2f7fc] outline-none"
        style={{ padding: '23px 44px 9px 43px', borderRadius: 13, caretColor: '#38bdf8' }}
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute"
        style={{
          left: 43,
          top: active ? 7 : 16,
          fontSize: active ? 10 : 14.5,
          fontWeight: active ? 600 : 400,
          letterSpacing: active ? '0.12em' : 0,
          textTransform: active ? 'uppercase' : 'none',
          color: active ? '#38bdf8' : 'rgba(242,247,252,0.40)',
          transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {label}
      </label>
      {rightSlot}
    </motion.div>
  )
}

function BrandPanel() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const tryPlay = () => {
      video.play().catch(() => {
        const resume = () => { video.play().catch(() => {}); window.removeEventListener('pointerdown', resume) }
        window.addEventListener('pointerdown', resume, { once: true })
      })
    }
    tryPlay()
    video.addEventListener('canplay', tryPlay)
    const onVisible = () => { if (document.visibilityState === 'visible') tryPlay() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      video.removeEventListener('canplay', tryPlay)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const features = [
    'Reply to every guest in seconds, 24/7',
    'Reservations and waitlists on autopilot',
    'Live in under five minutes',
  ]

  return (
    <aside
      className="relative isolate flex flex-col justify-between overflow-hidden"
      style={{ padding: '48px 56px 52px', background: '#050f1c' }}
    >
      {/* fallback gradient */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, zIndex: -3,
          background: 'radial-gradient(130% 100% at 25% 18%, #0f476b 0%, #0a3150 34%, #061d31 64%, #03101e 100%)',
        }}
      />
      <video
        ref={videoRef}
        autoPlay muted loop playsInline preload="auto"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -2 }}
      >
        <source src="https://ffophqyrencnuxpkwlqk.supabase.co/storage/v1/object/public/media/ocean.mp4" type="video/mp4" />
      </video>
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, zIndex: -1,
          background: 'linear-gradient(180deg, rgba(3,14,26,0.55) 0%, rgba(3,14,26,0.30) 38%, rgba(3,14,26,0.78) 100%), linear-gradient(100deg, rgba(3,14,26,0.62) 0%, rgba(3,14,26,0.20) 55%, rgba(3,14,26,0.05) 100%)',
        }}
      />

      {/* Logo */}
      <div className="relative z-10">
        <OceanCoreLogoCompact theme="dark" />
      </div>

      {/* Hero */}
      <div className="relative z-10" style={{ maxWidth: 460 }}>
        <div
          className="mb-[22px] inline-flex items-center gap-2"
          style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#38bdf8' }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 12px #38bdf8', flexShrink: 0 }} />
          AI Concierge for hospitality
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: 'clamp(34px, 3vw, 46px)', fontWeight: 600,
            lineHeight: 1.08, letterSpacing: '-0.015em', marginBottom: 20,
            color: '#f2f7fc',
            textShadow: '0 2px 24px rgba(0,0,0,0.6)',
          }}
        >
          Service that{' '}
          <em style={{ fontStyle: 'italic', color: '#38bdf8' }}>never</em>{' '}
          misses a guest.
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(242,247,252,0.80)', maxWidth: 400 }}>
          Your AI Concierge answers questions, books tables, and handles special requests around the clock — so your team can focus on the floor.
        </p>

        <div className="mt-[34px] flex flex-col gap-4">
          {features.map((feat) => (
            <div key={feat} className="flex items-center gap-[13px]">
              <span
                className="grid shrink-0 place-items-center"
                style={{
                  width: 26, height: 26, borderRadius: 8,
                  background: 'rgba(56,189,248,0.14)',
                  border: '1px solid rgba(56,189,248,0.28)',
                  color: '#38bdf8',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span style={{ fontSize: 14.5, fontWeight: 500, color: 'rgba(242,247,252,0.82)' }}>{feat}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        className="relative z-10 flex items-center gap-4"
        style={{ paddingTop: 26, borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className="grid shrink-0 place-items-center"
          style={{
            width: 40, height: 40, borderRadius: 11,
            background: 'rgba(56,189,248,0.12)',
            border: '1px solid rgba(56,189,248,0.30)',
          }}
        >
          <span
            className="pulse-dot"
            style={{ width: 9, height: 9, borderRadius: '50%', background: '#4ade80' }}
          />
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.45, color: 'rgba(242,247,252,0.62)' }}>
          <strong style={{ color: '#f2f7fc', fontWeight: 700 }}>Real people, on call 24/7.</strong>{' '}
          Our team helps you launch and answers whenever you need it.
        </p>
      </div>
    </aside>
  )
}

function LoginContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    setInfo('')
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }
    const userId = data.user?.id
    if (!userId) { window.location.replace('/dashboard'); return }
    const { data: business } = await supabase.from('businesses').select('id').eq('user_id', userId).maybeSingle()
    window.location.replace(business ? '/dashboard' : '/onboarding')
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setInfo('')
    setLoading(true)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthError) { setError(oauthError.message); setLoading(false) }
  }

  const handleForgotPassword = async () => {
    setError('')
    setInfo('')
    if (!email.trim()) { setError('Enter your email above so we can send a reset link.'); return }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/login`,
    })
    if (resetError) { setError(resetError.message); return }
    setInfo('Reset link sent. Check your inbox.')
  }

  return (
    <div
      className="split-auth grid min-h-screen"
      style={{ gridTemplateColumns: '1.05fr 1fr' }}
    >
      <BrandPanel />

      {/* Form panel */}
      <main
        className="relative flex items-center justify-center"
        style={{
          padding: '48px 40px',
          background: 'radial-gradient(120% 80% at 90% 0%, rgba(56,189,248,0.06) 0%, transparent 50%), #0a1828',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: '100%', maxWidth: 384 }}
        >
          {/* Head */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#38bdf8', marginBottom: 10 }}>
              Welcome back
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-playfair), Georgia, serif',
                fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.12,
                color: '#f2f7fc',
              }}
            >
              Sign in to OceanCore
            </h2>
            <p style={{ marginTop: 9, fontSize: 14.5, lineHeight: 1.5, color: 'rgba(242,247,252,0.62)' }}>
              Step back into your command deck and keep service moving.
            </p>
          </div>

          {/* Google SSO — primary */}
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={loading}
            className={cn(
              'flex w-full items-center justify-center gap-[11px] transition',
              loading && 'pointer-events-none opacity-70',
            )}
            style={{
              height: 50, borderRadius: 13, border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.96)',
              color: '#1f2937', fontSize: 14.5, fontWeight: 600,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 26px rgba(0,0,0,0.35)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.96)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="my-5 flex items-center gap-[14px]">
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.06em', color: 'rgba(242,247,252,0.26)', textTransform: 'uppercase' }}>
              or sign in with email
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); void handleLogin() }}>
            <FloatingField
              id="l-email"
              label="Email address"
              type="email"
              value={email}
              focused={emailFocused}
              onChange={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              autoComplete="email"
              icon={
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M3.75 7.5h16.5v9a1.5 1.5 0 0 1-1.5 1.5h-13.5a1.5 1.5 0 0 1-1.5-1.5v-9Z" />
                  <path d="m4.5 8.25 7.01 5.2a.83.83 0 0 0 .98 0l7.01-5.2" />
                </svg>
              }
            />

            <FloatingField
              id="l-pw"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              focused={passwordFocused}
              onChange={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              autoComplete="current-password"
              icon={
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M7.5 10.5V8.25a4.5 4.5 0 1 1 9 0v2.25" />
                  <rect x="5.25" y="10.5" width="13.5" height="9" rx="2.25" />
                  <path d="M12 13.75v2.5" />
                </svg>
              }
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute flex items-center justify-center text-[rgba(242,247,252,0.40)] transition-colors hover:text-[rgba(242,247,252,0.70)]"
                  style={{ right: 14, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              }
            />

            {/* Forgot password */}
            <div className="mb-[18px] mt-[-4px] flex justify-end pr-0.5">
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                style={{ fontSize: 12.5, color: 'rgba(242,247,252,0.40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.16s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#38bdf8' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(242,247,252,0.40)' }}
              >
                Forgot password?
              </button>
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2"
              style={{
                height: 50, marginTop: 4, borderRadius: 13, border: 'none',
                background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
                color: '#04121f', fontSize: 15, fontWeight: 700, letterSpacing: '0.01em',
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.75 : 1,
                boxShadow: '0 8px 22px rgba(14,165,233,0.32)',
                transition: 'transform 0.14s, box-shadow 0.18s, filter 0.18s',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 12px 30px rgba(14,165,233,0.45)'
                  e.currentTarget.style.filter = 'brightness(1.04)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = '0 8px 22px rgba(14,165,233,0.32)'
                e.currentTarget.style.filter = ''
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
              {!loading && (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              )}
            </button>
          </form>

          {/* Error / Info */}
          <AnimatePresence>
            {error ? (
              <motion.p
                key="err"
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                style={{ marginTop: 12, fontSize: 13, color: '#fca5a5', lineHeight: 1.45 }}
              >
                {error}
              </motion.p>
            ) : info ? (
              <motion.p
                key="info"
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                style={{ marginTop: 12, fontSize: 13, color: '#7dd3fc', lineHeight: 1.45 }}
              >
                {info}
              </motion.p>
            ) : null}
          </AnimatePresence>

          {/* Sign up link */}
          <p style={{ marginTop: 24, textAlign: 'center', fontSize: 14, color: 'rgba(242,247,252,0.40)' }}>
            New to OceanCore?{' '}
            <Link href="/auth/signup" style={{ color: '#38bdf8', fontWeight: 600, textDecoration: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
            >
              Create an account
            </Link>
          </p>

          {/* Trust line */}
          <div className="mt-[22px] flex items-center justify-center gap-4" style={{ fontSize: 12, color: 'rgba(242,247,252,0.26)' }}>
            <span className="inline-flex items-center gap-[6px]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" style={{ opacity: 0.55 }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
              </svg>
              Bank-grade security
            </span>
            <span className="inline-flex items-center gap-[6px]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" style={{ opacity: 0.55 }}>
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
              </svg>
              99.9% uptime
            </span>
          </div>
        </motion.div>
      </main>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#050f1c' }} />}>
      <LoginContent />
    </Suspense>
  )
}
