'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { oceanTransition, tabContent } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'
import { card, t } from '@/lib/dashboard-theme'

type TabId = 'general' | 'ai' | 'menu' | 'notifications' | 'widget' | 'billing'
type BusinessType = 'restaurant' | 'cafe' | 'bar' | 'bakery' | 'other'
type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
type DayHours = { open: string; close: string; closed: boolean }
type MenuCategory = 'Starters' | 'Mains' | 'Desserts' | 'Drinks'
type MenuItem = {
  id: string
  name: string
  price: number | null
  description: string | null
  category: string | null
  duration_minutes: number | null
}

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

const MENU_CATEGORIES: MenuCategory[] = ['Starters', 'Mains', 'Desserts', 'Drinks']

const CATEGORY_STYLE: Record<string, { bg: string; color: string }> = {
  Starters: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  Mains:    { bg: 'rgba(56,189,248,0.15)',  color: '#38bdf8' },
  Desserts: { bg: 'rgba(236,72,153,0.15)',  color: '#ec4899' },
  Drinks:   { bg: 'rgba(16,185,129,0.15)',  color: '#10b981' },
}

function catStyle(category: string | null) {
  return CATEGORY_STYLE[category ?? ''] ?? { bg: 'rgba(99,102,241,0.15)', color: '#6366f1' }
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
    tabParam === 'menu' ||
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
      tabParam === 'menu' ||
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


  const [widgetOrigin] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : '',
  )
  const [widgetCopied, setWidgetCopied] = useState(false)

  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [menuLoading, setMenuLoading] = useState(false)
  const menuLoadKeyRef = useRef('')
  const [menuFormOpen, setMenuFormOpen] = useState(false)
  const [menuEditId, setMenuEditId] = useState<string | null>(null)
  const [menuForm, setMenuForm] = useState({ name: '', price: '', description: '', category: 'Mains' as MenuCategory })
  const [menuFormSaving, setMenuFormSaving] = useState(false)
  const [menuFormError, setMenuFormError] = useState('')
  const [menuDeleteId, setMenuDeleteId] = useState<string | null>(null)
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<'All' | MenuCategory>('All')
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null)
  const [menuPdfText, setMenuPdfText] = useState<string | null>(null)
  const [menuPdfUploading, setMenuPdfUploading] = useState(false)
  const [menuPdfError, setMenuPdfError] = useState('')
  const [menuPdfExpanded, setMenuPdfExpanded] = useState(false)
  const menuPdfInputRef = useRef<HTMLInputElement>(null)

  const reduceMotion = useReducedMotion()

  const tabs = useMemo(
    () =>
      [
        { id: 'general' as const, label: 'General' },
        { id: 'ai' as const, label: 'AI Concierge' },
        { id: 'menu' as const, label: 'Menu' },
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
        .select('id, name, email, phone, business_type, address, system_prompt, agent_name, language, menu_pdf_text')
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
        setMenuPdfText((data as Record<string, unknown>).menu_pdf_text as string | null ?? null)
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

  useEffect(() => {
    if (activeTab !== 'menu' || !businessRowId) return
    const key = `${activeTab}:${businessRowId}`
    if (menuLoadKeyRef.current === key) return
    menuLoadKeyRef.current = key
    let cancelled = false
    setMenuLoading(true)
    void (async () => {
      const res = await fetch(`/api/menu?business_id=${encodeURIComponent(businessRowId)}`)
      const json = (await res.json()) as { items?: MenuItem[]; error?: string }
      if (!cancelled) {
        setMenuItems(json.items ?? [])
        setMenuLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [activeTab, businessRowId])

  const openMenuAdd = () => {
    setMenuEditId(null)
    setMenuForm({ name: '', price: '', description: '', category: 'Mains' })
    setMenuFormOpen(true)
  }

  const openMenuEdit = (item: MenuItem) => {
    setMenuEditId(item.id)
    setMenuForm({
      name: item.name,
      price: item.price != null ? String(item.price) : '',
      description: item.description ?? '',
      category: (item.category as MenuCategory) ?? 'Mains',
    })
    setMenuFormOpen(true)
  }

  const handleMenuSave = async () => {
    if (!menuForm.name.trim()) {
      setMenuFormError('Name is required.')
      return
    }
    if (!businessRowId) {
      setMenuFormError('Business not loaded yet. Please wait.')
      return
    }
    const priceVal = menuForm.price !== '' ? parseFloat(menuForm.price) : null
    if (priceVal !== null && isNaN(priceVal)) {
      setMenuFormError('Price must be a valid number.')
      return
    }
    setMenuFormSaving(true)
    setMenuFormError('')
    const payload = {
      business_id: businessRowId,
      name: menuForm.name.trim(),
      price: priceVal,
      description: menuForm.description.trim() || null,
      category: menuForm.category || null,
    }
    if (menuEditId) {
      const res = await fetch('/api/menu', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: menuEditId, ...payload }),
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || json.error) {
        setMenuFormError(json.error ?? 'Failed to update. Please try again.')
        setMenuFormSaving(false)
        return
      }
      setMenuItems((prev) => prev.map((item) => (item.id === menuEditId ? { ...item, ...payload } : item)))
    } else {
      const res = await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { item?: MenuItem; error?: string }
      if (!res.ok || json.error) {
        setMenuFormError(json.error ?? 'Failed to save. Please try again.')
        setMenuFormSaving(false)
        return
      }
      if (json.item) {
        setMenuItems((prev) => [...prev, json.item!])
      }
    }
    setMenuFormSaving(false)
    setMenuFormOpen(false)
    setMenuEditId(null)
    setMenuFormError('')
    setMenuForm({ name: '', price: '', description: '', category: 'Mains' })
  }

  const handleMenuDelete = async (id: string) => {
    if (!businessRowId) return
    setMenuDeleteId(id)
    const res = await fetch('/api/menu', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, business_id: businessRowId }),
    })
    if (res.ok) {
      setMenuItems((prev) => prev.filter((item) => item.id !== id))
    }
    setMenuDeleteId(null)
  }

  const handleMenuPdfUpload = async (file: File) => {
    if (!businessRowId) return
    setMenuPdfUploading(true)
    setMenuPdfError('')

    type PdfMenuResponse = { text?: string; pages?: number; error?: string; usedOcr?: boolean }
    const postPdf = async (forceOcr: boolean) => {
      const fd = new FormData()
      fd.append('business_id', businessRowId)
      fd.append('file', file)
      if (forceOcr) fd.append('force_ocr', '1')
      return fetch('/api/menu/pdf', { method: 'POST', body: fd })
    }

    let res = await postPdf(false)
    let data = (await res.json()) as PdfMenuResponse
    // pdf-parse often returns a single stray line; if vision was skipped and text is tiny, retry once.
    if (res.ok && data.text && data.text.length < 400 && !data.usedOcr) {
      res = await postPdf(true)
      data = (await res.json()) as PdfMenuResponse
    }

    if (res.ok && data.text) {
      setMenuPdfText(data.text)
    } else {
      setMenuPdfError(data.error ?? 'Upload failed')
    }
    setMenuPdfUploading(false)
  }

  const handleMenuPdfClear = async () => {
    if (!businessRowId) return
    const res = await fetch('/api/menu/pdf', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessRowId }),
    })
    if (res.ok) setMenuPdfText(null)
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

    if (activeTab === 'menu') {
      const filteredMenuItems =
        menuCategoryFilter === 'All'
          ? menuItems
          : menuItems.filter((item) => (item.category ?? 'Other') === menuCategoryFilter)

      const fieldStyle = {
        borderRadius: 8,
        border: `1px solid ${t.border}`,
        background: t.bgSurface,
        color: t.text,
        padding: '10px 12px',
        fontSize: 14,
        outline: 'none',
        width: '100%',
      } as const

      const labelStyle = {
        fontSize: 11,
        fontWeight: 700,
        color: t.textMuted,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      } as const

      return (
        <div style={{ display: 'grid', gap: 20 }}>

          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ color: t.text, fontSize: 18, fontWeight: 700 }}>Menu</div>
              <div style={{ color: t.textMuted, fontSize: 13, marginTop: 3 }}>
                Your AI Concierge will automatically know these items.
              </div>
            </div>
            <button
              type="button"
              onClick={
                menuFormOpen
                  ? () => { setMenuFormOpen(false); setMenuEditId(null); setMenuFormError('') }
                  : openMenuAdd
              }
              style={{
                borderRadius: 10,
                border: menuFormOpen ? `1px solid ${t.border}` : 'none',
                background: menuFormOpen ? 'transparent' : '#38bdf8',
                color: menuFormOpen ? t.textMuted : '#fff',
                padding: '9px 18px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {menuFormOpen ? 'Cancel' : 'Add item'}
            </button>
          </div>

          {/* ── Add / Edit form ── */}
          {menuFormOpen && (
            <div style={{ ...glassCard, padding: 20, display: 'grid', gap: 16, borderColor: t.accentSoftBorder }}>
              <div style={{ color: t.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                {menuEditId ? 'Edit dish' : 'New dish'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={labelStyle}>Name *</label>
                  <input
                    value={menuForm.name}
                    onChange={(e) => setMenuForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Margherita Pizza"
                    style={fieldStyle}
                  />
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={labelStyle}>Price ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={menuForm.price}
                    onChange={(e) => setMenuForm((p) => ({ ...p, price: e.target.value }))}
                    placeholder="0.00"
                    style={fieldStyle}
                  />
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={labelStyle}>Category</label>
                  <select
                    value={menuForm.category}
                    onChange={(e) => setMenuForm((p) => ({ ...p, category: e.target.value as MenuCategory }))}
                    style={{ ...fieldStyle, WebkitAppearance: 'none', appearance: 'none' }}
                  >
                    {MENU_CATEGORIES.map((c) => (
                      <option key={c} value={c} style={{ background: '#0d1f3c' }}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <label style={labelStyle}>Description</label>
                <input
                  value={menuForm.description}
                  onChange={(e) => setMenuForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Optional — shown to guests and used by the AI"
                  style={fieldStyle}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                {menuFormError
                  ? <div style={{ fontSize: 13, color: t.danger, fontWeight: 500 }}>{menuFormError}</div>
                  : <div />}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => { setMenuFormOpen(false); setMenuEditId(null); setMenuFormError('') }}
                    style={{ borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleMenuSave()}
                    disabled={menuFormSaving || !menuForm.name.trim()}
                    style={{
                      borderRadius: 8,
                      border: 'none',
                      background: !menuForm.name.trim() || menuFormSaving ? t.bgSurfaceMuted : t.accent,
                      color: !menuForm.name.trim() || menuFormSaving ? t.textSubtle : '#fff',
                      padding: '9px 22px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: !menuForm.name.trim() || menuFormSaving ? 'not-allowed' : 'pointer',
                      minWidth: 110,
                    }}
                  >
                    {menuFormSaving ? 'Saving…' : menuEditId ? 'Save changes' : 'Add dish'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Category filter tabs ── */}
          {!menuLoading && menuItems.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['All', ...MENU_CATEGORIES] as const).map((cat) => {
                const isActive = menuCategoryFilter === cat
                const count = cat === 'All'
                  ? menuItems.length
                  : menuItems.filter((i) => (i.category ?? 'Other') === cat).length
                if (cat !== 'All' && count === 0) return null
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setMenuCategoryFilter(cat)}
                    style={{
                      borderRadius: 999,
                      border: isActive ? 'none' : `1px solid ${t.border}`,
                      background: isActive ? '#38bdf8' : 'transparent',
                      color: isActive ? '#fff' : t.textMuted,
                      padding: '5px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {cat}
                    <span style={{ opacity: 0.55, fontWeight: 500 }}>{count}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Content ── */}
          {menuLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 104, borderRadius: 14, background: t.bgSurfaceMuted, border: `1px solid ${t.borderSoft}` }} />
              ))}
            </div>
          ) : menuItems.length === 0 ? (
            <div style={{ display: 'grid', justifyItems: 'center', gap: 12, padding: '52px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 44, lineHeight: 1 }}>🍴</div>
              <div style={{ color: t.text, fontSize: 16, fontWeight: 700 }}>Your menu is empty</div>
              <div style={{ color: t.textMuted, fontSize: 13, maxWidth: 300 }}>
                Add dishes and your AI will be able to answer menu questions for guests.
              </div>
              <button
                type="button"
                onClick={openMenuAdd}
                style={{ marginTop: 6, borderRadius: 10, border: 'none', background: t.accent, color: '#fff', padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Add your first dish
              </button>
            </div>
          ) : filteredMenuItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: t.textMuted, fontSize: 14 }}>
              No {menuCategoryFilter} items yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {filteredMenuItems.map((item) => {
                const cs = catStyle(item.category)
                const isDeleting = menuDeleteId === item.id
                const isHovered = hoveredItemId === item.id
                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setHoveredItemId(item.id)}
                    onMouseLeave={() => setHoveredItemId(null)}
                    style={{
                      position: 'relative',
                      borderRadius: 12,
                      border: `1px solid ${isHovered ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)'}`,
                      background: isHovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
                      padding: 16,
                      display: 'grid',
                      gap: 10,
                      opacity: isDeleting ? 0.4 : 1,
                      transition: 'border-color 0.15s, background 0.15s, opacity 0.15s',
                    }}
                  >
                    {/* Name row + action buttons */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: t.text, lineHeight: 1.35, flex: 1 }}>{item.name}</div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0, opacity: isHovered && !isDeleting ? 1 : 0, transition: 'opacity 0.15s', pointerEvents: isHovered && !isDeleting ? 'auto' : 'none' }}>
                        <button
                          type="button"
                          onClick={() => openMenuEdit(item)}
                          title="Edit"
                          style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${t.border}`, background: t.bgSurface, color: t.textMuted, cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 12 }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMenuDelete(item.id)}
                          title="Delete"
                          style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: t.danger, cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 12 }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>

                    {/* Price */}
                    {item.price != null && (
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#38bdf8', lineHeight: 1 }}>
                        ${Number.isInteger(item.price) ? item.price : item.price.toFixed(2)}
                      </div>
                    )}

                    {/* Category badge */}
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: cs.bg, color: cs.color, letterSpacing: '0.05em' }}>
                        {item.category ?? 'Other'}
                      </span>
                    </div>

                    {/* Description */}
                    {item.description ? (
                      <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5 }}>{item.description}</div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── PDF Menu Upload ── */}
          <input
            ref={menuPdfInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleMenuPdfUpload(file)
              e.target.value = ''
            }}
          />

          {menuPdfUploading && (
            <div style={{ ...glassCard, padding: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)', display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0 }}>📄</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: t.text, fontSize: 15, fontWeight: 600 }}>Reading PDF…</div>
                <div style={{ color: t.textMuted, fontSize: 13, marginTop: 3 }}>Extracting text, this may take a moment</div>
              </div>
            </div>
          )}
          {!menuPdfUploading && menuPdfText && (
            <div style={{ ...glassCard, padding: 0, borderColor: 'rgba(74,222,128,0.2)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(74,222,128,0.04)' }}>
                <div style={{ width: 8, height: 8, borderRadius: 99, background: '#4ade80', flexShrink: 0, boxShadow: '0 0 8px rgba(74,222,128,0.5)' }} />
                <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ color: t.text, fontSize: 14, fontWeight: 600 }}>PDF Menu Active</span>
                  <span style={{ color: t.textMuted, fontSize: 12 }}>
                    {menuPdfText.length.toLocaleString()} chars
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => setMenuPdfExpanded((v) => !v)}
                    style={{ borderRadius: 6, border: `1px solid ${t.borderSoft}`, background: 'transparent', color: t.textMuted, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'color 0.15s' }}
                  >
                    {menuPdfExpanded ? 'Hide' : 'Preview'}
                  </button>
                  <button
                    type="button"
                    onClick={() => menuPdfInputRef.current?.click()}
                    style={{ borderRadius: 6, border: `1px solid ${t.borderSoft}`, background: 'transparent', color: t.textMuted, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleMenuPdfClear()}
                    style={{ borderRadius: 6, border: '1px solid rgba(248,113,113,0.2)', background: 'transparent', color: t.danger, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: 0.8 }}
                  >
                    Remove
                  </button>
                </div>
              </div>
              {menuPdfExpanded && (
                <div style={{ borderTop: `1px solid ${t.borderSoft}`, padding: '14px 18px', maxHeight: 360, overflowY: 'auto' }}>
                  <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {menuPdfText}
                  </div>
                </div>
              )}
            </div>
          )}
          {!menuPdfUploading && !menuPdfText && (
            <div
              style={{ borderRadius: 12, border: '1.5px dashed rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.02)', padding: 24, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
              onClick={() => menuPdfInputRef.current?.click()}
            >
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0 }}>📄</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: t.text, fontSize: 15, fontWeight: 600 }}>Upload PDF Menu</div>
                <div style={{ color: t.textMuted, fontSize: 13, marginTop: 3 }}>
                  The AI will read the full PDF and answer guest questions from it
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); menuPdfInputRef.current?.click() }}
                style={{ borderRadius: 8, border: 'none', background: '#38bdf8', color: '#fff', padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
              >
                Upload PDF
              </button>
            </div>
          )}

          {menuPdfError && (
            <div style={{ fontSize: 13, color: t.danger, fontWeight: 500, padding: '0 4px' }}>{menuPdfError}</div>
          )}
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
            <div style={{ marginTop: 10, color: t.text, fontSize: 28, fontWeight: 700 }}>Early access</div>
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
            <div style={{ marginTop: 10, color: t.text, fontSize: 20, fontWeight: 700 }}>Not configured</div>
          </div>
        </div>
        <div style={{ ...glassCard, padding: 18 }}>
          <div style={{ color: t.text, fontSize: 18, fontWeight: 700 }}>Billing</div>
          <p style={{ margin: '10px 0 0', color: t.textMuted, fontSize: 14, lineHeight: 1.65 }}>
            Subscription and invoices are not enabled yet.
            Stripe billing will appear here when launched.
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

            {activeTab !== 'menu' && (
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
            )}
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
