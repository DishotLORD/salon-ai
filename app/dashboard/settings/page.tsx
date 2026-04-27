'use client'

import { AnimatePresence, motion } from 'framer-motion'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { tabContent } from '@/lib/ocean-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TabId = 'general' | 'ai' | 'notifications' | 'widget' | 'billing'

type BusinessType = 'salon' | 'restaurant' | 'spa' | 'clinic'

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

type DayHours = { open: string; close: string; closed: boolean }

const dayOrder: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

const initialHours: Record<DayKey, DayHours> = {
  mon: { open: '09:00', close: '19:00', closed: false },
  tue: { open: '09:00', close: '19:00', closed: false },
  wed: { open: '09:00', close: '19:00', closed: false },
  thu: { open: '09:00', close: '19:00', closed: false },
  fri: { open: '09:00', close: '20:00', closed: false },
  sat: { open: '10:00', close: '18:00', closed: false },
  sun: { open: '10:00', close: '16:00', closed: false },
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [saveError, setSaveError] = useState('')
  const [showSaveToast, setShowSaveToast] = useState(false)
  const saveToastTimerRef = useRef<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [businessRowId, setBusinessRowId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [businessName, setBusinessName] = useState('Lumière Salon & Spa')
  const [businessType, setBusinessType] = useState<BusinessType>('salon')
  const [businessPhone, setBusinessPhone] = useState('+1 (415) 555-0199')
  const [businessEmail, setBusinessEmail] = useState('hello@lumiere.example.com')
  const [businessAddress, setBusinessAddress] = useState('1200 Market St, San Francisco, CA 94102')
  const [hours, setHours] = useState<Record<DayKey, DayHours>>(initialHours)

  const [systemPrompt, setSystemPrompt] = useState(
    'You are the concierge for Lumière Salon & Spa. Be warm, concise, and professional. Prioritize booking accuracy, confirm services, and escalate sensitive topics to a human.'
  )
  const [agentName, setAgentName] = useState('Lumière Concierge')
  const [language, setLanguage] = useState('English (US)')
  const [escalateAngry, setEscalateAngry] = useState(true)
  const [escalatePricing, setEscalatePricing] = useState(true)
  const [escalateMedical, setEscalateMedical] = useState(true)

  const [emailNotifs, setEmailNotifs] = useState(true)
  const [smsNotifs, setSmsNotifs] = useState(false)
  const [digest, setDigest] = useState('daily')

  const [plan, setPlan] = useState('Pro')
  const [cardLast4, setCardLast4] = useState('4242')

  const [widgetOrigin, setWidgetOrigin] = useState('')
  const [widgetCopied, setWidgetCopied] = useState(false)

  const tabs = useMemo(
    () =>
      [
        { id: 'general' as const, label: 'General' },
        { id: 'ai' as const, label: 'AI Agent' },
        { id: 'notifications' as const, label: 'Notifications' },
        { id: 'widget' as const, label: 'Widget' },
        { id: 'billing' as const, label: 'Billing' },
      ] satisfies { id: TabId; label: string }[],
    []
  )

  const widgetEmbedSnippet = useMemo(() => {
    if (!businessRowId || !widgetOrigin) {
      return ''
    }
    return `<script src="${widgetOrigin}/widget.js?id=${businessRowId}" async></script>`
  }, [businessRowId, widgetOrigin])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- origin only available on client
      setWidgetOrigin(window.location.origin)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) {
        return
      }
      const user = session?.user ?? null
      if (!user) {
        setCurrentUserId(null)
        setIsLoading(false)
        return
      }
      setCurrentUserId(user.id)
      const { data, error } = await supabase
        .from('businesses')
        .select('id, name, email, phone, business_type, address, system_prompt, agent_name, language')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!isMounted) {
        return
      }
      if (!error && data) {
        setBusinessRowId(data.id ?? null)
        setBusinessName(data.name ?? '')
        setBusinessEmail(data.email ?? '')
        setBusinessPhone(data.phone ?? '')
        setBusinessType((data.business_type as BusinessType) ?? 'salon')
        setBusinessAddress(data.address ?? '')
        setSystemPrompt(data.system_prompt ?? '')
        setAgentName(data.agent_name ?? '')
        setLanguage(data.language ?? 'English (US)')
      }
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (saveToastTimerRef.current) {
        window.clearTimeout(saveToastTimerRef.current)
      }
    }
  }, [])

  const handleSave = async () => {
    if (isSaving || isLoading) {
      return
    }

    let userId = currentUserId
    if (!userId) {
      const {
        data: { user: userFromGet },
      } = await supabase.auth.getUser()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      userId = userFromGet?.id ?? session?.user?.id ?? null
      if (userId) {
        setCurrentUserId(userId)
      }
    }

    if (!userId) {
      setSaveError('You must be signed in to save.')
      return
    }

    setIsSaving(true)
    setSaveError('')

    const payload = {
      user_id: userId,
      name: businessName,
      email: businessEmail,
      phone: businessPhone,
      business_type: businessType,
      address: businessAddress,
      system_prompt: systemPrompt,
      agent_name: agentName,
      language,
    }

    let requestError: { message?: string } | null = null

    if (businessRowId) {
      const { error } = await supabase.from('businesses').update(payload).eq('id', businessRowId)
      requestError = error
    } else {
      const { data, error } = await supabase.from('businesses').insert(payload).select('id').maybeSingle()
      requestError = error
      if (!error) {
        if (data?.id) {
          setBusinessRowId(data.id)
        } else {
          const { data: row } = await supabase
            .from('businesses')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle()
          if (row?.id) {
            setBusinessRowId(row.id)
          }
        }
      }
    }

    if (requestError) {
      setSaveError(requestError.message ?? 'Failed to save')
      setIsSaving(false)
      return
    }

    if (saveToastTimerRef.current) {
      window.clearTimeout(saveToastTimerRef.current)
    }
    setShowSaveToast(true)
    saveToastTimerRef.current = window.setTimeout(() => {
      setShowSaveToast(false)
      saveToastTimerRef.current = null
    }, 3000)

    setIsSaving(false)
  }

  const fieldLabelStyle = {
    display: 'block' as const,
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--ocean-text-muted)',
    letterSpacing: '0.04em',
    marginBottom: 6,
  }

  const inputStyle = {
    width: '100%',
    borderRadius: 10,
    border: '1px solid var(--ocean-border)',
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none' as const,
    background: 'var(--ocean-surface)',
    color: 'var(--ocean-text)',
  }

  return (
    <>
      {showSaveToast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 20,
            right: 24,
            zIndex: 9999,
            pointerEvents: 'none',
            padding: '12px 18px',
            borderRadius: 12,
            background: 'rgba(74, 222, 128, 0.15)',
            border: '1px solid rgba(74, 222, 128, 0.4)',
            color: 'var(--ocean-success)',
            fontSize: 14,
            fontWeight: 700,
            boxShadow: 'var(--ocean-shadow-lg)',
          }}
        >
          Saved!
        </div>
      )}
      <DashboardOceanNav activeNav="Settings">
        {({ isMobile, openNav }) => (
        <main style={{ flex: 1, padding: isMobile ? '16px 14px 24px' : '30px 32px 36px', overflow: 'auto', position: 'relative' }}>
          {isMobile && (
            <div style={{ marginBottom: 12 }}>
              <motion.button
                type="button"
                aria-label="Open menu"
                onClick={openNav}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  border: '1px solid var(--ocean-border)',
                  borderRadius: 'var(--ocean-radius-md)',
                  background: 'var(--ocean-surface)',
                  color: 'var(--ocean-text)',
                  width: 44,
                  height: 44,
                  fontSize: 22,
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                ☰
              </motion.button>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-end', flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 30, letterSpacing: '-0.02em', color: 'var(--ocean-text)' }}>Settings</h1>
              <p style={{ margin: '8px 0 0', color: 'var(--ocean-text-muted)', fontSize: 14 }}>
                Configure your business profile, AI behavior, and operational preferences.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              {saveError ? (
                <span style={{ color: 'var(--ocean-danger)', fontSize: 13, fontWeight: 600, textAlign: 'right', maxWidth: 320 }}>
                  {saveError}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isLoading || isSaving}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  background:
                    isLoading || isSaving
                      ? 'var(--ocean-surface)'
                      : 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)',
                  color: isLoading || isSaving ? 'var(--ocean-text-subtle)' : 'var(--ocean-black)',
                  fontWeight: 700,
                  fontSize: 14,
                  padding: '10px 16px',
                  cursor: isLoading || isSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoading ? 'Loading...' : isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              display: 'flex',
              gap: 8,
              borderBottom: '1px solid var(--ocean-border)',
              paddingBottom: 10,
              overflowX: isMobile ? 'auto' : 'visible',
              whiteSpace: isMobile ? 'nowrap' : 'normal',
            }}
          >
            {tabs.map((tab) => {
              const active = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    border: 'none',
                    borderRadius: 10,
                    padding: '9px 12px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 13,
                    color: active ? 'var(--ocean-sky-bright)' : 'var(--ocean-text-muted)',
                    background: active ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                    borderBottom: active ? '2px solid var(--ocean-sky)' : '2px solid transparent',
                    flexShrink: 0,
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          <section
            style={{
              marginTop: 16,
              background: 'var(--ocean-card)',
              border: '1px solid var(--ocean-border)',
              borderRadius: 16,
              padding: 18,
            }}
          >
            {isLoading && (
              <div style={{ display: 'grid', gap: 12 }}>
                <p style={{ margin: 0, color: 'var(--ocean-text-muted)', fontSize: 14 }}>Loading...</p>
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={`settings-skeleton-${idx}`}
                    style={{
                      height: idx % 3 === 0 ? 44 : 38,
                      borderRadius: 10,
                      background: 'var(--ocean-surface)',
                      border: '1px solid var(--ocean-border)',
                    }}
                  />
                ))}
              </div>
            )}

            <AnimatePresence mode="wait">
              {!isLoading ? (
                <motion.div
                  key={activeTab}
                  custom={1}
                  variants={tabContent}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
            {activeTab === 'general' && (
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={fieldLabelStyle}>BUSINESS NAME</label>
                    <input style={inputStyle} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                  </div>
                  <div>
                    <label style={fieldLabelStyle}>BUSINESS TYPE</label>
                    <select
                      style={inputStyle}
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value as BusinessType)}
                    >
                      <option value="salon">Salon</option>
                      <option value="restaurant">Restaurant</option>
                      <option value="spa">Spa</option>
                      <option value="clinic">Clinic</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={fieldLabelStyle}>PHONE</label>
                    <input style={inputStyle} value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} />
                  </div>
                  <div>
                    <label style={fieldLabelStyle}>EMAIL</label>
                    <input style={inputStyle} value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label style={fieldLabelStyle}>ADDRESS</label>
                  <input
                    style={inputStyle}
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                  />
                </div>

                <div>
                  <label style={fieldLabelStyle}>WORKING HOURS</label>
                  <div style={{ border: '1px solid var(--ocean-border)', borderRadius: 12, overflow: 'hidden' }}>
                    {dayOrder.map((day) => {
                      const row = hours[day.key]
                      return (
                        <div
                          key={day.key}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? '1fr' : '160px 120px 1fr 1fr',
                            gap: 10,
                            alignItems: 'center',
                            padding: '10px 12px',
                            borderBottom: '1px solid var(--ocean-border)',
                            background: 'var(--ocean-surface)',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{day.label}</div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ocean-text-muted)' }}>
                            <input
                              type="checkbox"
                              checked={row.closed}
                              onChange={(e) =>
                                setHours((prev) => ({
                                  ...prev,
                                  [day.key]: { ...prev[day.key], closed: e.target.checked },
                                }))
                              }
                            />
                            Closed
                          </label>
                          <input
                            style={{ ...inputStyle, opacity: row.closed ? 0.45 : 1 }}
                            type="time"
                            disabled={row.closed}
                            value={row.open}
                            onChange={(e) =>
                              setHours((prev) => ({
                                ...prev,
                                [day.key]: { ...prev[day.key], open: e.target.value },
                              }))
                            }
                          />
                          <input
                            style={{ ...inputStyle, opacity: row.closed ? 0.45 : 1 }}
                            type="time"
                            disabled={row.closed}
                            value={row.close}
                            onChange={(e) =>
                              setHours((prev) => ({
                                ...prev,
                                [day.key]: { ...prev[day.key], close: e.target.value },
                              }))
                            }
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <label style={fieldLabelStyle}>SYSTEM PROMPT</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={7}
                    style={{
                      ...inputStyle,
                      resize: 'vertical',
                      lineHeight: 1.45,
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={fieldLabelStyle}>AGENT NAME</label>
                    <input style={inputStyle} value={agentName} onChange={(e) => setAgentName(e.target.value)} />
                  </div>
                  <div>
                    <label style={fieldLabelStyle}>LANGUAGE</label>
                    <select style={inputStyle} value={language} onChange={(e) => setLanguage(e.target.value)}>
                      <option>English (US)</option>
                      <option>English (UK)</option>
                      <option>Spanish</option>
                      <option>French</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={fieldLabelStyle}>ESCALATION RULES</label>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: 'var(--ocean-text)' }}>
                      <input type="checkbox" checked={escalateAngry} onChange={(e) => setEscalateAngry(e.target.checked)} />
                      Angry customer
                    </label>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: 'var(--ocean-text)' }}>
                      <input
                        type="checkbox"
                        checked={escalatePricing}
                        onChange={(e) => setEscalatePricing(e.target.checked)}
                      />
                      Custom pricing
                    </label>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: 'var(--ocean-text)' }}>
                      <input
                        type="checkbox"
                        checked={escalateMedical}
                        onChange={(e) => setEscalateMedical(e.target.checked)}
                      />
                      Medical questions
                    </label>
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    style={{
                      borderRadius: 10,
                      border: '1px solid var(--ocean-border)',
                      background: 'var(--ocean-surface)',
                      color: 'var(--ocean-text)',
                      fontWeight: 700,
                      fontSize: 14,
                      padding: '10px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    Test Agent
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div style={{ display: 'grid', gap: 14, maxWidth: 720 }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: 'var(--ocean-text)' }}>
                  <input type="checkbox" checked={emailNotifs} onChange={(e) => setEmailNotifs(e.target.checked)} />
                  Email notifications for new bookings
                </label>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: 'var(--ocean-text)' }}>
                  <input type="checkbox" checked={smsNotifs} onChange={(e) => setSmsNotifs(e.target.checked)} />
                  SMS alerts for urgent escalations
                </label>
                <div>
                  <label style={fieldLabelStyle}>DIGEST FREQUENCY</label>
                  <select style={{ ...inputStyle, maxWidth: 360 }} value={digest} onChange={(e) => setDigest(e.target.value)}>
                    <option value="daily">Daily summary</option>
                    <option value="weekly">Weekly summary</option>
                    <option value="off">Off</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'widget' && (
              <div style={{ display: 'grid', gap: 20, maxWidth: 800 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ocean-text)', letterSpacing: '-0.02em' }}>
                    Embed your AI widget
                  </h2>
                  <p style={{ margin: '8px 0 0', color: 'var(--ocean-text-muted)', fontSize: 14, lineHeight: 1.55 }}>
                    Add this code to your website to enable the AI chat widget
                  </p>
                </div>

                {widgetEmbedSnippet ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ ...fieldLabelStyle, marginBottom: 0 }}>EMBED CODE</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(widgetEmbedSnippet)
                            setWidgetCopied(true)
                            window.setTimeout(() => setWidgetCopied(false), 2000)
                          } catch {
                            setWidgetCopied(false)
                          }
                        }}
                        style={{
                          borderRadius: 10,
                          border: '1px solid var(--ocean-border)',
                          background: widgetCopied ? 'rgba(74, 222, 128, 0.15)' : 'var(--ocean-surface)',
                          color: widgetCopied ? 'var(--ocean-success)' : 'var(--ocean-text)',
                          fontWeight: 600,
                          fontSize: 13,
                          padding: '8px 14px',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        {widgetCopied ? 'Copied!' : 'Copy to clipboard'}
                      </button>
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        padding: '14px 16px',
                        borderRadius: 12,
                        background: 'var(--ocean-black)',
                        color: 'var(--ocean-text)',
                        fontSize: 13,
                        lineHeight: 1.5,
                        overflowX: 'auto',
                        border: '1px solid var(--ocean-border)',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      }}
                    >
                      <code>{widgetEmbedSnippet}</code>
                    </pre>
                  </div>
                ) : (
                  <p style={{ margin: 0, color: 'var(--ocean-text-muted)', fontSize: 14 }}>
                    {!businessRowId
                      ? 'Save your business profile first so we can generate your widget embed code.'
                      : 'Loading embed URL…'}
                  </p>
                )}

                <div>
                  <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: 'var(--ocean-text-muted)', letterSpacing: '0.04em' }}>
                    PREVIEW
                  </p>
                  <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: 'var(--ocean-text)' }}>
                    Your widget will appear like this
                  </p>
                  <div
                    style={{
                      position: 'relative',
                      height: 200,
                      borderRadius: 14,
                      border: '1px solid var(--ocean-border)',
                      background: 'linear-gradient(180deg, var(--ocean-card) 0%, var(--ocean-surface) 100%)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 12,
                        borderRadius: 10,
                        border: '1px dashed var(--ocean-border-strong)',
                        background: 'var(--ocean-surface)',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 52,
                        right: 16,
                        width: 132,
                        height: 96,
                        borderRadius: 12,
                        background: 'var(--ocean-ink)',
                        border: '1px solid var(--ocean-border)',
                        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.12)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          padding: '8px 10px',
                          borderBottom: '1px solid var(--ocean-border)',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--ocean-text)',
                        }}
                      >
                        {businessName?.trim() || 'AI Assistant'}
                      </div>
                      <div style={{ flex: 1, padding: 8, background: 'var(--ocean-deep)' }}>
                        <div
                          style={{
                            height: 8,
                            width: '72%',
                            background: 'var(--ocean-border)',
                            borderRadius: 4,
                            marginBottom: 6,
                          }}
                        />
                        <div
                          style={{
                            height: 8,
                            width: '48%',
                            background: 'rgba(56, 189, 248, 0.15)',
                            borderRadius: 4,
                          }}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 14,
                        right: 16,
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--ocean-sky) 0%, var(--ocean-sand-deep) 100%)',
                        boxShadow: '0 6px 16px rgba(124, 58, 237, 0.4)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 18,
                      }}
                      aria-hidden
                    >
                      💬
                    </div>
                  </div>
                </div>

                <div>
                  <p style={{ ...fieldLabelStyle, marginBottom: 10 }}>INSTRUCTIONS</p>
                  <ol
                    style={{
                      margin: 0,
                      paddingLeft: 22,
                      color: 'var(--ocean-text-muted)',
                      fontSize: 14,
                      lineHeight: 1.65,
                    }}
                  >
                    <li style={{ marginBottom: 6 }}>Copy the code above</li>
                    <li style={{ marginBottom: 6 }}>Paste it before &lt;/body&gt; tag on your website</li>
                    <li>Your AI assistant will appear automatically</li>
                  </ol>
                </div>
              </div>
            )}

            {activeTab === 'billing' && (
              <div style={{ display: 'grid', gap: 14, maxWidth: 720 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={fieldLabelStyle}>PLAN</label>
                    <select style={inputStyle} value={plan} onChange={(e) => setPlan(e.target.value)}>
                      <option>Starter</option>
                      <option>Pro</option>
                      <option>Enterprise</option>
                    </select>
                  </div>
                  <div>
                    <label style={fieldLabelStyle}>CARD ON FILE</label>
                    <input
                      style={inputStyle}
                      value={`Visa •••• ${cardLast4}`}
                      onChange={(e) => {
                        const match = e.target.value.match(/(\d{4})\s*$/)
                        setCardLast4(match ? match[1] : cardLast4)
                      }}
                    />
                  </div>
                </div>
                <p style={{ margin: 0, color: 'var(--ocean-text-muted)', fontSize: 13 }}>
                  Billing is mock-only in this preview. Save Changes will not charge a card.
                </p>
              </div>
            )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        </main>
        )}
      </DashboardOceanNav>
    </>
  )
}
