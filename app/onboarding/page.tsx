'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabase'
import { tabContent } from '@/lib/ocean-motion'

const TOTAL_STEPS = 3

const businessTypeOptions = [
  { value: 'salon', label: 'Salon' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'spa', label: 'Spa' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'other', label: 'Other' },
] as const

type BusinessTypeValue = (typeof businessTypeOptions)[number]['value']

const systemPromptPlaceholder = `Example: You are the AI concierge for [Business Name]. Be warm, concise, and professional. Help clients book appointments, answer questions about services and hours, and offer to connect them with a human for billing or sensitive topics.`

const labelStyle = {
  display: 'block' as const,
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--ocean-text-muted)',
  letterSpacing: '0.04em',
  marginBottom: 6,
}

const inputStyle = {
  width: '100%' as const,
  borderRadius: 'var(--ocean-radius-md)',
  border: '1px solid var(--ocean-border)',
  padding: '12px 13px',
  fontSize: 14,
  outline: 'none' as const,
  background: 'var(--ocean-surface)',
  color: 'var(--ocean-text)',
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [authChecked, setAuthChecked] = useState(false)

  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessTypeValue>('salon')
  const [agentName, setAgentName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled) {
        return
      }
      if (!user) {
        router.replace('/auth/login')
        return
      }
      setAuthChecked(true)
    }

    void checkAuth()
    return () => {
      cancelled = true
    }
  }, [router])

  const progressPercent = (step / TOTAL_STEPS) * 100

  const canGoNextFromStep1 = businessName.trim().length > 0
  const canGoNextFromStep2 = agentName.trim().length > 0 && systemPrompt.trim().length > 0

  const goNext = () => {
    setError('')
    if (step === 1 && !canGoNextFromStep1) {
      return
    }
    if (step === 2 && !canGoNextFromStep2) {
      return
    }
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1)
    }
  }

  const goBack = () => {
    setError('')
    if (step > 1) {
      setStep((s) => s - 1)
    }
  }

  const handleFinish = async () => {
    setError('')
    setSaving(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/auth/login')
        return
      }

      const { error: insertError } = await supabase.from('businesses').insert({
        user_id: user.id,
        name: businessName.trim(),
        business_type: businessType,
        agent_name: agentName.trim(),
        system_prompt: systemPrompt.trim(),
      })

      if (insertError) {
        setError(insertError.message ?? 'Could not save your business. Please try again.')
        setSaving(false)
        return
      }

      router.replace('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  if (!authChecked) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--ocean-deep)',
          color: 'var(--ocean-text-muted)',
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px 40px',
        background: 'var(--ocean-canvas)',
        backgroundColor: 'var(--ocean-deep)',
        color: 'var(--ocean-text)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: '100%',
          maxWidth: 520,
          borderRadius: 'var(--ocean-radius-xl)',
          border: '1px solid var(--ocean-border)',
          background: 'var(--ocean-card)',
          boxShadow: 'var(--ocean-shadow-lg)',
          padding: '28px 28px 26px',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <img src="/logo.png" alt="OceanCore" width={52} height={52} style={{ display: 'block', borderRadius: 12 }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--ocean-sky)' }}>OCEANCORE</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ocean-text)', marginTop: 2 }}>Onboarding</div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ocean-text-muted)', letterSpacing: '0.06em' }}>
              STEP {step} OF {TOTAL_STEPS}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ocean-text-subtle)' }}>
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 999,
              background: 'var(--ocean-surface)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                borderRadius: 999,
                background: 'linear-gradient(90deg, var(--ocean-sky) 0%, var(--ocean-sand-deep) 100%)',
                transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step} custom={1} variants={tabContent} initial="initial" animate="animate" exit="exit">
        {step === 1 && (
          <>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                fontWeight: 700,
                color: 'var(--ocean-text)',
              }}
            >
              Tell us about your business
            </h1>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ocean-text-muted)', lineHeight: 1.5 }}>
              We will use this to personalize your workspace and AI assistant.
            </p>

            <div style={{ marginTop: 24 }}>
              <label style={labelStyle}>BUSINESS NAME</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Lumière Salon & Spa"
                style={{ ...inputStyle, marginBottom: 20 }}
              />

              <label style={labelStyle}>BUSINESS TYPE</label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as BusinessTypeValue)}
                style={{ ...inputStyle, cursor: 'pointer', marginBottom: 0 }}
              >
                {businessTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                fontWeight: 700,
                color: 'var(--ocean-text)',
              }}
            >
              Set up your AI agent
            </h1>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ocean-text-muted)', lineHeight: 1.5 }}>
              Choose how your assistant introduces itself and how it should behave with customers.
            </p>

            <div style={{ marginTop: 24 }}>
              <label style={labelStyle}>AGENT NAME</label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="e.g. Lumière Concierge"
                style={{ ...inputStyle, marginBottom: 20 }}
              />

              <label style={labelStyle}>SYSTEM PROMPT</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={systemPromptPlaceholder}
                rows={6}
                style={{
                  ...inputStyle,
                  minHeight: 140,
                  resize: 'vertical' as const,
                  lineHeight: 1.5,
                    fontFamily: 'inherit',
                }}
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                fontWeight: 700,
                color: 'var(--ocean-text)',
              }}
            >
              You&apos;re all set!
            </h1>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ocean-text-muted)', lineHeight: 1.5 }}>
              Here is a quick summary. You can change anything later in Settings.
            </p>

            <div
              style={{
                marginTop: 22,
                padding: 18,
                borderRadius: 14,
                background: 'var(--ocean-surface)',
                border: '1px solid var(--ocean-border)',
                display: 'grid',
                gap: 14,
              }}
            >
              <SummaryRow label="Business" value={businessName.trim()} />
              <SummaryRow
                label="Type"
                value={businessTypeOptions.find((o) => o.value === businessType)?.label ?? businessType}
              />
              <SummaryRow label="Agent" value={agentName.trim()} />
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--ocean-text-subtle)', letterSpacing: '0.06em' }}>
                  SYSTEM PROMPT
                </p>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: 13,
                    color: 'var(--ocean-text-muted)',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {systemPrompt.trim()}
                </p>
              </div>
            </div>
          </>
        )}
          </motion.div>
        </AnimatePresence>

        {error ? (
          <p style={{ color: 'var(--ocean-danger)', margin: '18px 0 0', fontSize: 14, lineHeight: 1.45 }}>{error}</p>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginTop: 26,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={goBack}
            disabled={step === 1 || saving}
            style={{
              borderRadius: 10,
              border: '1px solid var(--ocean-border)',
              background: 'var(--ocean-surface)',
              color: 'var(--ocean-text)',
              fontWeight: 600,
              fontSize: 14,
              padding: '11px 20px',
              cursor: step === 1 || saving ? 'not-allowed' : 'pointer',
              opacity: step === 1 ? 0.45 : 1,
            }}
          >
            Back
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={
                saving || (step === 1 && !canGoNextFromStep1) || (step === 2 && !canGoNextFromStep2)
              }
              style={{
                border: 'none',
                borderRadius: 10,
                background:
                  saving || (step === 1 && !canGoNextFromStep1) || (step === 2 && !canGoNextFromStep2)
                    ? 'var(--ocean-surface)'
                    : 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)',
                color:
                  saving || (step === 1 && !canGoNextFromStep1) || (step === 2 && !canGoNextFromStep2)
                    ? 'var(--ocean-text-subtle)'
                    : 'var(--ocean-black)',
                fontWeight: 700,
                fontSize: 14,
                padding: '11px 22px',
                cursor:
                  saving || (step === 1 && !canGoNextFromStep1) || (step === 2 && !canGoNextFromStep2)
                    ? 'not-allowed'
                    : 'pointer',
                marginLeft: 'auto',
              }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleFinish()}
              disabled={saving}
              style={{
                border: 'none',
                borderRadius: 10,
                background: saving ? 'var(--ocean-surface)' : 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)',
                color: saving ? 'var(--ocean-text-subtle)' : 'var(--ocean-black)',
                fontWeight: 700,
                fontSize: 14,
                padding: '11px 22px',
                cursor: saving ? 'not-allowed' : 'pointer',
                marginLeft: 'auto',
              }}
            >
              {saving ? 'Saving…' : 'Go to Dashboard'}
            </button>
          )}
        </div>
      </motion.div>

      <p style={{ marginTop: 28, fontSize: 12, color: 'var(--ocean-text-subtle)', letterSpacing: '0.02em' }}>
        &copy; {new Date().getFullYear()} OceanCore
      </p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--ocean-text-subtle)', letterSpacing: '0.06em' }}>
        {label}
      </p>
      <p style={{ margin: '5px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--ocean-text)' }}>{value}</p>
    </div>
  )
}
