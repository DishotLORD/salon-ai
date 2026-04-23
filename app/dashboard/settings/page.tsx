'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

const navItems = ['Dashboard', 'Chats', 'Calendar', 'Bookings', 'CRM', 'Settings']

type TabId = 'general' | 'ai' | 'notifications' | 'billing'

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
  const [savedMessage, setSavedMessage] = useState('')

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

  const tabs = useMemo(
    () =>
      [
        { id: 'general' as const, label: 'General' },
        { id: 'ai' as const, label: 'AI Agent' },
        { id: 'notifications' as const, label: 'Notifications' },
        { id: 'billing' as const, label: 'Billing' },
      ] satisfies { id: TabId; label: string }[],
    []
  )

  const handleSave = () => {
    setSavedMessage('Changes saved (mock).')
    window.setTimeout(() => setSavedMessage(''), 2200)
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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f3f4f6',
        color: '#111827',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <aside
          style={{
            width: 258,
            background: '#ffffff',
            borderRight: '1px solid #e5e7eb',
            padding: '24px 14px 20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <p
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.24em',
              color: '#ef4444',
              margin: '0 12px 6px',
            }}
          >
            Salon AI
          </p>
          <h2 style={{ margin: '0 12px 24px', fontSize: 20, fontWeight: 700 }}>Operations</h2>
          <nav style={{ display: 'grid', gap: 6 }}>
            {navItems.map((item) => {
              const isActive = item === 'Settings'
              const href =
                item === 'Dashboard'
                  ? '/dashboard'
                  : item === 'Chats'
                    ? '/dashboard/chats'
                    : item === 'Calendar'
                      ? '#'
                    : item === 'Bookings'
                      ? '/dashboard/bookings'
                      : item === 'CRM'
                        ? '/dashboard/crm'
                        : item === 'Settings'
                          ? '/dashboard/settings'
                          : '#'
              return (
                <Link
                  key={item}
                  href={href}
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
          <div style={{ marginTop: 'auto', padding: '0 8px' }}>
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

        <main style={{ flex: 1, padding: '30px 32px 36px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 30, letterSpacing: '-0.02em' }}>Settings</h1>
              <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 14 }}>
                Configure your business profile, AI behavior, and operational preferences.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              {savedMessage && (
                <span style={{ color: '#166534', fontSize: 13, fontWeight: 600 }}>{savedMessage}</span>
              )}
              <button
                type="button"
                onClick={handleSave}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  background: '#dc2626',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  padding: '10px 16px',
                  cursor: 'pointer',
                }}
              >
                Save Changes
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
            {activeTab === 'general' && (
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
                            gridTemplateColumns: '160px 120px 1fr 1fr',
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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

            {activeTab === 'notifications' && (
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

            {activeTab === 'billing' && (
              <div style={{ display: 'grid', gap: 14, maxWidth: 720 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
