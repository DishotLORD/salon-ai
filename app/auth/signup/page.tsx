'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { BrandTransitionLink } from '@/components/brand-transition-link'
import { OceanCoreLogoCompact } from '@/components/oceancore-logo'
import { useEffect, useRef, useState } from 'react'

import { WELCOME_SPLASH_FLAG } from '@/components/dashboard-splash'
import { defaultSystemPrompt } from '@/lib/default-system-prompt'
import { supabase } from '@/lib/supabase'
import { VENUE_TYPE_OPTIONS, type VenueType } from '@/lib/venue-types'

// ─── Validation ───────────────────────────────────────────────

const RULES = {
  email: {
    test: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
    message: 'Enter a valid email address',
  },
  password: {
    test: (v: string) => v.length >= 6 && /^[\x20-\x7EÀ-ɏ]+$/.test(v),
    message: 'Min. 6 characters, no unusual symbols',
  },
  businessName: {
    test: (v: string) => v.trim().length >= 2 && /^[\p{L}\p{N}\s\-'&.,!()]+$/u.test(v.trim()),
    message: 'Use letters, numbers and common punctuation only',
  },
  address: {
    test: (v: string) => v.trim().length === 0 || /^[\p{L}\p{N}\s\-'.,/#]+$/u.test(v.trim()),
    message: 'Use letters, numbers, spaces and common symbols only',
  },
  agentName: {
    test: (v: string) => v.trim().length >= 2 && /^[\p{L}\p{N}\s\-'.]+$/u.test(v.trim()),
    message: 'Use letters, numbers, spaces, hyphens or apostrophes only',
  },
  phone: {
    test: (v: string) => v.trim().length === 0 || /^[+\d\s\-().]{7,20}$/.test(v.trim()),
    message: 'Use digits, spaces, +, - or () only (7–20 characters)',
  },
}

function validate(field: keyof typeof RULES, value: string): string {
  if (!RULES[field].test(value)) return RULES[field].message
  return ''
}

// ─── Types ────────────────────────────────────────────────────

const businessTypeOptions = VENUE_TYPE_OPTIONS
type BusinessTypeValue = VenueType

const TOTAL_STEPS = 4

// ─── Field components ─────────────────────────────────────────

const labelBase: React.CSSProperties = {
  display: 'block',
  fontSize: 11, fontWeight: 700, letterSpacing: '0.09em',
  textTransform: 'uppercase', color: 'rgba(242,247,252,0.40)',
  marginBottom: 7,
}

const inputBase: React.CSSProperties = {
  width: '100%', borderRadius: 13,
  border: '1px solid rgba(255,255,255,0.10)',
  padding: '13px 14px', fontSize: 14.5,
  background: 'rgba(255,255,255,0.035)',
  color: '#f2f7fc', outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.18s, background 0.18s, box-shadow 0.18s',
  appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box',
}

function PField({
  label, type = 'text', value, onChange, placeholder, hint, optional, autoFocus,
  validateKey, forceError,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void
  placeholder?: string; hint?: string; optional?: boolean; autoFocus?: boolean
  validateKey?: keyof typeof RULES; forceError?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [touched, setTouched] = useState(false)
  const fieldError = validateKey && (touched || forceError) && value.trim().length > 0
    ? validate(validateKey, value) : ''
  const isErr = !!fieldError
  return (
    <div style={{ marginBottom: 15 }}>
      <label style={labelBase}>
        {label}
        {optional && (
          <span style={{ fontWeight: 400, letterSpacing: 0, textTransform: 'none', color: 'rgba(242,247,252,0.26)', marginLeft: 6 }}>
            optional
          </span>
        )}
      </label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setTouched(true) }}
        style={{
          ...inputBase,
          borderColor: isErr ? 'rgba(248,113,113,0.6)' : focused ? 'rgba(56,189,248,0.55)' : 'rgba(255,255,255,0.10)',
          background: isErr ? 'rgba(248,113,113,0.06)' : focused ? 'rgba(56,189,248,0.05)' : 'rgba(255,255,255,0.035)',
          boxShadow: isErr ? '0 0 0 3px rgba(248,113,113,0.08)' : focused ? '0 0 0 3px rgba(56,189,248,0.10)' : 'none',
        }}
      />
      <AnimatePresence>
        {isErr ? (
          <motion.p
            key="err"
            initial={{ opacity: 0, y: -4, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }} transition={{ duration: 0.18 }}
            style={{ margin: '5px 0 0', fontSize: 11.5, color: '#fca5a5', lineHeight: 1.4 }}
          >
            ✕ {fieldError}
          </motion.p>
        ) : hint ? (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgba(242,247,252,0.26)', lineHeight: 1.45 }}>{hint}</p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function PPasswordField({ label, value, onChange, forceError }: {
  label: string; value: string; onChange: (v: string) => void; forceError?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [touched, setTouched] = useState(false)
  const [show, setShow] = useState(false)
  const fieldError = (touched || forceError) && value.length > 0 ? validate('password', value) : ''
  const isErr = !!fieldError
  return (
    <div style={{ marginBottom: 15 }}>
      <label style={labelBase}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="Min. 6 characters"
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setTouched(true) }}
          style={{
            ...inputBase, paddingRight: 44,
            borderColor: isErr ? 'rgba(248,113,113,0.6)' : focused ? 'rgba(56,189,248,0.55)' : 'rgba(255,255,255,0.10)',
            background: isErr ? 'rgba(248,113,113,0.06)' : focused ? 'rgba(56,189,248,0.05)' : 'rgba(255,255,255,0.035)',
            boxShadow: isErr ? '0 0 0 3px rgba(248,113,113,0.08)' : focused ? '0 0 0 3px rgba(56,189,248,0.10)' : 'none',
          }}
        />
        <button
          type="button" onClick={() => setShow((p) => !p)}
          style={{
            position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(242,247,252,0.40)', display: 'flex', padding: 3,
          }}
        >
          {show ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M2.25 12s3.75-6 9.75-6 9.75 6 9.75 6-3.75 6-9.75 6-9.75-6-9.75-6Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M3 3 21 21" /><path d="M10.58 10.58a2 2 0 0 0 2.84 2.84" />
              <path d="M9.88 5.08A10.88 10.88 0 0 1 12 4.88c6 0 9.75 6 9.75 6a17.82 17.82 0 0 1-3.14 3.68" />
              <path d="M6.23 6.22A18.1 18.1 0 0 0 2.25 12s3.75 6 9.75 6c1.53 0 2.93-.3 4.2-.8" />
            </svg>
          )}
        </button>
      </div>
      <AnimatePresence>
        {isErr && (
          <motion.p
            key="err"
            initial={{ opacity: 0, y: -4, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }} transition={{ duration: 0.18 }}
            style={{ margin: '5px 0 0', fontSize: 11.5, color: '#fca5a5', lineHeight: 1.4 }}
          >
            ✕ {fieldError}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

function PSelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void
  options: readonly { value: string; label: string }[]
}) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: 15 }}>
      <label style={labelBase}>{label}</label>
      <div style={{ position: 'relative' }}>
        <select
          value={value} onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            ...inputBase, cursor: 'pointer', paddingRight: 34,
            borderColor: focused ? 'rgba(56,189,248,0.55)' : 'rgba(255,255,255,0.10)',
            background: focused ? 'rgba(56,189,248,0.05)' : 'rgba(255,255,255,0.035)',
            boxShadow: focused ? '0 0 0 3px rgba(56,189,248,0.10)' : 'none',
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} style={{ background: '#0c1d30' }}>{o.label}</option>
          ))}
        </select>
        <span
          aria-hidden
          style={{
            position: 'absolute', right: 15, top: '50%', transform: 'translateY(-50%)',
            width: 0, height: 0, pointerEvents: 'none',
            borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
            borderTop: '5px solid rgba(242,247,252,0.40)',
          }}
        />
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '11px 15px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(242,247,252,0.40)', minWidth: 92, flexShrink: 0, paddingTop: 1 }}>
        {label}
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 500, color: 'rgba(242,247,252,0.88)', lineHeight: 1.4 }}>{value}</span>
    </div>
  )
}

// ─── Brand panel (signup variant) ─────────────────────────────

function SignupBrandPanel() {
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
    'Guided setup in under five minutes',
    'No credit card required to begin',
    'Cancel anytime — your data stays yours',
  ]

  return (
    <aside
      className="relative isolate flex flex-col justify-between overflow-hidden"
      style={{ padding: '48px 56px 52px', background: '#050f1c' }}
    >
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
      <BrandTransitionLink href="/" className="relative z-10 inline-block" ariaLabel="Back to OceanCore home">
        <OceanCoreLogoCompact theme="dark" />
      </BrandTransitionLink>

      {/* Hero */}
      <div className="relative z-10" style={{ maxWidth: 460 }}>
        <div
          className="mb-[22px] inline-flex items-center gap-2"
          style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#38bdf8' }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 12px #38bdf8', flexShrink: 0 }} />
          Free to start
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
          Launch your AI Concierge{' '}
          <em style={{ fontStyle: 'italic', color: '#38bdf8' }}>today.</em>
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(242,247,252,0.62)', maxWidth: 400 }}>
          Set up your venue in four quick steps. No credit card, no engineers, no waiting — just a smarter front of house.
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
          <strong style={{ color: '#f2f7fc', fontWeight: 700 }}>Support that never logs off.</strong>{' '}
          Real people guide your setup and stay one message away, 24/7.
        </p>
      </div>
    </aside>
  )
}

// ─── Main page ─────────────────────────────────────────────────

export default function SignupPage() {
  const [step, setStep] = useState(1)
  const [dir, setDir] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [forceErrors, setForceErrors] = useState(false)

  const [authEmail, setAuthEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessTypeValue>('restaurant')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [agentName, setAgentName] = useState('')

  const stepErrors: Record<number, string[]> = {
    1: [validate('email', authEmail), validate('password', password)].filter(Boolean),
    2: [validate('businessName', businessName), address ? validate('address', address) : ''].filter(Boolean),
    3: [validate('agentName', agentName), phone ? validate('phone', phone) : ''].filter(Boolean),
    4: [],
  }

  const canNext =
    stepErrors[step].length === 0 &&
    (step === 1
      ? authEmail.trim().length > 0 && password.length > 0
      : step === 2
        ? businessName.trim().length > 0
        : step === 3
          ? agentName.trim().length > 0
          : true)

  const goNext = () => {
    setForceErrors(true)
    if (!canNext) return
    setForceErrors(false)
    setError('')
    setDir(1)
    setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  }

  const goBack = () => {
    setError('')
    setForceErrors(false)
    setDir(-1)
    setStep((s) => Math.max(s - 1, 1))
  }

  const handleLaunch = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email: authEmail, password })
      if (signUpErr) { setError(signUpErr.message); setLoading(false); return }
      const userId = signUpData.user?.id
      if (!userId) { setError('Could not create account. Please try again.'); setLoading(false); return }
      const { error: bizErr } = await supabase.from('businesses').insert({
        user_id: userId,
        name: businessName.trim(),
        business_type: businessType,
        address: address.trim() || null,
        email: authEmail.trim(),
        phone: phone.trim() || null,
        agent_name: agentName.trim(),
        system_prompt: defaultSystemPrompt(businessName, businessType, agentName.trim() || null),
      })
      if (bizErr) { setError(bizErr.message); setLoading(false); return }
      try { sessionStorage.setItem(WELCOME_SPLASH_FLAG, '1') } catch { /* storage blocked */ }
      window.location.replace('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    setLoading(true)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthError) { setError(oauthError.message); setLoading(false) }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stepVariants: any = {
    initial: (d: number) => ({ opacity: 0, x: d > 0 ? 26 : -26 }),
    animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
    exit: (d: number) => ({ opacity: 0, x: d > 0 ? -20 : 20, transition: { duration: 0.18 } }),
  }

  const pct = Math.round((step / TOTAL_STEPS) * 100)

  return (
    <div
      className="split-auth grid min-h-screen"
      style={{ gridTemplateColumns: '1.05fr 1fr' }}
    >
      <SignupBrandPanel />

      {/* Form panel */}
      <main
        className="relative flex items-center justify-center"
        style={{
          padding: '48px 40px',
          background: 'radial-gradient(120% 80% at 90% 0%, rgba(56,189,248,0.06) 0%, transparent 50%), #0a1828',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ width: '100%', maxWidth: 384 }}>

          {/* Progress */}
          <div style={{ marginBottom: 26 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(242,247,252,0.40)' }}>
                Step {step} of {TOTAL_STEPS}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(242,247,252,0.26)' }}>{pct}%</span>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 3, borderRadius: 99,
                    flex: i < step ? 1 : undefined,
                    width: i < step ? undefined : 9,
                    background: i < step
                      ? 'linear-gradient(90deg, #38bdf8, #0ea5e9)'
                      : 'rgba(255,255,255,0.10)',
                    transition: 'all 0.4s cubic-bezier(0.4,0,0.2,1)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step} custom={dir} variants={stepVariants} initial="initial" animate="animate" exit="exit">

              {step === 1 && (
                <>
                  <div style={{ marginBottom: 28 }}>
                    <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.12, color: '#f2f7fc', margin: 0 }}>
                      Create your account
                    </h2>
                    <p style={{ marginTop: 9, fontSize: 14.5, lineHeight: 1.5, color: 'rgba(242,247,252,0.62)' }}>
                      You&apos;ll use this to sign in to your dashboard.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleGoogle()}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-[11px]"
                    style={{
                      height: 50, marginBottom: 18, borderRadius: 13,
                      border: '1px solid rgba(255,255,255,0.10)',
                      background: 'rgba(255,255,255,0.96)',
                      color: '#1f2937', fontSize: 14.5, fontWeight: 600,
                      cursor: 'pointer', transition: 'transform 0.14s, box-shadow 0.18s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 26px rgba(0,0,0,0.35)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.96)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                  >
                    <svg width="19" height="19" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span>Sign up with Google</span>
                  </button>

                  <div className="mb-5 flex items-center gap-[14px]">
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                    <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: '0.06em', color: 'rgba(242,247,252,0.26)', textTransform: 'uppercase' }}>or with email</span>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  </div>

                  <PField
                    label="Email" type="email" value={authEmail} onChange={setAuthEmail}
                    placeholder="you@yourvenue.com" autoFocus
                    validateKey="email" forceError={forceErrors}
                  />
                  <PPasswordField label="Password" value={password} onChange={setPassword} forceError={forceErrors} />
                </>
              )}

              {step === 2 && (
                <>
                  <div style={{ marginBottom: 28 }}>
                    <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.12, color: '#f2f7fc', margin: 0 }}>
                      Your venue
                    </h2>
                    <p style={{ marginTop: 9, fontSize: 14.5, lineHeight: 1.5, color: 'rgba(242,247,252,0.62)' }}>
                      Your AI Concierge uses this to introduce itself to guests.
                    </p>
                  </div>
                  <PField
                    label="Venue name" value={businessName} onChange={setBusinessName}
                    placeholder="e.g. The Garage" autoFocus
                    validateKey="businessName" forceError={forceErrors}
                  />
                  <PSelectField
                    label="Venue type" value={businessType}
                    onChange={(v) => setBusinessType(v as BusinessTypeValue)}
                    options={businessTypeOptions}
                  />
                  <PField
                    label="Address" value={address} onChange={setAddress}
                    placeholder="123 Main St, Calgary, AB" optional
                    validateKey="address" forceError={forceErrors}
                  />
                </>
              )}

              {step === 3 && (
                <>
                  <div style={{ marginBottom: 28 }}>
                    <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.12, color: '#f2f7fc', margin: 0 }}>
                      Almost there
                    </h2>
                    <p style={{ marginTop: 9, fontSize: 14.5, lineHeight: 1.5, color: 'rgba(242,247,252,0.62)' }}>
                      A couple more details to finish setting up your space.
                    </p>
                  </div>
                  <PField
                    label="Concierge name" value={agentName} onChange={setAgentName}
                    placeholder={businessName ? `${businessName} Concierge` : 'e.g. Marea Concierge'}
                    hint="How the AI introduces itself to guests." autoFocus
                    validateKey="agentName" forceError={forceErrors}
                  />
                  <PField
                    label="Phone" value={phone} onChange={setPhone}
                    placeholder="(403) 555-0100" optional
                    hint="Shown to guests who need to reach you directly."
                    validateKey="phone" forceError={forceErrors}
                  />
                </>
              )}

              {step === 4 && (
                <>
                  <div style={{ marginBottom: 28 }}>
                    <h2 style={{ fontFamily: 'var(--font-playfair), Georgia, serif', fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.12, color: '#f2f7fc', margin: 0 }}>
                      You&apos;re all set
                    </h2>
                    <p style={{ marginTop: 9, fontSize: 14.5, lineHeight: 1.5, color: 'rgba(242,247,252,0.62)' }}>
                      Review your details and launch your dashboard.
                    </p>
                  </div>
                  <div style={{
                    borderRadius: 16, border: '1px solid rgba(255,255,255,0.10)',
                    background: 'rgba(255,255,255,0.03)', overflow: 'hidden', marginBottom: 14,
                  }}>
                    <SummaryRow label="Email" value={authEmail || '—'} />
                    <SummaryRow label="Venue" value={businessName || '—'} />
                    <SummaryRow label="Type" value={businessTypeOptions.find((o) => o.value === businessType)?.label ?? businessType} />
                    {address && <SummaryRow label="Address" value={address} />}
                    <SummaryRow label="Concierge" value={agentName || (businessName ? `${businessName} Concierge` : '—')} />
                    {phone && <SummaryRow label="Phone" value={phone} />}
                  </div>
                  <div style={{
                    padding: '11px 14px', borderRadius: 11,
                    background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.20)',
                    fontSize: 12.5, color: 'rgba(242,247,252,0.62)', lineHeight: 1.5,
                    display: 'flex', gap: 9,
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" />
                    </svg>
                    <span>A default AI prompt is generated for your concierge. Customise it anytime in Settings → AI.</span>
                  </div>
                </>
              )}

            </motion.div>
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p
                key="err"
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ margin: '12px 0 0', fontSize: 13, color: '#fca5a5', lineHeight: 1.45 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Nav */}
          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            {step > 1 && (
              <button
                type="button" onClick={goBack} disabled={loading}
                style={{
                  flexShrink: 0, minWidth: 92, height: 48, borderRadius: 13,
                  border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)',
                  color: 'rgba(242,247,252,0.62)', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'background 0.16s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              >
                ← Back
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button" onClick={goNext}
                style={{
                  flex: 1, height: 48, borderRadius: 13, border: 'none',
                  background: canNext
                    ? 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)'
                    : 'rgba(255,255,255,0.07)',
                  color: canNext ? '#04121f' : 'rgba(242,247,252,0.26)',
                  fontSize: 15, fontWeight: 700, cursor: canNext ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  boxShadow: canNext ? '0 8px 22px rgba(14,165,233,0.30)' : 'none',
                  transition: 'transform 0.14s, box-shadow 0.18s, filter 0.18s',
                }}
                onMouseEnter={(e) => {
                  if (canNext) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(14,165,233,0.42)'; e.currentTarget.style.filter = 'brightness(1.04)' }
                }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = canNext ? '0 8px 22px rgba(14,165,233,0.30)' : 'none'; e.currentTarget.style.filter = '' }}
              >
                Continue →
              </button>
            ) : (
              <button
                type="button" onClick={() => void handleLaunch()} disabled={loading}
                style={{
                  flex: 1, height: 48, borderRadius: 13, border: 'none',
                  background: loading ? 'rgba(255,255,255,0.07)' : 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
                  color: loading ? 'rgba(242,247,252,0.26)' : '#04121f',
                  fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: loading ? 'none' : '0 8px 22px rgba(14,165,233,0.30)',
                  transition: 'transform 0.14s, box-shadow 0.18s',
                }}
                onMouseEnter={(e) => {
                  if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(14,165,233,0.42)' }
                }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = loading ? 'none' : '0 8px 22px rgba(14,165,233,0.30)' }}
              >
                {loading ? 'Launching…' : 'Launch dashboard →'}
              </button>
            )}
          </div>

          {/* Sign in link (step 1 only) */}
          {step === 1 && (
            <p style={{ marginTop: 24, textAlign: 'center', fontSize: 14, color: 'rgba(242,247,252,0.40)' }}>
              Already have an account?{' '}
              <Link
                href="/auth/login"
                style={{ color: '#38bdf8', fontWeight: 600, textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
              >
                Sign in
              </Link>
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
