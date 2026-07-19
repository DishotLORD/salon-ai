'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { WELCOME_SPLASH_FLAG } from '@/components/dashboard-splash'
import { defaultSystemPrompt } from '@/lib/default-system-prompt'
import { supabase } from '@/lib/supabase'
import { tabContent } from '@/lib/ocean-motion'
import { VENUE_TYPE_OPTIONS, type VenueType } from '@/lib/venue-types'

const TOTAL_STEPS = 3

const businessTypeOptions = VENUE_TYPE_OPTIONS
type BusinessTypeValue = VenueType

const labelStyle = {
  display: 'block' as const,
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--ocean-text-muted)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  marginBottom: 6,
}

const inputStyle = {
  width: '100%' as const,
  borderRadius: 10,
  border: '1px solid var(--ocean-border)',
  padding: '11px 13px',
  fontSize: 14,
  outline: 'none' as const,
  background: 'var(--ocean-surface)',
  color: 'var(--ocean-text)',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box' as const,
}

const STEPS = [
  { title: 'Your venue', subtitle: 'Tell us where you are — your concierge will use this to help guests.' },
  { title: 'Contact & notifications', subtitle: 'Where should we reach you when a new reservation comes in?' },
  { title: "You're all set!", subtitle: 'Everything looks good. You can update any of this in Settings anytime.' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [dir, setDir] = useState(1)
  const [authChecked, setAuthChecked] = useState(false)

  // Step 1
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessTypeValue>('restaurant')
  const [address, setAddress] = useState('')

  // Step 2
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [agentName, setAgentName] = useState('')

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) { router.replace('/auth/login'); return }
      // Pre-fill email from OAuth
      if (user.email) setEmail(user.email)
      setAuthChecked(true)
    }
    void checkAuth()
    return () => { cancelled = true }
  }, [router])

  const progressPercent = (step / TOTAL_STEPS) * 100

  const canNext = step === 1
    ? businessName.trim().length > 0
    : step === 2
      ? email.trim().length > 0 && agentName.trim().length > 0
      : true

  const goNext = () => {
    setError('')
    if (!canNext) return
    setDir(1)
    setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  }

  const goBack = () => {
    setError('')
    setDir(-1)
    setStep((s) => Math.max(s - 1, 1))
  }

  const handleFinish = async () => {
    setError('')
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }

      const { error: insertError } = await supabase.from('businesses').insert({
        user_id: user.id,
        name: businessName.trim(),
        business_type: businessType,
        address: address.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        agent_name: agentName.trim() || `${businessName.trim()} Concierge`,
        system_prompt: defaultSystemPrompt(
          businessName,
          businessType,
          agentName.trim() || `${businessName.trim()} Concierge`,
        ),
      })

      if (insertError) {
        setError(insertError.message ?? 'Could not save. Please try again.')
        setSaving(false)
        return
      }

      try { sessionStorage.setItem(WELCOME_SPLASH_FLAG, '1') } catch { /* storage blocked */ }
      router.replace('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  if (!authChecked) {
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: 'var(--ocean-deep)', color: 'var(--ocean-text-muted)', fontSize: 14,
      }}>
        Loading…
      </div>
    )
  }

  const stepMeta = STEPS[step - 1]

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px 40px',
      background: 'var(--ocean-canvas)',
      backgroundColor: 'var(--ocean-deep)',
      color: 'var(--ocean-text)',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: '100%',
          maxWidth: 500,
          borderRadius: 20,
          border: '1px solid var(--ocean-border)',
          background: 'var(--ocean-card)',
          boxShadow: 'var(--ocean-shadow-lg)',
          padding: '28px 28px 24px',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(145deg, rgba(14,165,233,0.22) 0%, rgba(5,13,26,0.85) 100%)',
            border: '1px solid rgba(56,189,248,0.24)',
            display: 'grid', placeItems: 'center',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12c4-4 6-4 10 0s6 4 10 0" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--ocean-sky)' }}>OCEANCORE</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ocean-text)', marginTop: 1 }}>Setup</div>
          </div>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ocean-text-muted)', letterSpacing: '0.06em' }}>
              STEP {step} OF {TOTAL_STEPS}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ocean-text-subtle)' }}>
              {Math.round(progressPercent)}%
            </span>
          </div>
          {/* Step dots */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} style={{
                flex: i < step ? 1 : undefined,
                width: i < step ? undefined : 8,
                height: 4,
                borderRadius: 99,
                background: i < step
                  ? 'linear-gradient(90deg, var(--ocean-sky), #0ea5e9)'
                  : 'var(--ocean-surface)',
                transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
              }} />
            ))}
          </div>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={tabContent}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.02em', fontWeight: 700, color: 'var(--ocean-text)' }}>
              {stepMeta.title}
            </h1>
            <p style={{ margin: '8px 0 22px', fontSize: 13.5, color: 'var(--ocean-text-muted)', lineHeight: 1.5 }}>
              {stepMeta.subtitle}
            </p>

            {step === 1 && (
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Venue name <span style={{ color: 'var(--ocean-sky)' }}>*</span></label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. The Garage"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'rgba(56,189,248,0.5)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--ocean-border)')}
                    autoFocus
                  />
                </div>
                <div>
                  <label style={labelStyle}>Venue type</label>
                  <select
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value as BusinessTypeValue)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {businessTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Address <span style={{ color: 'var(--ocean-text-subtle)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>optional</span></label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. 123 Main St, Calgary, AB"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'rgba(56,189,248,0.5)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--ocean-border)')}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Your email <span style={{ color: 'var(--ocean-sky)' }}>*</span></label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourvenue.com"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'rgba(56,189,248,0.5)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--ocean-border)')}
                  />
                  <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--ocean-text-subtle)', lineHeight: 1.4 }}>
                    We&apos;ll send reservation confirmations here.
                  </p>
                </div>
                <div>
                  <label style={labelStyle}>Phone <span style={{ color: 'var(--ocean-text-subtle)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>optional</span></label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. (403) 555-0100"
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'rgba(56,189,248,0.5)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--ocean-border)')}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Concierge name <span style={{ color: 'var(--ocean-sky)' }}>*</span></label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder={businessName ? `${businessName} Concierge` : 'e.g. Marea Concierge'}
                    style={inputStyle}
                    onFocus={e => (e.target.style.borderColor = 'rgba(56,189,248,0.5)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--ocean-border)')}
                  />
                  <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--ocean-text-subtle)', lineHeight: 1.4 }}>
                    How the AI introduces itself to guests.
                  </p>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                {/* Summary card */}
                <div style={{
                  borderRadius: 14,
                  border: '1px solid var(--ocean-border)',
                  background: 'var(--ocean-surface)',
                  overflow: 'hidden',
                }}>
                  {[
                    { label: 'Venue', value: businessName.trim() },
                    { label: 'Type', value: businessTypeOptions.find((o) => o.value === businessType)?.label ?? businessType },
                    ...(address.trim() ? [{ label: 'Address', value: address.trim() }] : []),
                    { label: 'Email', value: email.trim() },
                    ...(phone.trim() ? [{ label: 'Phone', value: phone.trim() }] : []),
                    { label: 'Concierge name', value: agentName.trim() || `${businessName.trim()} Concierge` },
                  ].map((row, i) => (
                    <div key={row.label} style={{
                      display: 'flex', alignItems: 'baseline', gap: 12,
                      padding: '13px 16px',
                      borderTop: i === 0 ? 'none' : '1px solid var(--ocean-border)',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ocean-text-subtle)', letterSpacing: '0.06em', minWidth: 96, flexShrink: 0 }}>
                        {row.label.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ocean-text)' }}>{row.value}</span>
                    </div>
                  ))}
                </div>

                <div style={{
                  marginTop: 16, padding: '12px 14px', borderRadius: 10,
                  background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)',
                  fontSize: 12.5, color: 'var(--ocean-text-muted)', lineHeight: 1.5,
                }}>
                  💡 A default system prompt will be generated for your AI Concierge. You can customise it anytime in Settings → AI.
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {error ? (
          <p style={{ color: 'var(--ocean-danger)', margin: '14px 0 0', fontSize: 13.5, lineHeight: 1.45 }}>{error}</p>
        ) : null}

        {/* Navigation */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12, marginTop: 24,
        }}>
          <button
            type="button"
            onClick={goBack}
            disabled={step === 1 || saving}
            style={{
              borderRadius: 10, border: '1px solid var(--ocean-border)',
              background: 'var(--ocean-surface)', color: 'var(--ocean-text)',
              fontWeight: 600, fontSize: 14, padding: '11px 20px',
              cursor: step === 1 || saving ? 'not-allowed' : 'pointer',
              opacity: step === 1 ? 0.4 : 1,
              fontFamily: 'inherit',
            }}
          >
            Back
          </button>

          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canNext || saving}
              style={{
                border: 'none', borderRadius: 10,
                background: canNext
                  ? 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)'
                  : 'var(--ocean-surface)',
                color: canNext ? 'var(--ocean-black)' : 'var(--ocean-text-subtle)',
                fontWeight: 700, fontSize: 14, padding: '11px 24px',
                cursor: canNext ? 'pointer' : 'not-allowed',
                marginLeft: 'auto', fontFamily: 'inherit',
              }}
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleFinish()}
              disabled={saving}
              style={{
                border: 'none', borderRadius: 10,
                background: saving
                  ? 'var(--ocean-surface)'
                  : 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)',
                color: saving ? 'var(--ocean-text-subtle)' : 'var(--ocean-black)',
                fontWeight: 700, fontSize: 14, padding: '11px 24px',
                cursor: saving ? 'not-allowed' : 'pointer',
                marginLeft: 'auto', fontFamily: 'inherit',
              }}
            >
              {saving ? 'Launching…' : 'Launch Dashboard →'}
            </button>
          )}
        </div>
      </motion.div>

      <p style={{ marginTop: 24, fontSize: 11, color: 'var(--ocean-text-subtle)', letterSpacing: '0.02em' }}>
        © {new Date().getFullYear()} OceanCore
      </p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--ocean-text-subtle)', letterSpacing: '0.06em' }}>
        {label.toUpperCase()}
      </p>
      <p style={{ margin: '5px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ocean-text)' }}>{value}</p>
    </div>
  )
}
