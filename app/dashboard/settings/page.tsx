'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { oceanTransition, tabContent } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'
import { card, t } from '@/lib/dashboard-theme'

type TabId = 'general' | 'ai' | 'notifications' | 'widget' | 'billing'
type BusinessType = 'restaurant' | 'cafe' | 'bar' | 'bakery' | 'other'
type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
type DayHours = { open: string; close: string; closed: boolean }

type FloatingFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  rows?: number
  multiline?: boolean
}

type FloatingSelectProps = {
  label: string
  value: string
  onChange: (value: string) => void
  options: { label: string; value: string }[]
}

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
  mon: { open: '17:00', close: '22:30', closed: false },
  tue: { open: '17:00', close: '22:30', closed: false },
  wed: { open: '17:00', close: '22:30', closed: false },
  thu: { open: '17:00', close: '23:00', closed: false },
  fri: { open: '17:00', close: '23:30', closed: false },
  sat: { open: '11:30', close: '23:30', closed: false },
  sun: { open: '11:30', close: '21:30', closed: false },
}

const glassCard = card

function FieldShell({
  children,
  active,
}: {
  children: ReactNode
  active: boolean
}) {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 10,
        background: t.bgSurface,
        border: active ? `1px solid ${t.accent}` : `1px solid ${t.border}`,
        boxShadow: active ? `0 0 0 3px ${t.accentSoftBg}` : 'none',
        transition: 'all 0.2s ease',
      }}
    >
      {children}
    </div>
  )
}

function FloatingField({ label, value, onChange, type = 'text', rows = 5, multiline }: FloatingFieldProps) {
  const [focused, setFocused] = useState(false)
  const active = focused || value.length > 0

  return (
    <FieldShell active={active}>
      <label
        style={{
          position: 'absolute',
          left: 16,
          top: active ? 6 : 16,
          fontSize: active ? 10 : 14,
          color: active ? t.accent : t.textMuted,
          letterSpacing: active ? '0.18em' : '0',
          textTransform: active ? 'uppercase' : 'none',
          fontWeight: active ? 700 : 400,
          pointerEvents: 'none',
          transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          rows={rows}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onChange(event.target.value)}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: t.text,
            fontSize: 15,
            padding: '24px 16px 10px',
            borderRadius: 10,
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: 1.6,
          }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => onChange(event.target.value)}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: t.text,
            fontSize: 15,
            padding: '24px 16px 10px',
            borderRadius: 10,
          }}
        />
      )}
    </FieldShell>
  )
}

function FloatingSelect({ label, value, onChange, options }: FloatingSelectProps) {
  const [focused, setFocused] = useState(false)
  const active = focused || value.length > 0

  return (
    <FieldShell active={active}>
      <label
        style={{
          position: 'absolute',
          left: 16,
          top: active ? 6 : 16,
          fontSize: active ? 10 : 14,
          color: active ? t.accent : t.textMuted,
          letterSpacing: active ? '0.18em' : '0',
          textTransform: active ? 'uppercase' : 'none',
          fontWeight: active ? 700 : 400,
          pointerEvents: 'none',
          transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {label}
      </label>
      <select
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: t.text,
          fontSize: 15,
          padding: '24px 16px 10px',
          borderRadius: 10,
          WebkitAppearance: 'none',
          appearance: 'none',
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} style={{ color: t.text, background: '#ffffff' }}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

function SettingsPageInner() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initialTab: TabId =
    tabParam === 'ai' ||
    tabParam === 'notifications' ||
    tabParam === 'widget' ||
    tabParam === 'billing' ||
    tabParam === 'general'
      ? tabParam
      : 'general'
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  useEffect(() => {
    if (
      tabParam === 'ai' ||
      tabParam === 'notifications' ||
      tabParam === 'widget' ||
      tabParam === 'billing' ||
      tabParam === 'general'
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync active tab with URL changes
      setActiveTab(tabParam)
    }
  }, [tabParam])
  const [saveError, setSaveError] = useState('')
  const [showSaveToast, setShowSaveToast] = useState(false)
  const saveToastTimerRef = useRef<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [businessRowId, setBusinessRowId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType>('restaurant')
  const [businessPhone, setBusinessPhone] = useState('')
  const [businessEmail, setBusinessEmail] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [hours, setHours] = useState<Record<DayKey, DayHours>>(initialHours)

  const [systemPrompt, setSystemPrompt] = useState(
    'You are the AI Concierge for this restaurant. Be warm, attentive, and concise. Help guests with reservations, menu inquiries, dietary requirements, and special-occasion notes. Confirm party size, date, time, and guest name before treating a reservation as final. Escalate complaints or unusual requests to a manager.',
  )
  const [agentName, setAgentName] = useState('AI Concierge')
  const [language, setLanguage] = useState('English (US)')
  const [escalateComplaint, setEscalateComplaint] = useState(true)
  const [escalateLargeParty, setEscalateLargeParty] = useState(true)
  const [escalateAllergy, setEscalateAllergy] = useState(true)

  const [emailNotifs, setEmailNotifs] = useState(true)
  const [smsNotifs, setSmsNotifs] = useState(false)
  const [digest, setDigest] = useState('daily')

  const [plan] = useState('Pro')
  const [cardLast4] = useState('4242')

  const [widgetOrigin] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : '',
  )
  const [widgetCopied, setWidgetCopied] = useState(false)
  const reduceMotion = useReducedMotion()

  const tabs = useMemo(
    () =>
      [
        { id: 'general' as const, label: 'General' },
        { id: 'ai' as const, label: 'AI Concierge' },
        { id: 'notifications' as const, label: 'Notifications' },
        { id: 'widget' as const, label: 'Widget' },
        { id: 'billing' as const, label: 'Billing' },
      ] satisfies { id: TabId; label: string }[],
    [],
  )

  const tabIndex = tabs.findIndex((tab) => tab.id === activeTab)

  const widgetEmbedSnippet = useMemo(() => {
    if (!businessRowId || !widgetOrigin) {
      return ''
    }
    return `<script src="${widgetOrigin}/widget.js?id=${businessRowId}" async></script>`
  }, [businessRowId, widgetOrigin])

  useEffect(() => {
    let isMounted = true

    async function hydrateForUserId(userId: string) {
      const { data, error } = await supabase
        .from('businesses')
        .select('id, name, email, phone, business_type, address, system_prompt, agent_name, language')
        .eq('user_id', userId)
        .maybeSingle()
      if (!isMounted) return
      if (!error && data) {
        setBusinessRowId(data.id ?? null)
        setBusinessName(data.name ?? '')
        setBusinessEmail(data.email ?? '')
        setBusinessPhone(data.phone ?? '')
        setBusinessType((data.business_type as BusinessType) ?? 'restaurant')
        setBusinessAddress(data.address ?? '')
        if (data.system_prompt) setSystemPrompt(data.system_prompt)
        if (data.agent_name) setAgentName(data.agent_name)
        setLanguage(data.language ?? 'English (US)')
      }
      setIsLoading(false)
    }

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!isMounted) return
      if (user) {
        setCurrentUserId(user.id)
        await hydrateForUserId(user.id)
      } else {
        setIsLoading(false)
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return
      const user = session?.user ?? null
      if (!user) {
        setCurrentUserId(null)
        return
      }
      setCurrentUserId((prev) => prev ?? user.id)
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
          const { data: row } = await supabase.from('businesses').select('id').eq('user_id', userId).maybeSingle()
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

  const tabPanel = (() => {
    if (isLoading) {
      return (
        <div style={{ display: 'grid', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              style={{
                height: index === 0 ? 56 : 72,
                borderRadius: 12,
                background: t.bgSurfaceMuted,
                border: `1px solid ${t.borderSoft}`,
              }}
            />
          ))}
        </div>
      )
    }

    if (activeTab === 'general') {
      return (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <FloatingField label="Restaurant Name" value={businessName} onChange={setBusinessName} />
            <FloatingSelect
              label="Venue Type"
              value={businessType}
              onChange={(value) => setBusinessType(value as BusinessType)}
              options={[
                { value: 'restaurant', label: 'Restaurant' },
                { value: 'cafe', label: 'Café' },
                { value: 'bar', label: 'Bar / Lounge' },
                { value: 'bakery', label: 'Bakery' },
                { value: 'other', label: 'Other hospitality' },
              ]}
            />
            <FloatingField label="Phone" value={businessPhone} onChange={setBusinessPhone} />
            <FloatingField label="Email" value={businessEmail} onChange={setBusinessEmail} type="email" />
          </div>

          <FloatingField label="Address" value={businessAddress} onChange={setBusinessAddress} />

          <div style={{ ...glassCard, padding: 16 }}>
            <div
              style={{
                color: t.textMuted,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              Working Hours
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {dayOrder.map((day) => {
                const row = hours[day.key]
                return (
                  <div
                    key={day.key}
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${t.borderSoft}`,
                      background: t.bgSurface,
                      padding: 12,
                      display: 'grid',
                      gridTemplateColumns: 'minmax(100px, 1fr) auto minmax(120px, 1fr) minmax(120px, 1fr)',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ color: t.text, fontSize: 14, fontWeight: 600 }}>{day.label}</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.textMuted, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={row.closed}
                        onChange={(event) =>
                          setHours((prev) => ({
                            ...prev,
                            [day.key]: { ...prev[day.key], closed: event.target.checked },
                          }))
                        }
                      />
                      Closed
                    </label>
                    <input
                      type="time"
                      disabled={row.closed}
                      value={row.open}
                      onChange={(event) =>
                        setHours((prev) => ({
                          ...prev,
                          [day.key]: { ...prev[day.key], open: event.target.value },
                        }))
                      }
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${t.border}`,
                        background: t.bgSurface,
                        color: t.text,
                        padding: '10px 12px',
                        opacity: row.closed ? 0.45 : 1,
                        outline: 'none',
                      }}
                    />
                    <input
                      type="time"
                      disabled={row.closed}
                      value={row.close}
                      onChange={(event) =>
                        setHours((prev) => ({
                          ...prev,
                          [day.key]: { ...prev[day.key], close: event.target.value },
                        }))
                      }
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${t.border}`,
                        background: t.bgSurface,
                        color: t.text,
                        padding: '10px 12px',
                        opacity: row.closed ? 0.45 : 1,
                        outline: 'none',
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    }

    if (activeTab === 'ai') {
      return (
        <div style={{ display: 'grid', gap: 16 }}>
          <FloatingField
            label="System Prompt"
            value={systemPrompt}
            onChange={setSystemPrompt}
            multiline
            rows={8}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <FloatingField label="Concierge Name" value={agentName} onChange={setAgentName} />
            <FloatingSelect
              label="Language"
              value={language}
              onChange={setLanguage}
              options={[
                { value: 'English (US)', label: 'English (US)' },
                { value: 'English (UK)', label: 'English (UK)' },
                { value: 'Spanish', label: 'Spanish' },
                { value: 'French', label: 'French' },
              ]}
            />
          </div>
          <div style={{ ...glassCard, padding: 16, display: 'grid', gap: 10 }}>
            <div
              style={{
                color: t.textMuted,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              Escalation Rules
            </div>
            {[
              { label: 'Guest complaint', checked: escalateComplaint, onChange: setEscalateComplaint },
              { label: 'Large party (8+ guests)', checked: escalateLargeParty, onChange: setEscalateLargeParty },
              { label: 'Allergy or dietary risk', checked: escalateAllergy, onChange: setEscalateAllergy },
            ].map((item) => (
              <label
                key={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  borderRadius: 10,
                  border: `1px solid ${t.borderSoft}`,
                  background: t.bgSurface,
                  padding: '12px 14px',
                  color: t.text,
                  fontSize: 14,
                }}
              >
                {item.label}
                <input type="checkbox" checked={item.checked} onChange={(event) => item.onChange(event.target.checked)} />
              </label>
            ))}
          </div>
        </div>
      )
    }

    if (activeTab === 'notifications') {
      return (
        <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
          {[
            {
              label: 'Email me when a new reservation comes in',
              checked: emailNotifs,
              onChange: setEmailNotifs,
            },
            {
              label: 'SMS alerts for urgent escalations',
              checked: smsNotifs,
              onChange: setSmsNotifs,
            },
          ].map((item) => (
            <label
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderRadius: 12,
                border: `1px solid ${t.border}`,
                background: t.bgSurface,
                padding: '16px 18px',
                color: t.text,
                fontSize: 14,
                boxShadow: t.shadowSm,
              }}
            >
              {item.label}
              <input type="checkbox" checked={item.checked} onChange={(event) => item.onChange(event.target.checked)} />
            </label>
          ))}
          <FloatingSelect
            label="Digest Frequency"
            value={digest}
            onChange={setDigest}
            options={[
              { value: 'daily', label: 'Daily summary' },
              { value: 'weekly', label: 'Weekly summary' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </div>
      )
    }

    if (activeTab === 'widget') {
      return (
        <div style={{ display: 'grid', gap: 18 }}>
          <div>
            <div style={{ color: t.text, fontSize: 22, fontWeight: 700 }}>Embed your AI Concierge</div>
            <p style={{ margin: '8px 0 0', color: t.textMuted, fontSize: 14, lineHeight: 1.65 }}>
              Drop this snippet into your website to launch the OceanCore concierge for guests.
            </p>
          </div>
          {widgetEmbedSnippet ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    color: t.textMuted,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                  }}
                >
                  Embed Code
                </div>
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
                    borderRadius: 8,
                    border: `1px solid ${widgetCopied ? t.successBorder : t.border}`,
                    background: widgetCopied ? t.successBg : t.bgSurface,
                    color: widgetCopied ? t.success : t.text,
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {widgetCopied ? 'Copied!' : 'Copy snippet'}
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: '16px 18px',
                  borderRadius: 12,
                  background: t.bgSurfaceMuted,
                  border: `1px solid ${t.border}`,
                  color: t.text,
                  overflowX: 'auto',
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <code>{widgetEmbedSnippet}</code>
              </pre>
            </div>
          ) : (
            <div style={{ color: t.textMuted, fontSize: 14 }}>
              {!businessRowId
                ? 'Save your restaurant profile first so we can generate your widget snippet.'
                : 'Loading embed URL...'}
            </div>
          )}
        </div>
      )
    }

    return (
      <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div style={{ ...glassCard, padding: 16 }}>
            <div
              style={{
                color: t.textMuted,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              Plan
            </div>
            <div style={{ marginTop: 10, color: t.text, fontSize: 28, fontWeight: 700 }}>{plan}</div>
          </div>
          <div style={{ ...glassCard, padding: 16 }}>
            <div
              style={{
                color: t.textMuted,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              Payment Method
            </div>
            <div style={{ marginTop: 10, color: t.text, fontSize: 20, fontWeight: 700 }}>•••• {cardLast4}</div>
          </div>
        </div>
        <div style={{ ...glassCard, padding: 18 }}>
          <div style={{ color: t.text, fontSize: 18, fontWeight: 700 }}>Billing Overview</div>
          <p style={{ margin: '10px 0 0', color: t.textMuted, fontSize: 14, lineHeight: 1.65 }}>
            Your subscription is active and your OceanCore environment is fully operational. Upgrade, invoices,
            and usage details can plug into this panel next.
          </p>
        </div>
      </div>
    )
  })()

  return (
    <>
      {showSaveToast ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 20,
            right: 24,
            zIndex: 9999,
            padding: '12px 18px',
            borderRadius: 12,
            background: t.successBg,
            border: `1px solid ${t.successBorder}`,
            color: t.success,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: t.shadowLg,
          }}
        >
          Saved!
        </div>
      ) : null}

      <DashboardOceanNav activeNav="Settings">
        {({ isMobile, openNav }) => (
          <main style={{ display: 'grid', gap: 20 }}>
            {isMobile ? (
              <motion.button
                type="button"
                onClick={openNav}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  border: `1px solid ${t.border}`,
                  background: t.bgSurface,
                  color: t.text,
                  fontSize: 22,
                  cursor: 'pointer',
                  boxShadow: t.shadowSm,
                }}
              >
                ☰
              </motion.button>
            ) : null}

            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={oceanTransition(reduceMotion, { duration: 0.24 })}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile ? 'column' : 'row',
                gap: 16,
              }}
            >
              <div>
                <h1
                  style={{
                    margin: 0,
                    color: t.text,
                    fontSize: 30,
                    fontWeight: 700,
                    fontFamily: 'var(--font-playfair)',
                    letterSpacing: '-0.03em',
                  }}
                >
                  Settings
                </h1>
                <p style={{ margin: '8px 0 0', color: t.textMuted, fontSize: 14 }}>
                  Configure your restaurant profile, AI Concierge behavior, widget, and notifications.
                </p>
              </div>

              <div style={{ display: 'grid', gap: 8, justifyItems: isMobile ? 'stretch' : 'end', width: isMobile ? '100%' : 'auto' }}>
                {saveError ? (
                  <div style={{ color: t.danger, fontSize: 13, fontWeight: 600 }}>{saveError}</div>
                ) : null}
                <motion.button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isLoading || isSaving}
                  whileHover={isLoading || isSaving || reduceMotion ? undefined : { y: -1 }}
                  whileTap={isLoading || isSaving || reduceMotion ? undefined : { scale: 0.98 }}
                  style={{
                    border: 'none',
                    borderRadius: 10,
                    padding: '11px 18px',
                    background: isLoading || isSaving ? t.bgSurfaceMuted : t.accent,
                    color: isLoading || isSaving ? t.textSubtle : '#ffffff',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: isLoading || isSaving ? 'not-allowed' : 'pointer',
                    width: isMobile ? '100%' : 'auto',
                  }}
                >
                  {isLoading ? 'Loading…' : isSaving ? 'Saving…' : 'Save Changes'}
                </motion.button>
              </div>
            </motion.section>

            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={oceanTransition(reduceMotion, { delay: 0.05, duration: 0.24 })}
              style={{ ...glassCard, padding: 6 }}
            >
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {tabs.map((tab) => {
                  const active = tab.id === activeTab
                  return (
                    <motion.button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                      style={{
                        border: 'none',
                        borderRadius: 8,
                        padding: '9px 16px',
                        background: active ? t.accentSoftBg : 'transparent',
                        color: active ? t.accent : t.textMuted,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {tab.label}
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>

            <motion.section
              initial={{ opacity: 0, scale: 0.98, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={oceanTransition(reduceMotion, { delay: 0.08, duration: 0.26 })}
              style={{ ...glassCard, padding: 20, overflow: 'hidden' }}
            >
              <AnimatePresence mode="wait" custom={tabIndex}>
                <motion.div
                  key={activeTab}
                  custom={tabIndex}
                  variants={tabContent}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={oceanTransition(reduceMotion)}
                >
                  {tabPanel}
                </motion.div>
              </AnimatePresence>
            </motion.section>

            <motion.button
              type="button"
              onClick={() => void handleSave()}
              disabled={isLoading || isSaving}
              whileHover={isLoading || isSaving || reduceMotion ? undefined : { y: -1 }}
              whileTap={isLoading || isSaving || reduceMotion ? undefined : { scale: 0.99 }}
              style={{
                border: 'none',
                borderRadius: 12,
                width: '100%',
                padding: '14px 18px',
                background: isLoading || isSaving ? t.bgSurfaceMuted : t.accent,
                color: isLoading || isSaving ? t.textSubtle : '#ffffff',
                fontWeight: 600,
                fontSize: 14,
                cursor: isLoading || isSaving ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoading ? 'Loading…' : isSaving ? 'Saving…' : 'Save Configuration'}
            </motion.button>
          </main>
        )}
      </DashboardOceanNav>
    </>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  )
}
