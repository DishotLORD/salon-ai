'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabase'

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

const fontStack =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const labelStyle = {
  display: 'block' as const,
  fontSize: 12,
  fontWeight: 700,
  color: '#6b7280',
  letterSpacing: '0.04em',
  marginBottom: 6,
}

const inputStyle = {
  width: '100%' as const,
  borderRadius: 10,
  border: '1px solid #d1d5db',
  padding: '12px 13px',
  fontSize: 14,
  outline: 'none' as const,
  background: '#fff',
  color: '#111827',
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
          background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          fontFamily: fontStack,
          color: '#64748b',
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
        background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 45%, #e8eef4 100%)',
        fontFamily: fontStack,
        color: '#111827',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          borderRadius: 20,
          border: '1px solid rgba(226, 232, 240, 0.95)',
          background: 'rgba(255, 255, 255, 0.92)',
          boxShadow: '0 24px 48px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.8) inset',
          padding: '28px 28px 26px',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
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

        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', letterSpacing: '0.06em' }}>
              STEP {step} OF {TOTAL_STEPS}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8' }}>
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 999,
              background: '#e2e8f0',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPercent}%`,
                borderRadius: 999,
                background: 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)',
                transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          </div>
        </div>

        {step === 1 && (
          <>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                fontWeight: 700,
                color: '#0f172a',
              }}
            >
              Tell us about your business
            </h1>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
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
                color: '#0f172a',
              }}
            >
              Set up your AI agent
            </h1>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
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
                  fontFamily: fontStack,
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
                color: '#0f172a',
              }}
            >
              You&apos;re all set!
            </h1>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
              Here is a quick summary. You can change anything later in Settings.
            </p>

            <div
              style={{
                marginTop: 22,
                padding: 18,
                borderRadius: 14,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
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
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em' }}>
                  SYSTEM PROMPT
                </p>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: 13,
                    color: '#475569',
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

        {error ? (
          <p style={{ color: '#dc2626', margin: '18px 0 0', fontSize: 14, lineHeight: 1.45 }}>{error}</p>
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
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
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
                    ? '#fca5a5'
                    : '#dc2626',
                color: '#fff',
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
                background: saving ? '#fca5a5' : '#dc2626',
                color: '#fff',
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
      </div>

      <p style={{ marginTop: 28, fontSize: 12, color: '#94a3b8', letterSpacing: '0.02em' }}>
        &copy; {new Date().getFullYear()} Salon AI
      </p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em' }}>{label}</p>
      <p style={{ margin: '5px 0 0', fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{value}</p>
    </div>
  )
}
