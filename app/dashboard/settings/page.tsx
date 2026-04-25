'use client'

import Link from 'next/link'

import { DashboardLogoutButton } from '@/components/dashboard-logout-button'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const navItems = ['Dashboard', 'Chats', 'Bookings', 'CRM', 'Settings']
const navLinks: Record<string, string> = {
  Dashboard: '/dashboard',
  Chats: '/dashboard/chats',
  Calendar: '/dashboard/bookings',
  Bookings: '/dashboard/bookings',
  CRM: '/dashboard/crm',
  Settings: '/dashboard/settings',
}

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
  const [isMobile, setIsMobile] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

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

  useEffect(() => {
    function syncViewport() {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) {
        setIsDrawerOpen(false)
      }
    }
    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
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
    color: '#6b7280',
    letterSpacing: '0.04em',
    marginBottom: 6,
  }

  const inputStyle = {
    width: '100%',
    borderRadius: 10,
    border: '1px solid #d1d5db',
    padding: '10px 12px',
    fontSize: 14,
    outline: 'none',
    background: '#fff',
  }

  const sidebar = (
    <aside
      style={{
        width: 258,
        background: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        padding: '24px 14px 20px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
      <p
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: '#ef4444',
          margin: '0 12px 6px',
          fontWeight: 700,
        }}
      >
        Salon AI
      </p>
      <div style={{ margin: '0 12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Operations</h2>
        {isMobile && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setIsDrawerOpen(false)}
            style={{ border: 'none', background: 'transparent', fontSize: 26, lineHeight: 1, color: '#374151', cursor: 'pointer' }}
          >
            ×
          </button>
        )}
      </div>
      <nav style={{ display: 'grid', gap: 6 }}>
        {navItems.map((item) => {
          const isActive = item === 'Settings'
          return (
            <Link
              key={item}
              href={navLinks[item] ?? '#'}
              onClick={() => setIsDrawerOpen(false)}
              style={{
                padding: '11px 13px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 500,
                color: isActive ? '#7f1d1d' : '#6b7280',
                background: isActive ? '#fee2e2' : 'transparent',
                border: isActive ? '1px solid #fecaca' : '1px solid transparent',
                textDecoration: 'none',
              }}
            >
              {item}
            </Link>
          )
        })}
      </nav>
      <div style={{ marginTop: 'auto', padding: '0 8px', display: 'grid', gap: 10 }}>
        <DashboardLogoutButton />
        <button
          type="button"
          style={{
            width: '100%',
            border: 'none',
            borderRadius: 10,
            background: '#dc2626',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            padding: '11px 14px',
            cursor: 'pointer',
          }}
        >
          Deploy Agent
        </button>
      </div>
    </aside>
  )

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f3f4f6',
        color: '#111827',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        position: 'relative',
      }}
    >
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
            background: '#ecfdf5',
            border: '1px solid #bbf7d0',
            color: '#166534',
            fontSize: 14,
            fontWeight: 700,
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
          }}
        >
          Saved!
        </div>
      )}
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {!isMobile && sidebar}
        {isMobile && isDrawerOpen && (
          <div role="presentation" onClick={() => setIsDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.45)', zIndex: 40 }}>
            <div role="presentation" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 258, boxShadow: '0 12px 24px rgba(0, 0, 0, 0.2)' }}>
              {sidebar}
            </div>
          </div>
        )}

        <main style={{ flex: 1, padding: isMobile ? '16px 14px 24px' : '30px 32px 36px' }}>
          {isMobile && (
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setIsDrawerOpen(true)}
                style={{ border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', color: '#374151', width: 40, height: 40, fontSize: 23, lineHeight: 1, cursor: 'pointer' }}
              >
                ☰
              </button>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-end', flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 30, letterSpacing: '-0.02em' }}>Settings</h1>
              <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 14 }}>
                Configure your business profile, AI behavior, and operational preferences.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              {saveError ? (
                <span style={{ color: '#b91c1c', fontSize: 13, fontWeight: 600, textAlign: 'right', maxWidth: 320 }}>
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
                  background: isLoading || isSaving ? '#f87171' : '#dc2626',
                  color: '#fff',
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
              borderBottom: '1px solid #e5e7eb',
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
                    color: active ? '#7f1d1d' : '#6b7280',
                    background: active ? '#fee2e2' : 'transparent',
                    borderBottom: active ? '2px solid #dc2626' : '2px solid transparent',
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
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: 16,
              padding: 18,
            }}
          >
            {isLoading && (
              <div style={{ display: 'grid', gap: 12 }}>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>Loading...</p>
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={`settings-skeleton-${idx}`}
                    style={{
                      height: idx % 3 === 0 ? 44 : 38,
                      borderRadius: 10,
                      background: '#f3f4f6',
                      border: '1px solid #eceff3',
                    }}
                  />
                ))}
              </div>
            )}

            {!isLoading && activeTab === 'general' && (
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
                  <div style={{ border: '1px solid #f3f4f6', borderRadius: 12, overflow: 'hidden' }}>
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
                            borderBottom: '1px solid #f3f4f6',
                            background: '#fafafa',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{day.label}</div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4b5563' }}>
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

            {!isLoading && activeTab === 'ai' && (
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
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: '#374151' }}>
                      <input type="checkbox" checked={escalateAngry} onChange={(e) => setEscalateAngry(e.target.checked)} />
                      Angry customer
                    </label>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: '#374151' }}>
                      <input
                        type="checkbox"
                        checked={escalatePricing}
                        onChange={(e) => setEscalatePricing(e.target.checked)}
                      />
                      Custom pricing
                    </label>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: '#374151' }}>
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
                      border: '1px solid #d1d5db',
                      background: '#fff',
                      color: '#111827',
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

            {!isLoading && activeTab === 'notifications' && (
              <div style={{ display: 'grid', gap: 14, maxWidth: 720 }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: '#374151' }}>
                  <input type="checkbox" checked={emailNotifs} onChange={(e) => setEmailNotifs(e.target.checked)} />
                  Email notifications for new bookings
                </label>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: '#374151' }}>
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

            {!isLoading && activeTab === 'widget' && (
              <div style={{ display: 'grid', gap: 20, maxWidth: 800 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
                    Embed your AI widget
                  </h2>
                  <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 14, lineHeight: 1.55 }}>
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
                          border: '1px solid #d1d5db',
                          background: widgetCopied ? '#ecfdf5' : '#fff',
                          color: widgetCopied ? '#166534' : '#374151',
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
                        background: '#0f172a',
                        color: '#e2e8f0',
                        fontSize: 13,
                        lineHeight: 1.5,
                        overflowX: 'auto',
                        border: '1px solid #1e293b',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      }}
                    >
                      <code>{widgetEmbedSnippet}</code>
                    </pre>
                  </div>
                ) : (
                  <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
                    {!businessRowId
                      ? 'Save your business profile first so we can generate your widget embed code.'
                      : 'Loading embed URL…'}
                  </p>
                )}

                <div>
                  <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', letterSpacing: '0.04em' }}>
                    PREVIEW
                  </p>
                  <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 600, color: '#374151' }}>
                    Your widget will appear like this
                  </p>
                  <div
                    style={{
                      position: 'relative',
                      height: 200,
                      borderRadius: 14,
                      border: '1px solid #e2e8f0',
                      background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: 12,
                        borderRadius: 10,
                        border: '1px dashed #cbd5e1',
                        background: '#fff',
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
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.12)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          padding: '8px 10px',
                          borderBottom: '1px solid #f1f5f9',
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#111827',
                        }}
                      >
                        {businessName?.trim() || 'AI Assistant'}
                      </div>
                      <div style={{ flex: 1, padding: 8, background: '#f8fafc' }}>
                        <div
                          style={{
                            height: 8,
                            width: '72%',
                            background: '#e5e7eb',
                            borderRadius: 4,
                            marginBottom: 6,
                          }}
                        />
                        <div
                          style={{
                            height: 8,
                            width: '48%',
                            background: '#ede9fe',
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
                        background: 'linear-gradient(135deg, #7c3aed 0%, #dc2626 100%)',
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
                      color: '#4b5563',
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

            {!isLoading && activeTab === 'billing' && (
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
                <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>
                  Billing is mock-only in this preview. Save Changes will not charge a card.
                </p>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
