'use client'

import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { AddressAutocompleteField } from '@/components/address-autocomplete-field'
import { BusinessTimezoneSelect } from '@/components/business-timezone-select'
import {
  isTimezoneSchemaError,
  parseBusinessTimezoneInput,
  resolveBusinessTimezone,
  suggestTimezoneFromAddress,
  type CanadianBusinessTimezone,
} from '@/lib/business-timezone'
import { assertTimezoneChangeAllowed } from '@/lib/business-timezone-change'
import {
  SETTINGS_CATEGORIES,
  settingsIndexFont,
  settingsIndexLabel,
  type SettingsCategoryId,
} from '@/components/settings-category-nav'
import { SettingsTabNav } from '@/components/settings-tab-nav'
import { SettingsHero } from '@/components/settings-hero'
import { SettingsToggle } from '@/components/settings-toggle'
import { SecurityPanel } from '@/components/security-panel'
import { TeamMembersPanel } from '@/components/team-members-panel'
import { BookingSettingsPanel } from '@/components/booking-settings-panel'
import { DiningZonesPanel, type DiningZoneDraft } from '@/components/dining-zones-panel'
import { WorkingHoursPanel } from '@/components/working-hours-panel'
import {
  ActivityResourcesPanel,
  type ActivityResource,
} from '@/components/activity-resources-panel'
import {
  isActivityType,
  isUuid,
  parseActivityResourceRow,
  slugifyActivityName,
} from '@/lib/activity-resources'
import {
  CANADIAN_LANGUAGE_OPTIONS,
  DEFAULT_LANGUAGE_PREFERENCE,
  normalizeLanguagePreference,
} from '@/lib/language-preferences'
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
import type { BusinessReadiness } from '@/lib/business-readiness'
import { validateZoneCapacityInput } from '@/lib/business-readiness'
import {
  categorySave,
  operatingHoursPatch,
  WORKING_HOURS_SAVE,
} from '@/lib/settings-save-policy'
import { draftFromDiningZoneRow, slugifyZoneName } from '@/lib/dining-zones'
import { MENU_PDF_MAX_BYTES, MENU_PDF_MAX_MB } from '@/lib/menu-pdf-limits'
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
  ACTIVITY_RESOURCES_MIGRATION_HINT,
  isActivityResourcesSchemaError,
  isDiningZonesSchemaError,
  isOperatingHoursSchemaError,
  isPaymentSettingsSchemaError,
  isWidgetLauncherColorSchemaError,
  OPERATING_HOURS_MIGRATION_HINT,
  PAYMENT_SETTINGS_MIGRATION_HINT,
  WIDGET_LAUNCHER_COLOR_MIGRATION_HINT,
} from '@/lib/supabase-schema'
import { card, t } from '@/lib/dashboard-theme'
import {
  DEFAULT_WIDGET_LAUNCHER_COLOR,
  parseWidgetLauncherColor,
} from '@/lib/widget-theme'
import { ColorSwatchPicker } from '@/components/color-swatch-picker'

const BUSINESS_SELECT_WITH_BOOKING =
  'id, name, email, phone, business_type, address, timezone, system_prompt, agent_name, language, menu_pdf_text, operating_hours, operating_hours_confirmed_at, booking_settings, notification_settings'
const BUSINESS_SELECT_WITH_BOOKING_NO_TZ =
  'id, name, email, phone, business_type, address, system_prompt, agent_name, language, menu_pdf_text, operating_hours, operating_hours_confirmed_at, booking_settings, notification_settings'
const BUSINESS_SELECT_WITH_HOURS =
  'id, name, email, phone, business_type, address, timezone, system_prompt, agent_name, language, menu_pdf_text, operating_hours, operating_hours_confirmed_at, notification_settings'
const BUSINESS_SELECT_WITH_HOURS_NO_TZ =
  'id, name, email, phone, business_type, address, system_prompt, agent_name, language, menu_pdf_text, operating_hours, operating_hours_confirmed_at, notification_settings'
const BUSINESS_SELECT_BASE =
  'id, name, email, phone, business_type, address, timezone, system_prompt, agent_name, language, menu_pdf_text, notification_settings'
const BUSINESS_SELECT_BASE_NO_TZ =
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

function ReservationModeIcon({ mode }: { mode: 'dining' | 'activities' }) {
  if (mode === 'dining') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 11.5h14M7 11.5v7M17 11.5v7M8 8.5h8a2 2 0 0 1 2 2v1H6v-1a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 5.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <path d="m17.6 6.4 2-2M6.4 17.6l-2 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function ReservationModeSwitcher({ value, diningCount, activityCount, onChange }: {
  value: 'dining' | 'activities'
  diningCount: number
  activityCount: number
  onChange: (value: 'dining' | 'activities') => void
}) {
  const options = [
    { value: 'dining' as const, title: 'Dining & tables', description: 'Set booking pace and capacity for each seating area.', count: `${diningCount} ${diningCount === 1 ? 'area' : 'areas'}`, color: '#0284c7', tint: 'rgba(56,189,248,0.10)', border: 'rgba(14,165,233,0.45)' },
    { value: 'activities' as const, title: 'Activities & games', description: 'Organize pool tables, courts, lanes, and experiences.', count: `${activityCount} ${activityCount === 1 ? 'resource' : 'resources'}`, color: 'var(--bk-purple)', tint: 'var(--bk-purple-bg)', border: 'rgba(124,58,237,0.38)' },
  ]

  return (
    <section style={{ padding: 16, borderRadius: 14, border: '1px solid var(--bk-border)', background: 'linear-gradient(145deg, rgba(56,189,248,0.055), transparent 48%), var(--bk-card)', boxShadow: 'var(--bk-shadow)', display: 'grid', gap: 13 }} aria-labelledby="reservation-mode-title">
      <div>
        <h2 id="reservation-mode-title" style={{ margin: 0, color: 'var(--bk-head)', fontSize: 16, fontWeight: 750, letterSpacing: '-0.015em' }}>What can guests reserve?</h2>
        <p style={{ margin: '5px 0 0', color: 'var(--bk-body)', fontSize: 12.5, lineHeight: 1.5 }}>Choose one workspace. Each has its own settings, so table rules never get mixed with activity inventory.</p>
      </div>
      <div role="tablist" aria-label="Reservation workspace" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(225px, 1fr))', gap: 9 }}>
        {options.map((option) => {
          const selected = value === option.value
          return (
            <button key={option.value} type="button" role="tab" aria-selected={selected} aria-controls={`reservation-${option.value}-panel`} onClick={() => onChange(option.value)} style={{ position: 'relative', display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', alignItems: 'center', gap: 11, width: '100%', minHeight: 92, padding: 12, borderRadius: 13, border: `1.5px solid ${selected ? option.border : 'var(--bk-border)'}`, background: selected ? option.tint : 'var(--bk-surface)', boxShadow: selected ? '0 8px 22px rgba(15,23,42,0.07)' : 'none', color: 'var(--bk-head)', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: selected ? 'var(--bk-card)' : 'var(--bk-surface-2)', color: selected ? option.color : 'var(--bk-muted)', boxShadow: selected ? '0 4px 12px rgba(15,23,42,0.07)' : 'none' }}><ReservationModeIcon mode={option.value} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><span style={{ color: selected ? option.color : 'var(--bk-head)', fontSize: 13.5, fontWeight: 750 }}>{option.title}</span><span style={{ flexShrink: 0, padding: '3px 6px', borderRadius: 999, background: 'var(--bk-card)', color: 'var(--bk-muted)', fontSize: 9.5, fontWeight: 700 }}>{option.count}</span></span>
                <span style={{ display: 'block', marginTop: 4, color: 'var(--bk-body)', fontSize: 11.5, lineHeight: 1.4 }}>{option.description}</span>
              </span>
              {selected ? <span aria-hidden style={{ position: 'absolute', top: 9, right: 9, width: 6, height: 6, borderRadius: 999, background: option.color }} /> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
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

/**
 * Spells out what the language setting actually does at chat time.
 *
 * The two rules that surprise owners are that the concierge does not mirror a
 * guest who switches language, and that it asks first — so both are stated
 * here, next to the control, rather than being discovered in a live chat.
 */
function LanguageBehaviourNote({ language }: { language: string }) {
  const isAuto = language === DEFAULT_LANGUAGE_PREFERENCE
  const spoken = isAuto ? "the language of the guest's first message" : language
  // Any language that is not the selected one works as the example; French
  // stays neutral for an English venue, and English covers the rest.
  const otherLanguage = language.startsWith('French') ? 'English' : 'French'

  return (
    <div
      style={{
        ...glassCard,
        padding: '12px 14px',
        display: 'grid',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 6,
            display: 'grid',
            placeItems: 'center',
            background: t.accentSoftBg,
            color: t.accent,
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
          aria-hidden
        >
          i
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>
          {isAuto
            ? 'Opens in whichever language the guest writes first'
            : `Opens every chat in ${language}`}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: t.textMuted, lineHeight: 1.55 }}>
        The concierge never switches language on its own. If a guest writes in{' '}
        {otherLanguage}, it keeps answering in {spoken} and asks once, in {otherLanguage},
        whether to continue there — and switches only if the guest says yes.
      </p>
    </div>
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
  /**
   * Any category may be deep-linked, not just reservations. It used to be that
   * one special case, so `?category=security` and `?category=team` — the two
   * tabs that just gained real content — silently dropped the visitor on
   * Restaurant instead. The dashboard's setup checklist links straight into
   * these, and a link that lands on the wrong page is worse than no link.
   */
  const categoryFromUrl = SETTINGS_CATEGORIES.some((c) => c.id === categoryParam)
    ? (categoryParam as CategoryId)
    : null

  const [activeCategory, setActiveCategory] = useState<CategoryId>(
    () => categoryFromUrl ?? tabToCategory(initialTab),
  )

  useEffect(() => {
    // An explicit ?category wins: it names the destination directly, where ?tab
    // only implies one.
    if (categoryFromUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync active category with URL changes
      setActiveCategory(categoryFromUrl)
      return
    }
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
  }, [tabParam, categoryFromUrl])

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
  const [businessTimezone, setBusinessTimezone] = useState<CanadianBusinessTimezone | ''>('')
  const [initialTimezone, setInitialTimezone] = useState<string | null>(null)
  const [timezoneSchemaReady, setTimezoneSchemaReady] = useState(true)
  const [hours, setHours] = useState<OperatingHours>(DEFAULT_OPERATING_HOURS)
  const [hoursConfirmed, setHoursConfirmed] = useState(false)
  const [isSavingHours, setIsSavingHours] = useState(false)
  const [hoursSaveSucceeded, setHoursSaveSucceeded] = useState(false)
  const hoursSaveTimerRef = useRef<number | null>(null)
  const [hoursSchemaReady, setHoursSchemaReady] = useState(true)
  const [launchReadiness, setLaunchReadiness] = useState<BusinessReadiness | null>(null)
  const [bookingSettings, setBookingSettings] = useState<BookingSettings>({
    ...DEFAULT_BOOKING_SETTINGS,
  })
  const [bookingSettingsSchemaReady, setBookingSettingsSchemaReady] = useState(true)
  const [zonesSchemaReady, setZonesSchemaReady] = useState(true)
  const [zoneDrafts, setZoneDrafts] = useState<DiningZoneDraft[]>([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [activityResources, setActivityResources] = useState<ActivityResource[]>([])
  const [activitiesSchemaReady, setActivitiesSchemaReady] = useState(true)
  const [reservationSubTab, setReservationSubTab] = useState<'dining' | 'activities'>('dining')

  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT_PLACEHOLDER)
  const [agentName, setAgentName] = useState('AI Concierge')
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE_PREFERENCE)

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
  const [widgetLauncherColor, setWidgetLauncherColor] = useState(DEFAULT_WIDGET_LAUNCHER_COLOR)
  const [widgetLauncherColorSchemaReady, setWidgetLauncherColorSchemaReady] = useState(true)

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

      let withBooking = await supabase
        .from('businesses')
        .select(BUSINESS_SELECT_WITH_BOOKING)
        .eq('user_id', userId)
        .maybeSingle()

      if (isTimezoneSchemaError(withBooking.error?.message)) {
        setTimezoneSchemaReady(false)
        withBooking = await supabase
          .from('businesses')
          .select(BUSINESS_SELECT_WITH_BOOKING_NO_TZ)
          .eq('user_id', userId)
          .maybeSingle()
      } else if (!withBooking.error) {
        setTimezoneSchemaReady(true)
      }

      if (
        withBooking.error &&
        /operating_hours_confirmed_at/i.test(withBooking.error.message)
      ) {
        const withoutConfirmed =
          'id, name, email, phone, business_type, address, timezone, system_prompt, agent_name, language, menu_pdf_text, operating_hours, booking_settings, notification_settings'
        withBooking = await supabase
          .from('businesses')
          .select(withoutConfirmed)
          .eq('user_id', userId)
          .maybeSingle()
      }

      if (!isMounted) return

      if (!withBooking.error && withBooking.data) {
        data = withBooking.data as Record<string, unknown>
        setBookingSettingsSchemaReady(true)
        setBookingSettings(parseBookingSettings(data.booking_settings))
      } else if (isBookingSettingsSchemaError(withBooking.error?.message)) {
        setBookingSettingsSchemaReady(false)
        let withHours = await supabase
          .from('businesses')
          .select(BUSINESS_SELECT_WITH_HOURS)
          .eq('user_id', userId)
          .maybeSingle()
        if (isTimezoneSchemaError(withHours.error?.message)) {
          setTimezoneSchemaReady(false)
          withHours = await supabase
            .from('businesses')
            .select(BUSINESS_SELECT_WITH_HOURS_NO_TZ)
            .eq('user_id', userId)
            .maybeSingle()
        }
        if (!isMounted) return
        if (!withHours.error && withHours.data) {
          data = withHours.data as unknown as Record<string, unknown>
        } else if (isOperatingHoursSchemaError(withHours.error?.message)) {
          schemaReady = false
          const fallback = await supabase
            .from('businesses')
            .select(BUSINESS_SELECT_BASE)
            .eq('user_id', userId)
            .maybeSingle()
          if (!isMounted) return
          if (!fallback.error && fallback.data) {
            data = fallback.data as unknown as Record<string, unknown>
          }
        } else if (withHours.data) {
          data = withHours.data as unknown as Record<string, unknown>
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
          data = fallback.data as unknown as Record<string, unknown>
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
        {
          const tz = resolveBusinessTimezone(
            typeof data.timezone === 'string' ? data.timezone : null,
          )
          // Show empty until confirmed when DB null and address is not clearly Alberta
          const stored = typeof data.timezone === 'string' ? data.timezone : null
          setInitialTimezone(stored)
          if (stored) {
            setBusinessTimezone(tz)
          } else {
            const suggested = suggestTimezoneFromAddress(
              typeof data.address === 'string' ? data.address : null,
            )
            setBusinessTimezone(suggested ?? '')
          }
        }
        if (data.system_prompt) setSystemPrompt(data.system_prompt as string)
        if (data.agent_name) setAgentName(data.agent_name as string)
        setLanguage(normalizeLanguagePreference(data.language))
        setMenuPdfText((data.menu_pdf_text as string | null) ?? null)
        if (schemaReady) {
          setHours(parseOperatingHours(data.operating_hours))
        }
        setHoursConfirmed(Boolean(data.operating_hours_confirmed_at))
        setNotificationSettings(parseNotificationSettings(data.notification_settings))
        if (data.id) {
          void fetch(`/api/business/readiness?business_id=${encodeURIComponent(String(data.id))}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((ready) => {
              if (isMounted && ready && typeof ready.bookingReady === 'boolean') {
                setLaunchReadiness(ready as BusinessReadiness)
              }
            })
            .catch(() => {})
        }
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

      // Widget launcher brand color (tolerates the column not existing yet).
      const launcherRes = await supabase
        .from('businesses')
        .select('widget_launcher_color')
        .eq('user_id', userId)
        .maybeSingle()
      if (!isMounted) return
      if (launcherRes.error) {
        if (isWidgetLauncherColorSchemaError(launcherRes.error.message)) {
          setWidgetLauncherColorSchemaReady(false)
        }
      } else if (launcherRes.data) {
        const parsed = parseWidgetLauncherColor(
          (launcherRes.data as { widget_launcher_color?: unknown }).widget_launcher_color,
        )
        setWidgetLauncherColor(parsed ?? DEFAULT_WIDGET_LAUNCHER_COLOR)
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
      const rows = (data ?? []).map((r) => draftFromDiningZoneRow(r as Record<string, unknown>))
      if (rows.length === 0) {
        // UI draft only — empty capacity so save cannot invent seating.
        setZoneDrafts([
          {
            business_id: bizId,
            name: 'Main Dining',
            slug: 'main-dining',
            max_concurrent_parties: 0,
            min_party_size: 1,
            max_party_size: 0,
            turnover_minutes: 70,
            is_active: true,
            sort_order: 0,
          },
        ])
      } else {
        setZoneDrafts(rows)
      }
    }
    setZonesLoading(false)
  }

  const loadActivitiesForBusiness = async (bizId: string) => {
    const { data, error } = await supabase
      .from('activity_resources')
      .select('*')
      .eq('business_id', bizId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      if (isActivityResourcesSchemaError(error.message)) setActivitiesSchemaReady(false)
      return
    }
    setActivitiesSchemaReady(true)
    const rows = (data ?? []).map((r) => {
      const row = parseActivityResourceRow(r as Record<string, unknown>)
      return { id: row.id, name: row.name, type: row.type, active: row.is_active }
    })

    // Activities used to be stored per-browser in localStorage, so they never
    // reached the server and the bot could not see them. When the table is
    // still empty, offer that old list back as unsaved drafts (their short ids
    // make the save path insert them) so the owner only has to press Save.
    if (rows.length === 0) {
      const legacy = localStorage.getItem(`activity_resources_${bizId}`)
      if (legacy) {
        try {
          const parsed: unknown = JSON.parse(legacy)
          const recovered = Array.isArray(parsed)
            ? parsed
                .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
                .map((r) => ({
                  id: typeof r.id === 'string' ? r.id : Math.random().toString(36).slice(2, 9),
                  name: typeof r.name === 'string' ? r.name : '',
                  type: isActivityType(r.type) ? r.type : ('other' as const),
                  active: r.active !== false,
                }))
                .filter((r) => r.name.trim())
            : []
          if (recovered.length > 0) {
            setActivityResources(recovered)
            return
          }
        } catch {
          /* corrupt legacy value — fall through to the empty list */
        }
      }
    }
    setActivityResources(rows)
  }

  useEffect(() => {
    if (!businessRowId || activeCategory !== 'reservations') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async zone fetch syncs external Supabase state
    void loadZonesForBusiness(businessRowId)
    void loadActivitiesForBusiness(businessRowId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loader identities change every render; keyed by businessRowId
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

    for (const z of zoneDrafts.filter((row) => row.is_active !== false)) {
      const validated = validateZoneCapacityInput({
        name: z.name,
        capacity: z.max_concurrent_parties,
        minPartySize: z.min_party_size,
        maxPartySize: z.max_party_size,
        turnoverMinutes: z.turnover_minutes,
      })
      if (!validated.ok) {
        setSaveError(`${z.name.trim() || 'Zone'}: ${validated.message}`)
        return false
      }
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
          nextDrafts[i] = draftFromDiningZoneRow(inserted as Record<string, unknown>)
        }
      }
    }

    setZoneDrafts(nextDrafts)
    await loadZonesForBusiness(bizId)
    if (!(await saveActivities(bizId))) return false
    return true
  }

  /**
   * Persist activities. Rows the owner removed are deactivated rather than
   * deleted, so reservations already holding that pool table keep pointing at a
   * real resource instead of silently losing it.
   */
  const saveActivities = async (bizId: string): Promise<boolean> => {
    if (!activitiesSchemaReady) {
      setSaveError(ACTIVITY_RESOURCES_MIGRATION_HINT)
      return false
    }

    const keptIds = new Set(activityResources.map((a) => a.id).filter(isUuid))
    const { data: existingRows } = await supabase
      .from('activity_resources')
      .select('id')
      .eq('business_id', bizId)

    for (const row of existingRows ?? []) {
      const id = String((row as { id: string }).id)
      if (!keptIds.has(id)) {
        await supabase.from('activity_resources').update({ is_active: false }).eq('id', id)
      }
    }

    for (let i = 0; i < activityResources.length; i++) {
      const a = activityResources[i]
      const name = a.name.trim() || 'Activity'
      const payload = {
        business_id: bizId,
        name,
        slug: slugifyActivityName(name),
        type: a.type,
        is_active: a.active,
        sort_order: i,
        updated_at: new Date().toISOString(),
      }

      const { error } = isUuid(a.id)
        ? await supabase.from('activity_resources').update(payload).eq('id', a.id)
        : await supabase.from('activity_resources').insert(payload)

      if (error) {
        if (isActivityResourcesSchemaError(error.message)) {
          setActivitiesSchemaReady(false)
          setSaveError(ACTIVITY_RESOURCES_MIGRATION_HINT)
        } else {
          setSaveError(error.message ?? 'Failed to save activity')
        }
        return false
      }
    }

    // The rows now live server-side; drop the per-browser copy so a later
    // "remove everything" cannot be undone by the legacy recovery above.
    localStorage.removeItem(`activity_resources_${bizId}`)
    await loadActivitiesForBusiness(bizId)
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

    const tzParsed = parseBusinessTimezoneInput(businessTimezone)
    if (!tzParsed.ok) {
      setSaveError(tzParsed.message)
      setIsSaving(false)
      return
    }

    // Changing the venue zone must not silently reinterpret live future bookings
    // or waitlist rows. scheduled_at is never rewritten.
    if (timezoneSchemaReady && businessRowId) {
      const tzGate = await assertTimezoneChangeAllowed(supabase, {
        businessId: businessRowId,
        currentTimezone: initialTimezone,
        nextTimezone: tzParsed.timezone,
      })
      if (!tzGate.ok) {
        setSaveError(tzGate.message)
        setIsSaving(false)
        return
      }
    }

    const basePayload: Record<string, unknown> = {
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
    if (timezoneSchemaReady) {
      basePayload.timezone = tzParsed.timezone
    }

    /*
     * Hours are deliberately absent here. This save runs for whichever category
     * the owner is on, and none of them — not even Restaurant, which also holds
     * the venue name, address and phone — is a statement about opening times.
     * Only the Working Hours panel's own Save writes them; see
     * lib/settings-save-policy.ts and saveWorkingHours below.
     */
    const payloadWithHours = {
      ...basePayload,
      ...operatingHoursPatch(categorySave(activeCategory), hours, new Date().toISOString()),
    }

    let requestError: { message?: string } | null = null
    let hoursSaveSkipped = false

    const persist = async (payload: Record<string, unknown>) => {
      if (businessRowId) {
        return supabase.from('businesses').update(payload).eq('id', businessRowId)
      }
      return supabase.from('businesses').insert(payload).select('id').maybeSingle()
    }

    let result = await persist(hoursSchemaReady ? payloadWithHours : basePayload)

    if (
      result.error &&
      /operating_hours_confirmed_at/i.test(result.error.message ?? '')
    ) {
      const { operating_hours_confirmed_at: _c, ...withoutConfirmed } = payloadWithHours
      result = await persist(hoursSchemaReady ? withoutConfirmed : basePayload)
    }

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

    /*
     * The badge used to be flipped to "confirmed" here on any Restaurant save,
     * whether or not the database agreed. It is now only ever set from a value
     * that was actually read back or actually written — see refreshHoursConfirmed
     * and saveWorkingHours.
     */
    if (businessRowId) {
      void fetch(`/api/business/readiness?business_id=${encodeURIComponent(businessRowId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((ready) => {
          if (ready && typeof ready.bookingReady === 'boolean') {
            setLaunchReadiness(ready as BusinessReadiness)
          }
        })
        .catch(() => {})
    }

    // Persist the widget FAB brand color when Integrations was saved.
    if (activeCategory === 'integrations' && widgetLauncherColorSchemaReady) {
      const color = parseWidgetLauncherColor(widgetLauncherColor) ?? DEFAULT_WIDGET_LAUNCHER_COLOR
      const bizId =
        businessRowId ??
        (('data' in result ? (result.data as { id?: string } | null)?.id : null) ?? null)
      if (bizId) {
        const colorRes = await supabase
          .from('businesses')
          .update({ widget_launcher_color: color })
          .eq('id', bizId)
        if (colorRes.error) {
          if (isWidgetLauncherColorSchemaError(colorRes.error.message)) {
            setWidgetLauncherColorSchemaReady(false)
            setSaveError(WIDGET_LAUNCHER_COLOR_MIGRATION_HINT)
            setIsSaving(false)
            return
          }
          setSaveError(colorRes.error.message)
          setIsSaving(false)
          return
        }
        setWidgetLauncherColor(color)
      }
    }

    setHoursSchemaReady(true)
    if (timezoneSchemaReady) {
      setInitialTimezone(tzParsed.timezone)
    }

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

  /**
   * The one action that may write opening hours, and the one that confirms them.
   *
   * Confirmation is what makes a venue publicly bookable, so it has to be a
   * deliberate act on the hours themselves — not a side effect of saving a phone
   * number that happens to sit in the same tab.
   */
  const saveWorkingHours = async () => {
    if (isSavingHours) return
    setSaveError('')
    setHoursSaveSucceeded(false)

    const invalid = validateOperatingHours(hours)
    if (invalid) {
      setSaveError(invalid)
      return
    }
    if (!hoursSchemaReady) {
      setSaveError(OPERATING_HOURS_MIGRATION_HINT)
      return
    }

    let bizId = businessRowId
    if (!bizId) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const ownerId = currentUserId ?? user?.id ?? null
      if (ownerId) {
        const { data: row } = await supabase
          .from('businesses')
          .select('id')
          .eq('user_id', ownerId)
          .maybeSingle()
        bizId = row?.id ?? null
        if (bizId) setBusinessRowId(bizId)
      }
    }
    if (!bizId) {
      setSaveError('Save the restaurant profile first (Restaurant tab).')
      return
    }

    setIsSavingHours(true)
    const patch = operatingHoursPatch(WORKING_HOURS_SAVE, hours, new Date().toISOString())

    let result = await supabase
      .from('businesses')
      .update(patch)
      .eq('id', bizId)
      .select('operating_hours_confirmed_at')
      .maybeSingle()

    // Deployments that have not run migration 024 have the hours column but not
    // the confirmation column. Saving the hours is still worth doing; the venue
    // simply stays unconfirmed until the migration lands.
    if (result.error && /operating_hours_confirmed_at/i.test(result.error.message ?? '')) {
      const { operating_hours_confirmed_at: _confirmed, ...hoursOnly } = patch
      const retry = await supabase.from('businesses').update(hoursOnly).eq('id', bizId)
      if (retry.error) {
        setSaveError(retry.error.message)
        setIsSavingHours(false)
        return
      }
      setHoursConfirmed(false)
      setSaveError(OPERATING_HOURS_MIGRATION_HINT)
      setIsSavingHours(false)
      return
    }

    if (result.error) {
      if (isOperatingHoursSchemaError(result.error.message)) {
        setHoursSchemaReady(false)
        setSaveError(OPERATING_HOURS_MIGRATION_HINT)
      } else {
        setSaveError(result.error.message)
      }
      setIsSavingHours(false)
      return
    }

    // Read back rather than assumed: the badge should describe the database.
    setHoursConfirmed(Boolean(result.data?.operating_hours_confirmed_at))
    setHoursSaveSucceeded(true)
    if (hoursSaveTimerRef.current) window.clearTimeout(hoursSaveTimerRef.current)
    hoursSaveTimerRef.current = window.setTimeout(() => {
      setHoursSaveSucceeded(false)
      hoursSaveTimerRef.current = null
    }, 2200)
    setIsSavingHours(false)

    void fetch(`/api/business/readiness?business_id=${encodeURIComponent(bizId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((ready) => {
        if (ready && typeof ready.bookingReady === 'boolean') {
          setLaunchReadiness(ready as BusinessReadiness)
        }
      })
      .catch(() => {})
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

    // Caught here rather than after a minute of uploading. The server enforces
    // the real limit; this only saves the wait.
    if (file.size > MENU_PDF_MAX_BYTES) {
      setMenuPdfError(
        `That PDF is ${(file.size / (1024 * 1024)).toFixed(1)} MB — the limit is ${MENU_PDF_MAX_MB} MB. Export it at a lower resolution, or upload the food and drink menus separately.`,
      )
      return
    }

    setMenuPdfUploading(true)
    setMenuPdfError('')

    type PdfMenuResponse = { text?: string; pages?: number; error?: string; usedOcr?: boolean }
    /*
     * The venue id rides in the query string, not the form body: the server has
     * to know whose upload this is before it reads the body at all, otherwise it
     * buffers the whole file for someone who may have no right to send it.
     */
    const postPdf = async (forceOcr: boolean) => {
      const fd = new FormData()
      fd.append('file', file)
      if (forceOcr) fd.append('force_ocr', '1')
      return fetch(`/api/menu/pdf?business_id=${encodeURIComponent(businessRowId)}`, {
        method: 'POST',
        body: fd,
      })
    }

    /*
     * Not every failure comes back as JSON — a body rejected by the platform, or
     * a proxy timing out mid-OCR, returns HTML. res.json() threw on those, the
     * rejection went unhandled, and the spinner stayed up forever with no
     * explanation.
     */
    const readJson = async (res: Response): Promise<PdfMenuResponse> => {
      try {
        return (await res.json()) as PdfMenuResponse
      } catch {
        return {
          error:
            res.status === 413
              ? `That file is too large — the limit is ${MENU_PDF_MAX_MB} MB.`
              : `The upload failed (${res.status}). Try again, or paste the menu text below.`,
        }
      }
    }

    try {
      let res = await postPdf(false)
      let data = await readJson(res)
      // pdf-parse often returns a single stray line; if vision was skipped and text is tiny, retry once.
      if (res.ok && data.text && data.text.length < 400 && !data.usedOcr) {
        res = await postPdf(true)
        data = await readJson(res)
      }

      if (res.ok && data.text) {
        setMenuPdfText(data.text)
      } else {
        setMenuPdfError(data.error ?? 'Upload failed')
      }
    } catch {
      setMenuPdfError('Lost the connection during the upload. Try again?')
    } finally {
      setMenuPdfUploading(false)
    }
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
      // TeamMembersPanel was written, tested against migration 014, and then
      // never mounted — this tab said "Coming soon" over a finished feature.
      if (!businessRowId) {
        return (
          <SettingsPlaceholder
            reduceMotion={reduceMotion}
            title="Team management"
            description="Save your restaurant details first — a team needs a restaurant to belong to."
          />
        )
      }
      return (
        <div style={{ ...glassCard, padding: 16 }}>
          {/* Deliberately not businessEmail: that field is the restaurant's public
              contact address, editable on the Restaurant tab, and it drifts from
              the account that actually owns the business. Showing it against
              "Full access, billing & team" names the wrong person in a
              permissions table. The panel falls back to the signed-in account,
              which is the one whose access is being described. */}
          <TeamMembersPanel businessId={businessRowId} ownerEmail={null} s={s} />
        </div>
      )
    }

    if (activeCategory === 'security') {
      return <SecurityPanel />
    }

    if (activeCategory === 'reservations') {
      return (
        <div style={{ display: 'grid', gap: 14 }}>
          <ReservationModeSwitcher
            value={reservationSubTab}
            diningCount={zoneDrafts.length}
            activityCount={activityResources.length}
            onChange={setReservationSubTab}
          />

          {reservationSubTab === 'dining' ? (
            <div id="reservation-dining-panel" role="tabpanel" style={{ display: 'grid', gap: 12 }}>
              <div style={{ ...glassCard, padding: 16 }}>
                {!bookingSettingsSchemaReady ? <div style={migrationHintBox}>{BOOKING_SETTINGS_MIGRATION_HINT}</div> : null}
                <BookingSettingsPanel
                  settings={bookingSettings}
                  onChange={setBookingSettings}
                  disabled={!bookingSettingsSchemaReady || isSaving}
                />
              </div>
              <div style={{ ...glassCard, padding: 16 }}>
                {!zonesSchemaReady ? (
                  <div style={migrationHintBox}>{DINING_ZONES_MIGRATION_HINT}</div>
                ) : zonesLoading ? (
                  <p style={{ margin: 0, fontSize: 13, color: t.textMuted }}>Loading dining areas…</p>
                ) : (
                  <DiningZonesPanel
                    zones={zoneDrafts}
                    bookingSettings={bookingSettings}
                    onChange={setZoneDrafts}
                    disabled={!zonesSchemaReady || isSaving}
                  />
                )}
              </div>
            </div>
          ) : (
            <div id="reservation-activities-panel" role="tabpanel" style={{ ...glassCard, padding: 16, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 10, alignItems: 'start', padding: 12, borderRadius: 11, border: '1px solid var(--bk-purple-bg)', background: 'linear-gradient(135deg, var(--bk-purple-bg), transparent)' }}>
                <span aria-hidden style={{ color: 'var(--bk-purple)', fontSize: 16, lineHeight: 1 }}>ⓘ</span>
                <div>
                  <div style={{ color: 'var(--bk-head)', fontSize: 11.5, fontWeight: 750 }}>Managed separately from dining capacity</div>
                  <p style={{ margin: '3px 0 0', color: 'var(--bk-body)', fontSize: 11.5, lineHeight: 1.45 }}>Each row represents one physical table, court, lane, or experience. Dining-area timing and capacity rules do not apply here.</p>
                </div>
              </div>
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
            onChange={(next) => {
              setBusinessAddress(next)
              if (!businessTimezone) {
                const suggested = suggestTimezoneFromAddress(next)
                if (suggested) setBusinessTimezone(suggested)
              }
            }}
            hint="Start typing an address in Canada, or enter it manually."
          />

          <BusinessTimezoneSelect
            id="settings-business-timezone"
            value={businessTimezone}
            onChange={setBusinessTimezone}
            hint={
              initialTimezone && businessTimezone && businessTimezone !== initialTimezone
                ? 'Timezone can only change when there are no upcoming reservations and no live waitlist guests. Existing bookings keep their absolute time and are never rewritten.'
                : 'Use the timezone where this restaurant operates. Never the timezone of the device you are using.'
            }
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
            <div
              style={{
                marginBottom: 12,
                padding: '10px 12px',
                borderRadius: 8,
                border: hoursConfirmed
                  ? '1px solid rgba(56, 161, 105, 0.35)'
                  : '1px solid rgba(214, 158, 46, 0.4)',
                background: hoursConfirmed
                  ? 'rgba(56, 161, 105, 0.08)'
                  : 'rgba(214, 158, 46, 0.1)',
                color: t.text,
                fontSize: 12.5,
                lineHeight: 1.45,
                fontWeight: 600,
              }}
            >
              {hoursConfirmed
                ? 'Hours confirmed — guests book against this schedule.'
                : 'Not configured — values below are editor defaults only. Save to confirm before taking online reservations.'}
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
            {/*
              Hours have their own Save. The page-level Save covers the venue's
              name, address, phone and the rest of this tab; none of those is a
              statement about when the restaurant opens, and confirming hours is
              what lets guests book.
            */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 10,
                marginTop: 14,
              }}
            >
              {hoursSaveSucceeded ? (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--bk-success, #38a169)' }}>
                  Hours saved and confirmed
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void saveWorkingHours()}
                disabled={isSavingHours || !hoursSchemaReady}
                style={{
                  padding: '9px 16px',
                  borderRadius: 9,
                  border: '1px solid rgba(56,189,248,0.5)',
                  background: isSavingHours ? 'rgba(56,189,248,0.15)' : 'rgba(56,189,248,0.9)',
                  color: isSavingHours ? t.text : '#03111c',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: isSavingHours || !hoursSchemaReady ? 'not-allowed' : 'pointer',
                }}
              >
                {isSavingHours ? 'Saving hours…' : 'Save working hours'}
              </button>
            </div>
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
              options={CANADIAN_LANGUAGE_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </div>
          <LanguageBehaviourNote language={language} />
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
                <SettingsToggle checked={item.checked} onChange={item.onChange} ariaLabel={item.label} />
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
                  <SettingsToggle
                    checked={item.checked}
                    onChange={item.onChange}
                    ariaLabel={item.label}
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

            {launchReadiness && !launchReadiness.bookingReady ? (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: 14,
                  borderRadius: 12,
                  border: `1px solid rgba(214, 158, 46, 0.4)`,
                  background: 'rgba(214, 158, 46, 0.08)',
                }}
              >
                <div style={{ color: s.text, fontSize: 14, fontWeight: 700 }}>
                  Setup incomplete — reservations are not live yet
                </div>
                <p style={{ margin: 0, color: s.textMuted, fontSize: 13, lineHeight: 1.5 }}>
                  Finish these steps before copying the embed. Even if a snippet was copied earlier,
                  guests cannot book until setup is complete.
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                  {launchReadiness.missingSteps
                    .filter((step) => step.id !== 'menu')
                    .map((step) => (
                      <li key={step.id} style={{ fontSize: 13.5 }}>
                        <a href={step.href} style={{ color: s.accent, fontWeight: 600 }}>
                          {step.title}
                        </a>
                        <span style={{ color: s.textMuted }}> — {step.description}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}

            {!widgetLauncherColorSchemaReady ? (
              <div style={migrationHintBox}>{WIDGET_LAUNCHER_COLOR_MIGRATION_HINT}</div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  padding: 14,
                  borderRadius: 12,
                  border: `1px solid ${s.border}`,
                  background: s.bg,
                }}
              >
                <div>
                  <div style={{ color: s.text, fontSize: 14, fontWeight: 600 }}>Button color</div>
                  <p style={{ margin: '4px 0 0', color: s.textMuted, fontSize: 12.5, lineHeight: 1.45 }}>
                    Match the chat button to your website. Preview on the right updates live.
                  </p>
                </div>
                <ColorSwatchPicker
                  value={widgetLauncherColor}
                  onChange={setWidgetLauncherColor}
                  border={s.border}
                  panel={s.panel}
                  text={s.text}
                  muted={s.textMuted}
                />
              </div>
            )}

            {widgetEmbedSnippet ? (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ color: s.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                    Embed Code
                    {launchReadiness && !launchReadiness.bookingReady ? (
                      <span style={{ marginLeft: 8, color: '#d69e2e', letterSpacing: '0.08em' }}>
                        Draft
                      </span>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a
                      href={`/widget?business_id=${encodeURIComponent(businessRowId ?? '')}&embed=1&draft=1`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${s.border}`,
                        background: s.panel,
                        color: s.text,
                        padding: '8px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {launchReadiness && !launchReadiness.bookingReady
                        ? 'Preview (draft)'
                        : 'Preview'}
                    </a>
                    <button
                      type="button"
                      disabled={Boolean(launchReadiness && !launchReadiness.bookingReady)}
                      onClick={async () => {
                        if (launchReadiness && !launchReadiness.bookingReady) return
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
                        background:
                          launchReadiness && !launchReadiness.bookingReady
                            ? 'rgba(255,255,255,0.04)'
                            : widgetCopied
                              ? 'rgba(56,189,248,0.08)'
                              : s.panel,
                        color:
                          launchReadiness && !launchReadiness.bookingReady
                            ? s.textMuted
                            : widgetCopied
                              ? s.accent
                              : s.text,
                        padding: '8px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor:
                          launchReadiness && !launchReadiness.bookingReady
                            ? 'not-allowed'
                            : 'pointer',
                        opacity: launchReadiness && !launchReadiness.bookingReady ? 0.55 : 1,
                      }}
                    >
                      {launchReadiness && !launchReadiness.bookingReady
                        ? 'Copy disabled'
                        : widgetCopied
                          ? 'Copied!'
                          : 'Copy snippet'}
                    </button>
                  </div>
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
                    opacity: launchReadiness && !launchReadiness.bookingReady ? 0.55 : 1,
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
              <SettingsToggle
                checked={paymentSettings.deposit_enabled}
                disabled={!paymentSchemaReady || isSaving}
                onChange={(checked) =>
                  setPaymentSettings((prev) => ({ ...prev, deposit_enabled: checked }))
                }
                ariaLabel="Require deposit"
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

  const selectCategory = (categoryId: CategoryId) => {
    const nextIndex = SETTINGS_CATEGORIES.findIndex((c) => c.id === categoryId)
    setPanelDirection(nextIndex >= categoryIndex ? 1 : -1)
    setActiveCategory(categoryId)
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
                flexDirection: 'column',
                padding: isMobile ? '20px 16px 24px' : '28px 32px 32px',
                minHeight: 'inherit',
              }}
            >
              {/* Hero — venue photo, identity, save action */}
              <div style={{ paddingTop: isMobile ? 52 : 0, marginBottom: 18 }}>
                <SettingsHero
                  venueName={businessName.trim()}
                  isMobile={isMobile}
                  actions={showSaveActions ? (
                <div style={{ display: 'grid', gap: 8, justifyItems: isMobile ? 'stretch' : 'end', width: isMobile ? '100%' : 'auto' }}>
                  {saveError ? (
                    // Sits on the dark hero scrim, so it needs a light red rather than --bk-danger.
                    <div style={{ color: '#fca5a5', fontSize: 13, fontWeight: 600, textAlign: isMobile ? 'left' : 'right' }}>
                      {saveError}
                    </div>
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
                />
              </div>

              {/* Horizontal category tabs */}
              <SettingsTabNav
                activeId={activeCategory}
                onSelect={selectCategory}
                reduceMotion={reduceMotion}
              />

              {/* Category content */}
              <section
                style={{
                  flex: 1,
                  minWidth: 0,
                  marginTop: 18,
                  background: s.panel,
                  border: `1px solid ${s.border}`,
                  borderRadius: 16,
                  boxShadow: s.shadow,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {/* Panel head. Two lines of text said which section this was
                    and nothing else; the glyph gives each one a face, and the
                    hairline underneath sweeps out on every switch so the panel
                    reads as having been re-dealt rather than re-labelled. */}
                <div
                  style={{
                    position: 'relative',
                    padding: isMobile ? '14px 18px' : '16px 22px',
                    borderBottom: `1px solid ${s.border}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 11 : 13 }}>
                    {/* The tile is the fixed frame and the numeral swaps inside
                        it: Settings reads as a numbered index, and the head
                        carries the page number of the section you opened. */}
                    <span
                      style={{
                        position: 'relative',
                        flexShrink: 0,
                        width: isMobile ? 36 : 40,
                        height: isMobile ? 36 : 40,
                        borderRadius: 12,
                        background: s.activeBg,
                        border: '1px solid rgba(56,189,248,0.28)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 3px rgba(15,23,42,0.05)',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Keyed and swapped outright, not via AnimatePresence, so
                          no stale numeral is left stacked in the tile. It rises
                          in like a turned page rather than spinning in. */}
                      <motion.span
                        key={activeCategory}
                        aria-hidden
                        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={oceanTransition(reduceMotion, { type: 'spring', stiffness: 340, damping: 26 })}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'grid',
                          placeItems: 'center',
                          fontFamily: settingsIndexFont,
                          fontSize: isMobile ? 17 : 19,
                          fontWeight: 600,
                          fontFeatureSettings: '"tnum" 1, "lnum" 1',
                          letterSpacing: '0.01em',
                          lineHeight: 1,
                          background: 'linear-gradient(160deg, #38bdf8 0%, #0284c7 100%)',
                          WebkitBackgroundClip: 'text',
                          backgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          color: '#0284c7',
                        }}
                      >
                        {settingsIndexLabel(categoryIndex)}
                      </motion.span>
                    </span>

                    <motion.div
                      key={activeCategory}
                      initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={oceanTransition(reduceMotion, { type: 'spring', stiffness: 360, damping: 32, delay: 0.04 })}
                      style={{ minWidth: 0, flex: 1 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: s.text, lineHeight: 1.25, letterSpacing: '-0.01em' }}>
                          {activeCategoryMeta.title}
                        </span>
                        {activeCategoryMeta.comingSoon ? (
                          <span
                            style={{
                              flexShrink: 0,
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              padding: '2px 6px',
                              borderRadius: 999,
                              background: 'var(--bk-surface-2)',
                              color: 'var(--bk-muted)',
                            }}
                          >
                            Soon
                          </span>
                        ) : null}
                      </div>
                      <div style={{ marginTop: 2, fontSize: 12, color: s.textMuted, lineHeight: 1.4 }}>
                        {activeCategoryMeta.description}
                      </div>
                    </motion.div>
                  </div>

                  {/* Rides on the border rather than adding a second line under
                      it: an accent that fades out before the panel edge. */}
                  <motion.span
                    key={`${activeCategory}-rule`}
                    aria-hidden
                    initial={reduceMotion ? false : { scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={oceanTransition(reduceMotion, { duration: 0.5, ease: [0.22, 1, 0.36, 1] })}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: -1,
                      height: 2,
                      transformOrigin: 'left',
                      borderRadius: 999,
                      background: 'linear-gradient(90deg, #38bdf8 0%, rgba(56,189,248,0.35) 32%, rgba(56,189,248,0) 72%)',
                      pointerEvents: 'none',
                    }}
                  />
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
