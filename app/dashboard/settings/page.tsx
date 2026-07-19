'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { AddressAutocompleteField } from '@/components/address-autocomplete-field'
import {
  SETTINGS_CATEGORIES,
  SettingsCategoryNav,
  type SettingsCategoryId,
} from '@/components/settings-category-nav'
import { BookingSettingsPanel } from '@/components/booking-settings-panel'
import { DiningZonesPanel, type DiningZoneDraft } from '@/components/dining-zones-panel'
import { WorkingHoursPanel } from '@/components/working-hours-panel'
import {
  ActivityResourcesPanel,
  DEFAULT_ACTIVITY_RESOURCES,
  type ActivityResource,
} from '@/components/activity-resources-panel'
import {
  DEFAULT_BOOKING_SETTINGS,
  parseBookingSettings,
  type BookingSettings,
} from '@/lib/booking-settings'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  parseNotificationSettings,
  type NotificationSettings,
} from '@/lib/notification-settings'
import {
  DEFAULT_SYSTEM_PROMPT_PLACEHOLDER,
} from '@/lib/default-system-prompt'
import { defaultMainDiningZone, parseDiningZoneRow, slugifyZoneName } from '@/lib/dining-zones'
import { oceanTransition, settingsPanelHeavy } from '@/lib/ocean-motion'
import {
  DEFAULT_OPERATING_HOURS,
  parseOperatingHours,
  validateOperatingHours,
  type OperatingHours,
} from '@/lib/operating-hours'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_PAYMENT_SETTINGS,
  parsePaymentSettings,
  type PaymentSettings,
} from '@/lib/payment-settings'
import {
  BOOKING_SETTINGS_MIGRATION_HINT,
  DINING_ZONES_MIGRATION_HINT,
  isBookingSettingsSchemaError,
  isDiningZonesSchemaError,
  isOperatingHoursSchemaError,
  isPaymentSettingsSchemaError,
  OPERATING_HOURS_MIGRATION_HINT,
  PAYMENT_SETTINGS_MIGRATION_HINT,
} from '@/lib/supabase-schema'
import { card, t } from '@/lib/dashboard-theme'

const BUSINESS_SELECT_WITH_BOOKING =
  'id, name, email, phone, business_type, address, system_prompt, agent_name, language, menu_pdf_text, operating_hours, booking_settings, notification_settings'
const BUSINESS_SELECT_WITH_HOURS =
  'id, name, email, phone, business_type, address, system_prompt, agent_name, language, menu_pdf_text, operating_hours, notification_settings'
const BUSINESS_SELECT_BASE =
  'id, name, email, phone, business_type, address, system_prompt, agent_name, language, menu_pdf_text, notification_settings'

type TabId = 'general' | 'ai' | 'menu' | 'notifications' | 'widget' | 'billing'
type CategoryId = SettingsCategoryId
type BusinessType = 'restaurant' | 'cafe' | 'bar' | 'bakery' | 'other'
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

const migrationHintBox: React.CSSProperties = {
  marginBottom: 12,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(220, 38, 38, 0.35)',
  background: 'rgba(220, 38, 38, 0.06)',
  color: 'var(--bk-danger)',
  fontSize: 12,
  lineHeight: 1.5,
}

const settingsFont = 'var(--font-plus-jakarta, system-ui, sans-serif)'

const s = {
  bg: 'var(--bk-bg)',
  panel: 'var(--bk-card)',
  text: 'var(--bk-head)',
  textMuted: 'var(--bk-body)',
  border: 'var(--bk-border)',
  hover: 'var(--bk-surface)',
  iconBg: 'var(--bk-surface)',
  activeBg: 'rgba(56,189,248,0.08)',
  activeBorder: '#38bdf8',
  accent: '#38bdf8',
  shadow: 'var(--bk-shadow)',
} as const

function tabToCategory(tab: TabId): CategoryId {
  if (tab === 'general') return 'restaurant'
  if (tab === 'ai') return 'ai'
  if (tab === 'menu') return 'menu'
  if (tab === 'billing') return 'billing'
  if (tab === 'notifications' || tab === 'widget') return 'integrations'
  return 'restaurant'
}

function SettingsPlaceholder({
  title,
  description,
  reduceMotion,
}: {
  title: string
  description: string
  reduceMotion: boolean | null
}) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={oceanTransition(reduceMotion, { type: 'spring', stiffness: 320, damping: 30 })}
      style={{
        display: 'grid',
        justifyItems: 'center',
        gap: 14,
        padding: '56px 28px',
        textAlign: 'center',
        borderRadius: 14,
        border: '1px dashed rgba(56, 189, 248, 0.35)',
        background: 'linear-gradient(180deg, rgba(56,189,248,0.04) 0%, transparent 100%)',
      }}
    >
      <div
        style={{
          width: 48,
          height: 4,
          borderRadius: 999,
          background: s.accent,
          opacity: 0.5,
        }}
      />
      <div style={{ fontSize: 18, fontWeight: 700, color: s.text }}>{title}</div>
      <p style={{ margin: 0, maxWidth: 360, fontSize: 14, color: s.textMuted, lineHeight: 1.6 }}>
        {description}
      </p>
    </motion.div>
  )
}

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
          <option key={option.value} value={option.value} style={{ color: 'var(--bk-head)', background: 'var(--bk-card)' }}>
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
  const categoryParam = searchParams.get('category')
  const initialTab: TabId =
    tabParam === 'ai' ||
    tabParam === 'menu' ||
    tabParam === 'notifications' ||
    tabParam === 'widget' ||
    tabParam === 'billing' ||
    tabParam === 'general'
      ? tabParam
      : 'general'
  const [activeCategory, setActiveCategory] = useState<CategoryId>(() => {
    if (categoryParam === 'reservations') return 'reservations'
    return tabToCategory(initialTab)
  })
  const [mobileShowDetail, setMobileShowDetail] = useState(false)

  useEffect(() => {
    if (
      tabParam === 'ai' ||
      tabParam === 'menu' ||
      tabParam === 'notifications' ||
      tabParam === 'widget' ||
      tabParam === 'billing' ||
      tabParam === 'general'
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync active category with URL changes
      setActiveCategory(tabToCategory(tabParam))
    }
  }, [tabParam])

  useEffect(() => {
    if (categoryParam === 'reservations') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync active category with URL changes
      setActiveCategory('reservations')
    }
  }, [categoryParam])
  const [saveError, setSaveError] = useState('')
  const [saveSucceeded, setSaveSucceeded] = useState(false)
  const saveSuccessTimerRef = useRef<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [businessRowId, setBusinessRowId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType>('restaurant')
  const [businessPhone, setBusinessPhone] = useState('')
  const [businessEmail, setBusinessEmail] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [hours, setHours] = useState<OperatingHours>(DEFAULT_OPERATING_HOURS)
  const [hoursSchemaReady, setHoursSchemaReady] = useState(true)
  const [bookingSettings, setBookingSettings] = useState<BookingSettings>({
    ...DEFAULT_BOOKING_SETTINGS,
  })
  const [bookingSettingsSchemaReady, setBookingSettingsSchemaReady] = useState(true)
  const [zonesSchemaReady, setZonesSchemaReady] = useState(true)
  const [zoneDrafts, setZoneDrafts] = useState<DiningZoneDraft[]>([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [activityResources, setActivityResources] = useState<ActivityResource[]>(DEFAULT_ACTIVITY_RESOURCES)
  const [reservationSubTab, setReservationSubTab] = useState<'dining' | 'activities'>('dining')

  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT_PLACEHOLDER)
  const [agentName, setAgentName] = useState('AI Concierge')
  const [language, setLanguage] = useState('English (US)')

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  )

  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>({
    ...DEFAULT_PAYMENT_SETTINGS,
  })
  const [paymentSchemaReady, setPaymentSchemaReady] = useState(true)
  const [depositDraft, setDepositDraft] = useState('')


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

  const activeCategoryMeta = useMemo(
    () => SETTINGS_CATEGORIES.find((category) => category.id === activeCategory) ?? SETTINGS_CATEGORIES[0],
    [activeCategory],
  )

  const categoryIndex = SETTINGS_CATEGORIES.findIndex((category) => category.id === activeCategory)
  const [panelDirection, setPanelDirection] = useState(1)

  const showSaveActions =
    activeCategory === 'restaurant' ||
    activeCategory === 'reservations' ||
    activeCategory === 'ai' ||
    activeCategory === 'integrations' ||
    activeCategory === 'billing'

  const widgetEmbedSnippet = useMemo(() => {
    if (!businessRowId || !widgetOrigin) {
      return ''
    }
    return `<script src="${widgetOrigin}/widget.js?id=${businessRowId}" async></script>`
  }, [businessRowId, widgetOrigin])

  useEffect(() => {
    let isMounted = true

    async function hydrateForUserId(userId: string) {
      let data: Record<string, unknown> | null = null
      let schemaReady = true

      const withBooking = await supabase
        .from('businesses')
        .select(BUSINESS_SELECT_WITH_BOOKING)
        .eq('user_id', userId)
        .maybeSingle()

      if (!isMounted) return

      if (!withBooking.error && withBooking.data) {
        data = withBooking.data as Record<string, unknown>
        setBookingSettingsSchemaReady(true)
        setBookingSettings(parseBookingSettings(data.booking_settings))
      } else if (isBookingSettingsSchemaError(withBooking.error?.message)) {
        setBookingSettingsSchemaReady(false)
        const withHours = await supabase
          .from('businesses')
          .select(BUSINESS_SELECT_WITH_HOURS)
          .eq('user_id', userId)
          .maybeSingle()
        if (!isMounted) return
        if (!withHours.error && withHours.data) {
          data = withHours.data as Record<string, unknown>
        } else if (isOperatingHoursSchemaError(withHours.error?.message)) {
          schemaReady = false
          const fallback = await supabase
            .from('businesses')
            .select(BUSINESS_SELECT_BASE)
            .eq('user_id', userId)
            .maybeSingle()
          if (!isMounted) return
          if (!fallback.error && fallback.data) {
            data = fallback.data as Record<string, unknown>
          }
        } else if (withHours.data) {
          data = withHours.data as Record<string, unknown>
        }
      } else if (isOperatingHoursSchemaError(withBooking.error?.message)) {
        schemaReady = false
        setBookingSettingsSchemaReady(false)
        const fallback = await supabase
          .from('businesses')
          .select(BUSINESS_SELECT_BASE)
          .eq('user_id', userId)
          .maybeSingle()
        if (!isMounted) return
        if (!fallback.error && fallback.data) {
          data = fallback.data as Record<string, unknown>
        }
      }

      if (data) {
        setHoursSchemaReady(schemaReady)
        setBusinessRowId((data.id as string) ?? null)
        setBusinessName((data.name as string) ?? '')
        setBusinessEmail((data.email as string) ?? '')
        setBusinessPhone((data.phone as string) ?? '')
        setBusinessType((data.business_type as BusinessType) ?? 'restaurant')
        setBusinessAddress((data.address as string) ?? '')
        if (data.system_prompt) setSystemPrompt(data.system_prompt as string)
        if (data.agent_name) setAgentName(data.agent_name as string)
        setLanguage((data.language as string) ?? 'English (US)')
        setMenuPdfText((data.menu_pdf_text as string | null) ?? null)
        if (schemaReady) {
          setHours(parseOperatingHours(data.operating_hours))
        }
        setNotificationSettings(parseNotificationSettings(data.notification_settings))
      }

      // Deposit settings (tolerates the payment_settings column not existing yet).
      const payRes = await supabase
        .from('businesses')
        .select('payment_settings')
        .eq('user_id', userId)
        .maybeSingle()
      if (!isMounted) return
      if (payRes.error) {
        if (isPaymentSettingsSchemaError(payRes.error.message)) setPaymentSchemaReady(false)
      } else if (payRes.data) {
        const parsed = parsePaymentSettings(
          (payRes.data as { payment_settings?: unknown }).payment_settings,
        )
        setPaymentSettings(parsed)
        setDepositDraft(parsed.deposit_per_guest > 0 ? String(parsed.deposit_per_guest) : '')
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
      if (saveSuccessTimerRef.current) {
        window.clearTimeout(saveSuccessTimerRef.current)
      }
    }
  }, [])

  const loadZonesForBusiness = async (bizId: string) => {
    setZonesLoading(true)
    const { data, error } = await supabase
      .from('dining_zones')
      .select('*')
      .eq('business_id', bizId)
      .order('sort_order', { ascending: true })

    if (error && isDiningZonesSchemaError(error.message)) {
      setZonesSchemaReady(false)
      setZoneDrafts([])
    } else if (!error) {
      setZonesSchemaReady(true)
      const rows = (data ?? []).map((r) => parseDiningZoneRow(r as Record<string, unknown>))
      if (rows.length === 0) {
        setZoneDrafts([defaultMainDiningZone(bizId, bookingSettings)])
      } else {
        setZoneDrafts(rows)
      }
    }
    setZonesLoading(false)
  }

  useEffect(() => {
    if (!businessRowId || activeCategory !== 'reservations') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async zone fetch syncs external Supabase state
    void loadZonesForBusiness(businessRowId)
    const stored = localStorage.getItem(`activity_resources_${businessRowId}`)
    if (stored) {
      try { setActivityResources(JSON.parse(stored)) } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadZonesForBusiness identity changes every render; keyed by businessRowId
  }, [businessRowId, activeCategory])

  const saveReservations = async (bizId: string) => {
    if (!bookingSettingsSchemaReady) {
      setSaveError(BOOKING_SETTINGS_MIGRATION_HINT)
      return false
    }

    const { error: bizErr } = await supabase
      .from('businesses')
      .update({ booking_settings: bookingSettings })
      .eq('id', bizId)

    if (bizErr) {
      if (isBookingSettingsSchemaError(bizErr.message)) {
        setBookingSettingsSchemaReady(false)
        setSaveError(BOOKING_SETTINGS_MIGRATION_HINT)
      } else {
        setSaveError(bizErr.message ?? 'Failed to save booking settings')
      }
      return false
    }

    if (!zonesSchemaReady) {
      setSaveError(DINING_ZONES_MIGRATION_HINT)
      return false
    }

    const existingIds = new Set(zoneDrafts.filter((z) => z.id).map((z) => z.id!))
    const { data: existingRows } = await supabase
      .from('dining_zones')
      .select('id')
      .eq('business_id', bizId)

    for (const row of existingRows ?? []) {
      const id = String((row as { id: string }).id)
      if (!existingIds.has(id)) {
        await supabase.from('dining_zones').update({ is_active: false }).eq('id', id)
      }
    }

    const nextDrafts = [...zoneDrafts]
    for (let i = 0; i < nextDrafts.length; i++) {
      const z = nextDrafts[i]
      const payload = {
        business_id: bizId,
        name: z.name.trim() || 'Zone',
        slug: z.slug?.trim() || slugifyZoneName(z.name),
        max_concurrent_parties: z.max_concurrent_parties,
        min_party_size: z.min_party_size,
        max_party_size: z.max_party_size,
        turnover_minutes: z.turnover_minutes,
        is_active: z.is_active,
        sort_order: i,
        updated_at: new Date().toISOString(),
      }

      if (z.id) {
        const { error } = await supabase.from('dining_zones').update(payload).eq('id', z.id)
        if (error) {
          setSaveError(error.message ?? 'Failed to update zone')
          return false
        }
      } else {
        const { data: inserted, error } = await supabase
          .from('dining_zones')
          .insert(payload)
          .select('*')
          .maybeSingle()
        if (error) {
          if (isDiningZonesSchemaError(error.message)) {
            setZonesSchemaReady(false)
            setSaveError(DINING_ZONES_MIGRATION_HINT)
          } else {
            setSaveError(error.message ?? 'Failed to create zone')
          }
          return false
        }
        if (inserted) {
          nextDrafts[i] = parseDiningZoneRow(inserted as Record<string, unknown>)
        }
      }
    }

    setZoneDrafts(nextDrafts)
    await loadZonesForBusiness(bizId)
    localStorage.setItem(`activity_resources_${bizId}`, JSON.stringify(activityResources))
    return true
  }

  const savePayments = async (bizId: string) => {
    if (!paymentSchemaReady) {
      setSaveError(PAYMENT_SETTINGS_MIGRATION_HINT)
      return false
    }
    const parsed = parseFloat(depositDraft)
    const perGuest = Number.isFinite(parsed) && parsed >= 0 ? Math.min(10000, parsed) : 0
    const next: PaymentSettings = {
      deposit_enabled: paymentSettings.deposit_enabled,
      deposit_per_guest: perGuest,
    }
    const { error } = await supabase
      .from('businesses')
      .update({ payment_settings: next })
      .eq('id', bizId)
    if (error) {
      if (isPaymentSettingsSchemaError(error.message)) {
        setPaymentSchemaReady(false)
        setSaveError(PAYMENT_SETTINGS_MIGRATION_HINT)
      } else {
        setSaveError(error.message ?? 'Failed to save deposit settings')
      }
      return false
    }
    setPaymentSettings(next)
    return true
  }

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
    setSaveSucceeded(false)

    if (activeCategory === 'reservations' || activeCategory === 'billing') {
      let bizId = businessRowId
      if (!bizId) {
        const { data: row } = await supabase.from('businesses').select('id').eq('user_id', userId).maybeSingle()
        bizId = row?.id ?? null
        if (bizId) setBusinessRowId(bizId)
      }
      if (!bizId) {
        setSaveError('Save restaurant profile first (Restaurant tab).')
        setIsSaving(false)
        return
      }
      const ok =
        activeCategory === 'billing' ? await savePayments(bizId) : await saveReservations(bizId)
      setIsSaving(false)
      if (ok) {
        setSaveSucceeded(true)
        if (saveSuccessTimerRef.current) window.clearTimeout(saveSuccessTimerRef.current)
        saveSuccessTimerRef.current = window.setTimeout(() => {
          setSaveSucceeded(false)
          saveSuccessTimerRef.current = null
        }, 2200)
      }
      return
    }

    const hoursError = activeCategory === 'restaurant' ? validateOperatingHours(hours) : null
    if (hoursError) {
      setSaveError(hoursError)
      setIsSaving(false)
      return
    }

    const basePayload = {
      user_id: userId,
      name: businessName,
      email: businessEmail,
      phone: businessPhone,
      business_type: businessType,
      address: businessAddress,
      system_prompt: systemPrompt,
      agent_name: agentName,
      language,
      notification_settings: notificationSettings,
    }

    const payloadWithHours = { ...basePayload, operating_hours: hours }

    let requestError: { message?: string } | null = null
    let hoursSaveSkipped = false

    const persist = async (payload: typeof basePayload & { operating_hours?: OperatingHours }) => {
      if (businessRowId) {
        return supabase.from('businesses').update(payload).eq('id', businessRowId)
      }
      return supabase.from('businesses').insert(payload).select('id').maybeSingle()
    }

    let result = await persist(hoursSchemaReady ? payloadWithHours : basePayload)

    if (result.error && isOperatingHoursSchemaError(result.error.message)) {
      setHoursSchemaReady(false)
      hoursSaveSkipped = true
      result = await persist(basePayload)
    }

    requestError = result.error

    if (!requestError && !businessRowId && 'data' in result) {
      const insertData = result.data as { id?: string } | null
      if (insertData?.id) {
        setBusinessRowId(insertData.id)
      } else {
        const { data: row } = await supabase.from('businesses').select('id').eq('user_id', userId).maybeSingle()
        if (row?.id) {
          setBusinessRowId(row.id)
        }
      }
    }

    if (requestError) {
      setSaveError(requestError.message ?? 'Failed to save')
      setIsSaving(false)
      return
    }

    if (hoursSaveSkipped) {
      setSaveError(
        `Other settings saved. ${OPERATING_HOURS_MIGRATION_HINT}`,
      )
      setIsSaving(false)
      return
    }

    setHoursSchemaReady(true)

    setSaveSucceeded(true)
    if (saveSuccessTimerRef.current) {
      window.clearTimeout(saveSuccessTimerRef.current)
    }
    saveSuccessTimerRef.current = window.setTimeout(() => {
      setSaveSucceeded(false)
      saveSuccessTimerRef.current = null
    }, 2200)

    setIsSaving(false)
  }

  useEffect(() => {
    if (activeCategory !== 'menu' || !businessRowId) return
    const key = `${activeCategory}:${businessRowId}`
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
  }, [activeCategory, businessRowId])

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

    if (activeCategory === 'team') {
      return (
        <SettingsPlaceholder
          reduceMotion={reduceMotion}
          title="Team management"
          description="Invite staff and assign manager or host roles. Coming soon."
        />
      )
    }

    if (activeCategory === 'security') {
      return (
        <SettingsPlaceholder
          reduceMotion={reduceMotion}
          title="Security"
          description="Password changes and two-factor authentication will live here. Coming soon."
        />
      )
    }

    if (activeCategory === 'reservations') {
      return (
        <div style={{ display: 'grid', gap: 16 }}>
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
              Booking defaults
            </div>
            {!bookingSettingsSchemaReady ? (
              <div style={migrationHintBox}>{BOOKING_SETTINGS_MIGRATION_HINT}</div>
            ) : null}
            <BookingSettingsPanel
              settings={bookingSettings}
              onChange={setBookingSettings}
              disabled={!bookingSettingsSchemaReady || isSaving}
            />
          </div>

          {reservationSubTab === 'dining' ? (
            <div style={{ ...glassCard, padding: 16 }}>
              <div style={{ color: t.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 14 }}>
                Dining Zones
              </div>
              {!zonesSchemaReady ? (
                <div style={migrationHintBox}>{DINING_ZONES_MIGRATION_HINT}</div>
              ) : zonesLoading ? (
                <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>Loading zones…</p>
              ) : (
                <DiningZonesPanel
                  zones={zoneDrafts}
                  bookingSettings={bookingSettings}
                  onChange={setZoneDrafts}
                  disabled={!zonesSchemaReady || isSaving}
                />
              )}
            </div>
          ) : (
            <div style={{ ...glassCard, padding: 16 }}>
              <div style={{ color: t.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 6 }}>
                Activities
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
                Bookable activity resources — pool tables, tennis tables, and more.
                Changes are saved with the rest of your Reservations settings.
              </p>
              <ActivityResourcesPanel
                resources={activityResources}
                onChange={setActivityResources}
                disabled={isSaving}
              />
            </div>
          )}
        </div>
      )
    }

    if (activeCategory === 'restaurant') {
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

          <AddressAutocompleteField
            value={businessAddress}
            onChange={setBusinessAddress}
            hint="Start typing an address in Canada, or enter it manually."
          />

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
            {!hoursSchemaReady ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(220, 38, 38, 0.35)',
                  background: 'rgba(220, 38, 38, 0.06)',
                  color: 'var(--bk-danger)',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                {OPERATING_HOURS_MIGRATION_HINT}
              </div>
            ) : null}
            <WorkingHoursPanel hours={hours} onChange={setHours} reduceMotion={reduceMotion} />
          </div>
        </div>
      )
    }

    if (activeCategory === 'ai') {
      return (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <FloatingField
              label="System Prompt"
              value={systemPrompt}
              onChange={setSystemPrompt}
              multiline
              rows={8}
            />
            <p style={{ margin: 0, fontSize: 12, color: t.textMuted, lineHeight: 1.55 }}>
              Sets tone and style only. Booking rules, menu, hours, and escalation are added
              automatically. Concierge name ({agentName.trim() || 'AI Concierge'}) is injected
              on every reply so the bot matches the widget.
            </p>
          </div>
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
            <p style={{ margin: '-2px 0 2px', fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
              When triggered, the concierge quietly alerts you by email and keeps helping the guest.
            </p>
            {[
              {
                label: 'Guest complaint',
                checked: notificationSettings.escalate_complaint,
                onChange: (v: boolean) =>
                  setNotificationSettings((p) => ({ ...p, escalate_complaint: v })),
              },
              {
                label: 'Large party (8+ guests)',
                checked: notificationSettings.escalate_large_party,
                onChange: (v: boolean) =>
                  setNotificationSettings((p) => ({ ...p, escalate_large_party: v })),
              },
              {
                label: 'Allergy or dietary risk',
                checked: notificationSettings.escalate_allergy,
                onChange: (v: boolean) =>
                  setNotificationSettings((p) => ({ ...p, escalate_allergy: v })),
              },
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

    if (activeCategory === 'menu') {
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
                      <option key={c} value={c} style={{ background: 'var(--bk-card)', color: 'var(--bk-head)' }}>{c}</option>
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
                      border: `1px solid ${isHovered ? 'var(--bk-border-strong)' : 'var(--bk-border)'}`,
                      background: isHovered ? 'var(--bk-surface)' : 'var(--bk-card)',
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
              style={{ borderRadius: 12, border: '1.5px dashed var(--bk-border-strong)', background: 'var(--bk-surface)', padding: 24, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
              onClick={() => menuPdfInputRef.current?.click()}
            >
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--bk-surface-2)', display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0 }}>📄</div>
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

    if (activeCategory === 'integrations') {
      return (
        <div style={{ display: 'grid', gap: 32 }}>
          <section style={{ display: 'grid', gap: 16 }}>
            <div>
              <div style={{ color: s.text, fontSize: 18, fontWeight: 700 }}>Notifications</div>
              <p style={{ margin: '6px 0 0', color: s.textMuted, fontSize: 14, lineHeight: 1.6 }}>
                Choose how OceanCore alerts you about reservations and escalations.
              </p>
            </div>
              {[
                {
                  label: 'Email me when a new reservation comes in',
                  checked: notificationSettings.email_on_reservation,
                  onChange: (v: boolean) =>
                    setNotificationSettings((p) => ({ ...p, email_on_reservation: v })),
                },
                {
                  label: 'Email me when a new guest starts a chat',
                  checked: notificationSettings.email_on_new_chat,
                  onChange: (v: boolean) =>
                    setNotificationSettings((p) => ({ ...p, email_on_new_chat: v })),
                },
                {
                  label: 'Email guests a booking confirmation (when their email is known)',
                  checked: notificationSettings.email_guest_confirmation,
                  onChange: (v: boolean) =>
                    setNotificationSettings((p) => ({ ...p, email_guest_confirmation: v })),
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
                    border: `1px solid ${s.border}`,
                    background: s.panel,
                    padding: '16px 18px',
                    color: s.text,
                    fontSize: 14,
                  }}
                >
                  {item.label}
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) => item.onChange(event.target.checked)}
                  />
                </label>
              ))}
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ opacity: 0.55, pointerEvents: 'none' }}>
                <FloatingSelect
                  label="Digest Frequency"
                  value={notificationSettings.digest_frequency}
                  onChange={(v) =>
                    setNotificationSettings((p) => ({
                      ...p,
                      digest_frequency: v as 'daily' | 'weekly' | 'off',
                    }))
                  }
                  options={[
                    { value: 'daily', label: 'Daily summary' },
                    { value: 'weekly', label: 'Weekly summary' },
                    { value: 'off', label: 'Off' },
                  ]}
                />
              </div>
              <p style={{ margin: 0, fontSize: 12, color: s.textMuted }}>
                Digest summary emails are coming soon — this preference will apply once they launch.
              </p>
            </div>
          </section>

          <section style={{ display: 'grid', gap: 18, paddingTop: 8, borderTop: `1px solid ${s.border}` }}>
            <div>
              <div style={{ color: s.text, fontSize: 18, fontWeight: 700 }}>Website widget</div>
              <p style={{ margin: '6px 0 0', color: s.textMuted, fontSize: 14, lineHeight: 1.65 }}>
                Drop this snippet into your website to launch the OceanCore concierge for guests.
              </p>
            </div>
            {widgetEmbedSnippet ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ color: s.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
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
                      border: `1px solid ${widgetCopied ? 'rgba(56,189,248,0.35)' : s.border}`,
                      background: widgetCopied ? 'rgba(56,189,248,0.08)' : s.panel,
                      color: widgetCopied ? s.accent : s.text,
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
                    background: s.bg,
                    border: `1px solid ${s.border}`,
                    color: s.text,
                    overflowX: 'auto',
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  <code>{widgetEmbedSnippet}</code>
                </pre>
              </div>
            ) : (
              <div style={{ color: s.textMuted, fontSize: 14 }}>
                {!businessRowId
                  ? 'Save your restaurant profile first so we can generate your widget snippet.'
                  : 'Loading embed URL...'}
              </div>
            )}
          </section>

          <section style={{ display: 'grid', gap: 12, paddingTop: 8, borderTop: `1px solid ${s.border}` }}>
            <div style={{ color: s.text, fontSize: 18, fontWeight: 700 }}>POS & channels</div>
            <SettingsPlaceholder
              reduceMotion={reduceMotion}
              title="More integrations coming soon"
              description="Connect your POS, reservation platforms, and messaging channels in one place."
            />
          </section>
        </div>
      )
    }

    if (activeCategory === 'billing') {
      const depositPreview = parseFloat(depositDraft)
      const previewValid = Number.isFinite(depositPreview) && depositPreview > 0
      return (
        <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
          {/* Reservation deposits */}
          <div style={{ borderRadius: 12, border: `1px solid ${s.border}`, background: s.panel, padding: 18, boxShadow: s.shadow }}>
            <div style={{ color: s.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              Reservation deposits
            </div>
            {!paymentSchemaReady && (
              <div style={{ ...migrationHintBox, marginTop: 12 }}>{PAYMENT_SETTINGS_MIGRATION_HINT}</div>
            )}
            <p style={{ margin: '10px 0 14px', color: s.textMuted, fontSize: 13, lineHeight: 1.6 }}>
              Collect a per-guest deposit through Stripe when the AI concierge books a table.
              Guests receive a secure payment link; the reservation is confirmed automatically
              once the deposit is paid. Deposits reduce no-shows significantly.
            </p>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 10,
                border: `1px solid ${s.border}`,
                background: paymentSettings.deposit_enabled ? s.activeBg : s.bg,
                cursor: 'pointer',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: s.text }}>Require deposit</div>
                <div style={{ fontSize: 12, color: s.textMuted, marginTop: 2 }}>
                  The bot mentions the deposit before booking and shares the payment link after
                </div>
              </div>
              <input
                type="checkbox"
                checked={paymentSettings.deposit_enabled}
                disabled={!paymentSchemaReady || isSaving}
                onChange={(e) =>
                  setPaymentSettings((prev) => ({ ...prev, deposit_enabled: e.target.checked }))
                }
              />
            </label>

            <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: s.textMuted }}>
                Deposit per guest (CAD)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative', width: 160 }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: s.textMuted, fontSize: 14 }}>
                    $
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={depositDraft}
                    disabled={!paymentSchemaReady || isSaving}
                    onChange={(e) => setDepositDraft(e.target.value)}
                    placeholder="10"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 24px',
                      borderRadius: 10,
                      border: `1px solid ${s.border}`,
                      fontSize: 14,
                      color: s.text,
                      background: 'var(--bk-card)',
                    }}
                  />
                </div>
                {previewValid && paymentSettings.deposit_enabled && (
                  <span style={{ fontSize: 12, color: s.textMuted }}>
                    Party of 4 pays ${(depositPreview * 4).toFixed(2)} CAD
                  </span>
                )}
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                padding: '10px 12px',
                borderRadius: 8,
                background: s.bg,
                border: `1px solid ${s.border}`,
                fontSize: 12,
                color: s.textMuted,
                lineHeight: 1.6,
              }}
            >
              Stripe keys are configured on the server via <code>STRIPE_SECRET_KEY</code> and{' '}
              <code>STRIPE_WEBHOOK_SECRET</code> environment variables. Point the Stripe webhook
              to <code>/api/payments/webhook</code>. Until the keys are set, bookings work
              normally without a deposit.
            </div>
          </div>

          {/* Plan */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div style={{ borderRadius: 12, border: `1px solid ${s.border}`, background: s.panel, padding: 16, boxShadow: s.shadow }}>
              <div style={{ color: s.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                Plan
              </div>
              <div style={{ marginTop: 10, color: s.text, fontSize: 28, fontWeight: 700 }}>Early access</div>
            </div>
            <div style={{ borderRadius: 12, border: `1px solid ${s.border}`, background: s.panel, padding: 16, boxShadow: s.shadow }}>
              <div style={{ color: s.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                Subscription
              </div>
              <div style={{ marginTop: 10, color: s.text, fontSize: 20, fontWeight: 700 }}>Free during beta</div>
            </div>
          </div>
        </div>
      )
    }

    return null
  })()

  const selectCategory = (categoryId: CategoryId, mobile: boolean) => {
    const nextIndex = SETTINGS_CATEGORIES.findIndex((c) => c.id === categoryId)
    setPanelDirection(nextIndex >= categoryIndex ? 1 : -1)
    setActiveCategory(categoryId)
    if (mobile) setMobileShowDetail(true)
  }

  return (
    <>
      <DashboardOceanNav activeNav="Settings">
        {({ isMobile, openNav }) => (
          <div
            style={{
              fontFamily: settingsFont,
              margin: isMobile ? '-20px -16px' : '-36px',
              minHeight: isMobile ? 'calc(100vh - 64px)' : 'calc(100vh - 72px)',
              background: s.bg,
            }}
          >
            {isMobile ? (
              <motion.button
                type="button"
                onClick={openNav}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                style={{
                  position: 'absolute',
                  top: 20,
                  left: 16,
                  zIndex: 20,
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  border: `1px solid ${s.border}`,
                  background: s.panel,
                  color: s.text,
                  fontSize: 22,
                  cursor: 'pointer',
                  boxShadow: s.shadow,
                }}
              >
                ☰
              </motion.button>
            ) : null}

            <main
              style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                gap: isMobile ? 0 : 24,
                padding: isMobile ? '20px 16px 24px' : '28px 32px 32px',
                minHeight: 'inherit',
              }}
            >
              {/* Left panel — category navigation */}
              {(!isMobile || !mobileShowDetail) && (
                <aside
                  style={{
                    width: isMobile ? '100%' : 280,
                    flexShrink: 0,
                    paddingTop: isMobile ? 52 : 0,
                  }}
                >
                  <div style={{ marginBottom: 20, paddingLeft: 2 }}>
                    <h1
                      style={{
                        margin: 0,
                        fontSize: isMobile ? 22 : 24,
                        fontWeight: 700,
                        color: s.text,
                        letterSpacing: '-0.02em',
                        lineHeight: 1.2,
                      }}
                    >
                      Settings
                    </h1>
                    {businessName.trim() ? (
                      <p
                        style={{
                          margin: '6px 0 0',
                          fontSize: 13,
                          fontWeight: 500,
                          color: s.accent,
                          lineHeight: 1.3,
                        }}
                      >
                        {businessName.trim()}
                      </p>
                    ) : null}
                  </div>

                  <SettingsCategoryNav
                    activeId={activeCategory}
                    onSelect={(id) => selectCategory(id, isMobile)}
                    reduceMotion={reduceMotion}
                    activeSubId={activeCategory === 'reservations' ? reservationSubTab : undefined}
                    onSelectSub={(id) => setReservationSubTab(id as 'dining' | 'activities')}
                  />
                </aside>
              )}

              {/* Right panel — category content */}
              {(!isMobile || mobileShowDetail) && (
                <section
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: s.panel,
                    border: `1px solid ${s.border}`,
                    borderRadius: 16,
                    boxShadow: s.shadow,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: isMobile ? 'flex-start' : 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: isMobile ? '16px 18px' : '18px 22px',
                      borderBottom: `1px solid ${s.border}`,
                      flexDirection: isMobile ? 'column' : 'row',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      {isMobile ? (
                        <button
                          type="button"
                          onClick={() => setMobileShowDetail(false)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: s.accent,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: 0,
                            flexShrink: 0,
                          }}
                        >
                          ← Back
                        </button>
                      ) : null}
                      <div style={{ minWidth: 0 }}>
                        <motion.div
                          key={activeCategory}
                          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={oceanTransition(reduceMotion, { type: 'spring', stiffness: 360, damping: 32 })}
                        >
                          <div style={{ fontSize: 18, fontWeight: 700, color: s.text, lineHeight: 1.25 }}>
                            {activeCategoryMeta.title}
                          </div>
                          <div style={{ marginTop: 3, fontSize: 12, color: s.textMuted, lineHeight: 1.4 }}>
                            {activeCategoryMeta.description}
                          </div>
                        </motion.div>
                      </div>
                    </div>

                    {showSaveActions ? (
                      <div style={{ display: 'grid', gap: 8, justifyItems: isMobile ? 'stretch' : 'end', width: isMobile ? '100%' : 'auto' }}>
                        {saveError ? (
                          <div style={{ color: 'var(--bk-danger)', fontSize: 13, fontWeight: 600 }}>{saveError}</div>
                        ) : null}
                        <motion.button
                          type="button"
                          onClick={() => void handleSave()}
                          disabled={isLoading || isSaving}
                          aria-live="polite"
                          whileHover={
                            isLoading || isSaving || saveSucceeded || reduceMotion ? undefined : { y: -1 }
                          }
                          whileTap={
                            isLoading || isSaving || saveSucceeded || reduceMotion ? undefined : { scale: 0.98 }
                          }
                          animate={{
                            backgroundColor: saveSucceeded
                              ? '#0f766e'
                              : isLoading || isSaving
                                ? 'var(--bk-surface-2)'
                                : '#38bdf8',
                            color: saveSucceeded
                              ? '#ffffff'
                              : isLoading || isSaving
                                ? 'var(--bk-body)'
                                : '#0f172a',
                          }}
                          transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                          style={{
                            border: 'none',
                            borderRadius: 10,
                            padding: '11px 20px',
                            minWidth: 132,
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: isLoading || isSaving ? 'not-allowed' : 'pointer',
                            width: isMobile ? '100%' : 'auto',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 7,
                            boxShadow: saveSucceeded
                              ? '0 4px 14px rgba(15, 118, 110, 0.28)'
                              : '0 1px 2px rgba(15, 23, 42, 0.06)',
                          }}
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            {isLoading ? (
                              <motion.span
                                key="loading"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.15 }}
                              >
                                Loading…
                              </motion.span>
                            ) : isSaving ? (
                              <motion.span
                                key="saving"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.15 }}
                              >
                                Saving…
                              </motion.span>
                            ) : saveSucceeded ? (
                              <motion.span
                                key="saved"
                                initial={{ opacity: 0, scale: 0.92 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.96 }}
                                transition={{ duration: 0.2 }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                              >
                                <span
                                  aria-hidden
                                  style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: '50%',
                                    background: 'rgba(255,255,255,0.22)',
                                    display: 'grid',
                                    placeItems: 'center',
                                    fontSize: 11,
                                    lineHeight: 1,
                                  }}
                                >
                                  ✓
                                </span>
                                Saved
                              </motion.span>
                            ) : (
                              <motion.span
                                key="idle"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.15 }}
                              >
                                Save Changes
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                    <AnimatePresence mode="wait" custom={panelDirection}>
                      <motion.div
                        key={activeCategory}
                        custom={panelDirection}
                        variants={settingsPanelHeavy}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={oceanTransition(reduceMotion)}
                      >
                        {tabPanel}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </section>
              )}
            </main>
          </div>
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
