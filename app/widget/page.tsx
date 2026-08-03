'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { supabase } from '@/lib/supabase'
import {
  DEFAULT_BUSINESS_TIMEZONE,
  resolveBusinessTimezone,
  type CanadianBusinessTimezone,
} from '@/lib/business-timezone'
import { formatPhoneInput, validatePhoneInput } from '@/lib/phone-input'
import {
  DEFAULT_WIDGET_THEME,
  launcherColorOverrides,
  parseWidgetLauncherColor,
  parseWidgetTheme,
  WIDGET_THEME_PALETTES,
  type WidgetTheme,
} from '@/lib/widget-theme'

type BookingCard = {
  guestName: string
  partySize: number | null
  date: string
  time: string
  zone: string | null
  resource?: string | null
  /** Raw values for the calendar link. */
  rawDate?: string
  rawTime?: string
  durationMinutes?: number
}

type WidgetMessage = {
  id: string
  sender: 'customer' | 'ai'
  text: string
  bookingCard?: BookingCard
  /** Tappable time suggestions from the concierge (shown under the latest AI reply). */
  suggestions?: string[]
}

/** Google Calendar link for a confirmed booking (restaurant-local times). */
function googleCalendarUrl(
  card: BookingCard,
  businessName: string | null,
  timeZone: string,
): string | null {
  if (!card.rawDate || !card.rawTime) return null
  const dateDigits = card.rawDate.replace(/-/g, '')
  const [h, m] = card.rawTime.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const startMin = h * 60 + m
  const endMin = startMin + (card.durationMinutes && card.durationMinutes > 0 ? card.durationMinutes : 120)
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = `${dateDigits}T${pad(h)}${pad(m)}00`
  // Roll the end time into the next day when the meal crosses midnight.
  let endDateDigits = dateDigits
  if (endMin >= 24 * 60) {
    const [y, mo, d] = card.rawDate.split('-').map(Number)
    const next = new Date(Date.UTC(y, mo - 1, d + 1))
    endDateDigits = `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`
  }
  const end = `${endDateDigits}T${pad(Math.floor((endMin % 1440) / 60))}${pad(endMin % 60)}00`
  const title = businessName
    ? card.resource
      ? `${card.resource} — ${businessName}`
      : card.partySize != null
        ? `Table for ${card.partySize} — ${businessName}`
        : `Reservation — ${businessName}`
    : card.resource
      ? `Reservation — ${card.resource}`
      : card.partySize != null
        ? `Restaurant reservation — table for ${card.partySize}`
        : 'Restaurant reservation'
  const details = card.zone
    ? `Seating: ${card.zone}`
    : card.resource
      ? `Activity: ${card.resource}`
      : ''
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    ctz: timeZone,
    ...(details ? { details } : {}),
    ...(businessName ? { location: businessName } : {}),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

const DEFAULT_CONCIERGE_NAME = 'AI Concierge'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
/**
 * How often an open chat checks for messages it did not send — in practice, the
 * owner replying during a human takeover. Six seconds keeps that conversational
 * without making the widget chatty; see the poller for why this is not realtime.
 */
const MESSAGE_POLL_MS = 6000

const QUICK_CHIPS = ['Book a table', 'What’s on the menu?', 'What are your hours?']

const CHAT_CANVAS = 'var(--widget-canvas)'
const CHAT_SURFACE = 'var(--widget-surface)'
const CHAT_TEXT = 'var(--widget-text)'
const CHAT_MUTED = 'var(--widget-muted)'
const CHAT_SUBTLE = 'var(--widget-subtle)'
const CHAT_BORDER = 'var(--widget-border)'
const WIDGET_ACCENT = 'var(--widget-accent)'
const WIDGET_ACCENT_STRONG = 'var(--widget-accent-strong)'
const WIDGET_ACCENT_TEXT = 'var(--widget-accent-text)'
const WIDGET_ACCENT_SOFT = 'var(--widget-accent-soft)'
const WIDGET_ACCENT_RGB = 'var(--widget-accent-rgb)'
const HEADER_BACKGROUND = 'var(--widget-header-background)'
const HEADER_GLOW = 'var(--widget-header-glow)'
const HEADER_TEXT = 'var(--widget-header-text)'
const HEADER_MUTED = 'var(--widget-header-muted)'
const HEADER_SHADOW = 'var(--widget-header-shadow)'
const HEADER_BUTTON_BACKGROUND = 'var(--widget-header-button-background)'
const HEADER_BUTTON_BORDER = 'var(--widget-header-button-border)'
const HEADER_BUTTON_TEXT = 'var(--widget-header-button-text)'
const MESSAGE_AI_BACKGROUND = 'var(--widget-message-ai)'
const MESSAGE_CUSTOMER_BACKGROUND = 'var(--widget-message-customer)'
const CUSTOMER_TEXT = 'var(--widget-customer-text)'
const MESSAGE_AI_BORDER = 'var(--widget-message-ai-border)'
const MESSAGE_CUSTOMER_BORDER = 'var(--widget-message-customer-border)'
const BOOKING_BACKGROUND = 'var(--widget-booking-background)'
const CONTACT_BACKGROUND = 'var(--widget-contact-background)'
const CONTACT_TABS_BACKGROUND = 'var(--widget-contact-tabs-background)'
const CONTACT_ACTIVE_BACKGROUND = 'var(--widget-contact-active-background)'
const CONTACT_INPUT_BACKGROUND = 'var(--widget-contact-input-background)'
const DISABLED_BACKGROUND = 'var(--widget-disabled-background)'
const COMPOSER_BACKGROUND = 'var(--widget-composer-background)'
const COMPOSER_INPUT_BACKGROUND = 'var(--widget-composer-input-background)'
const COMPOSER_INPUT_BORDER = 'var(--widget-composer-input-border)'
const LAUNCHER_BACKGROUND = 'var(--widget-launcher-background)'
const LAUNCHER_COLOR = 'var(--widget-launcher-color)'
const LAUNCHER_SHADOW = 'var(--widget-launcher-shadow)'
const SOFT_SHADOW = 'var(--widget-soft-shadow)'
const CONTACT_SHADOW = 'var(--widget-contact-shadow)'
/**
 * Validation text. A literal rather than a theme token: both widget palettes are
 * blue, and a warning that reads as decoration is not a warning. Chosen to clear
 * WCAG AA on the light and dark contact-card backgrounds alike.
 */
const CONTACT_ERROR_COLOR = '#c2410c'

/**
 * Bubbles drifting up through the header's deep end. Hand-placed rather than
 * random so the rhythm stays the same on every open.
 */
const HEADER_BUBBLES = [
  { left: '47%', size: 7, delay: 0, duration: 9, peak: 0.45 },
  { left: '63%', size: 5, delay: 2.6, duration: 11, peak: 0.3 },
  { left: '77%', size: 6, delay: 5.2, duration: 10, peak: 0.38 },
]

/**
 * One pill language for every tappable prompt in the thread — the quick-start
 * chips and the time slots the concierge offers read as the same control.
 */
const CHIP_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  padding: '9px 15px',
  border: `1px solid rgba(${WIDGET_ACCENT_RGB}, 0.24)`,
  background: WIDGET_ACCENT_SOFT,
  color: WIDGET_ACCENT_TEXT,
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: '0.005em',
  cursor: 'pointer',
  boxShadow: SOFT_SHADOW,
}

/** Shared look for the two header controls, so they stay the same pill. */
const HEADER_BUTTON_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 30,
  border: `1px solid ${HEADER_BUTTON_BORDER}`,
  borderRadius: 999,
  background: HEADER_BUTTON_BACKGROUND,
  color: HEADER_BUTTON_TEXT,
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.01em',
  lineHeight: 1,
  cursor: 'pointer',
}

const buildWelcome = (businessName: string | null, conciergeName: string): WidgetMessage => ({
  id: 'welcome',
  sender: 'ai',
  text: businessName
    ? `Hi there! I'm ${conciergeName}, the concierge for ${businessName}. I can book you a table, walk you through the menu, or answer anything about your visit.`
    : `Hi there! I'm ${conciergeName}. I can book you a table, walk you through the menu, or answer anything about your visit.`,
})

function storageKey(businessId: string) {
  return `oceancore-conv-${businessId}`
}

/**
 * A conversation and the token that proves we opened it.
 *
 * The id alone used to be enough to resume a chat and act on its bookings.
 * It was never a secret — until migration 021 the anon key could list every
 * conversation id in the database — so the server now mints a random token when
 * the conversation is created and stores only its hash (migration 022). We keep
 * the plaintext here; it is the one copy that exists, and losing it simply means
 * the next message starts a fresh conversation.
 */
type GuestSession = { id: string; token: string }

function saveSession(businessId: string, convId: string, token: string) {
  try {
    localStorage.setItem(
      storageKey(businessId),
      JSON.stringify({ id: convId, token, ts: Date.now() }),
    )
  } catch { /* storage full / blocked — non-critical */ }
}

function loadSession(businessId: string): GuestSession | null {
  try {
    const raw = localStorage.getItem(storageKey(businessId))
    if (!raw) return null
    const { id, token, ts } = JSON.parse(raw) as {
      id?: string
      token?: string
      ts?: number
    }
    if (typeof ts !== 'number' || Date.now() - ts > SESSION_TTL_MS) {
      localStorage.removeItem(storageKey(businessId))
      return null
    }
    // Sessions stored before tokens existed have no token and cannot be
    // resumed. Dropping them here saves a round trip that would only be refused.
    if (typeof id !== 'string' || !id || typeof token !== 'string' || !token) {
      localStorage.removeItem(storageKey(businessId))
      return null
    }
    return { id, token }
  } catch {
    return null
  }
}

function clearSession(businessId: string) {
  try { localStorage.removeItem(storageKey(businessId)) } catch { /* noop */ }
}

// ── Proactive nudge ───────────────────────────────────────────────────────────
// A one-line teaser above the launcher, shown a beat after every page load while
// the chat is still closed. Opening or dismissing hides it for this visit only —
// the next site entry shows it again.

const NUDGE_DELAY_MS = 10000

/** Tags every postMessage to widget.js so a host page can tell ours apart. */
const WIDGET_MESSAGE_SOURCE = 'oceancore-widget'

function buildNudgeText(businessName: string | null, conciergeName: string): string {
  if (conciergeName && conciergeName !== DEFAULT_CONCIERGE_NAME) {
    return `Hi! I'm ${conciergeName} — can I help you book a table?`
  }
  if (businessName) {
    return `Hi! Can I help you book a table at ${businessName}?`
  }
  return `Hi! Can I help you book a table or answer a question?`
}

/**
 * Device-level guest identity used to live here: the widget kept a customer id
 * for 180 days and sent it with every message, and the server took it as "this
 * is who I am". An identifier the client hands over is a claim, not proof —
 * whoever held one inherited that guest's name, contact, visit history and
 * reservations. Both the storage and the field are gone.
 *
 * Anything already written by an older build is cleared on load; there is no
 * reason to leave a stale customer id sitting in a stranger's browser.
 */
function purgeLegacyGuestIdentity() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && key.startsWith('oceancore-guest-')) {
        localStorage.removeItem(key)
      }
    }
  } catch { /* storage blocked — nothing to clean up */ }
}

let messageSeq = 0
/** Unique client-side message id; the prefix drives the realtime de-dup logic. */
function nextMessageId(prefix: string): string {
  messageSeq += 1
  return `${prefix}-${Date.now()}-${messageSeq}`
}

// Phone masking, the 15-digit cap and the "is this usable?" question all live in
// lib/phone-input.ts, where they can be tested without a browser.

/** Bot already placed the booking — do not show the contact form again. */
function aiAlreadyConfirmedBooking(text: string): boolean {
  const t = text.toLowerCase()
  return (
    /\b(confirmation (?:email )?has been|has been sent|been placed|it's been placed)\b/i.test(
      t,
    ) ||
    /\b(booked for|all set|look forward to seeing)\b/i.test(t) ||
    /\b(sent to [^\s]+@|confirmation email has been)\b/i.test(t) ||
    /\b(your reservation (?:is|has been) (?:set|placed|confirmed))\b/i.test(t)
  )
}

/** True when the bot is asking for contact — not when confirming a booking. */
function aiAsksForContact(text: string): boolean {
  const t = text.toLowerCase()
  if (aiAlreadyConfirmedBooking(t)) return false
  if (!/\b(phone|email|contact)\b/i.test(t)) return false
  return (
    /\b(phone number or email|phone or email|number or email)\b/i.test(t) ||
    /\b(so we can send (?:a )?confirmation|send (?:you )?a confirmation)\b/i.test(t) ||
    /\b(may i have|could i have|could i get|can i get|would you share).{0,60}(phone|email)/i.test(t) ||
    /\b(?:please\s+)?(?:provide|share|give|send|enter|tell me).{0,60}\b(phone|email|contact|number)\b/i.test(t) ||
    /\b(?:what(?:'s| is) the best|best)\s+(?:phone\s+)?number\b/i.test(t)
  )
}

function looksLikeContactValue(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/\S+@\S+\.\S+/.test(trimmed)) return true
  return trimmed.replace(/\D/g, '').length >= 7
}

/** Track a max-width media query without SSR mismatch. */
function useIsNarrow(maxWidth = 520): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [maxWidth])
  return narrow
}

// ─── Presentational bits ────────────────────────────────────────────────────

function TypingDots({ conciergeName }: { conciergeName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 12 }}
      aria-label={`${conciergeName} is typing`}
    >
      <div
        style={{
          borderRadius: '16px 16px 16px 5px',
          padding: '12px 14px',
          background: CHAT_SURFACE,
          border: `1px solid ${CHAT_BORDER}`,
          boxShadow: SOFT_SHADOW,
          display: 'flex',
          gap: 5,
          alignItems: 'center',
        }}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.14, ease: 'easeInOut' }}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: WIDGET_ACCENT,
              display: 'inline-block',
            }}
          />
        ))}
      </div>
    </motion.div>
  )
}

function HistorySkeleton() {
  const widths = ['62%', '44%', '70%', '38%']
  return (
    <div aria-label="Loading conversation" style={{ display: 'grid', gap: 10, padding: '4px 0' }}>
      {widths.map((w, i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.12 }}
          style={{
            width: w,
            height: 38,
            borderRadius: 14,
            background: `rgba(${WIDGET_ACCENT_RGB}, 0.12)`,
            justifySelf: i % 2 === 0 ? 'start' : 'end',
          }}
        />
      ))}
    </div>
  )
}

function SendIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 12h14m0 0-5.5-5.5M18.5 12 13 17.5"
        stroke={muted ? CHAT_SUBTLE : '#04121f'}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ContactMethodIcon({ mode, size = 17 }: { mode: 'phone' | 'email'; size?: number }) {
  if (mode === 'phone') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M7.3 3.8 9.5 8l-2.1 1.9c1.1 2.5 3.2 4.6 5.7 5.7l1.9-2.1 4.2 2.2-.7 3.2c-.2.8-.9 1.3-1.7 1.3C9.6 20.2 3.8 14.4 3.8 7.2c0-.8.5-1.5 1.3-1.7l2.2-.7Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="m5.3 7.4 6.7 5.1 6.7-5.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ContactSendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h13m0 0-5-5m5 5-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PrivacyLockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="10" width="14" height="10" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ChatBubbleIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 11.5c0 4.14-4.03 7.5-9 7.5-1.06 0-2.08-.15-3.02-.43L4 20l1.18-3.55C4.05 15.13 3 13.42 3 11.5 3 7.36 7.03 4 12 4s9 3.36 9 7.5Z"
        fill="#04121f"
      />
      <circle cx="8.6" cy="11.5" r="1.15" fill={WIDGET_ACCENT} />
      <circle cx="12" cy="11.5" r="1.15" fill={WIDGET_ACCENT} />
      <circle cx="15.4" cy="11.5" r="1.15" fill={WIDGET_ACCENT} />
    </svg>
  )
}

// ─── Widget ─────────────────────────────────────────────────────────────────

function WidgetPageInner() {
  const searchParams = useSearchParams()
  const businessId = searchParams.get('business_id')
  /**
   * Embedded in a host site by widget.js: the launcher, the nudge and the
   * preview chrome all live on the host page, so this render is nothing but
   * the panel filling the frame.
   */
  const isEmbed = searchParams.get('embed') === '1'
  const [businessName, setBusinessName] = useState<string | null>(null)
  const [conciergeName, setConciergeName] = useState<string>(DEFAULT_CONCIERGE_NAME)
  const [venueTimezone, setVenueTimezone] =
    useState<CanadianBusinessTimezone>(DEFAULT_BUSINESS_TIMEZONE)
  const [widgetTheme, setWidgetTheme] = useState<WidgetTheme>(DEFAULT_WIDGET_THEME)
  const [launcherColor, setLauncherColor] = useState<string | null>(null)

  const [isOpen, setIsOpen] = useState(isEmbed)
  const [showNudge, setShowNudge] = useState(false)
  /** Once opened or dismissed this visit, do not re-arm until the next page load. */
  const nudgeSpentRef = useRef(false)
  const [isLoading, setIsLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactMode, setContactMode] = useState<'phone' | 'email' | null>(null)
  const [messages, setMessages] = useState<WidgetMessage[]>([
    buildWelcome(null, DEFAULT_CONCIERGE_NAME),
  ])
  const [conversationId, setConversationId] = useState<string | null>(null)
  /**
   * Held in a ref, not state: it is a credential, it must be readable by the
   * send handler and the poller without re-rendering, and nothing displays it.
   */
  const guestTokenRef = useRef<string | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const contactInputRef = useRef<HTMLInputElement | null>(null)
  const restoredRef = useRef(false)
  const isMobile = useIsNarrow()
  const reduceMotion = useReducedMotion()
  const widgetPaletteVars = {
    ...WIDGET_THEME_PALETTES[widgetTheme],
    ...(launcherColor ? launcherColorOverrides(launcherColor) : null),
  } as React.CSSProperties

  // Restore session from localStorage on mount / businessId change
  useEffect(() => {
    restoredRef.current = false
    purgeLegacyGuestIdentity()
    if (!businessId) {
      guestTokenRef.current = null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore persisted session on mount/business change
      setConversationId(null)
      return
    }
    const saved = loadSession(businessId)
    if (saved) {
      guestTokenRef.current = saved.token
      setConversationId(saved.id)
      restoredRef.current = true
    } else {
      guestTokenRef.current = null
      setConversationId(null)
    }
  }, [businessId])

  /*
   * Transcript for a restored session, from the server.
   *
   * This used to read `public.messages` directly with the anon key, which
   * required an RLS policy granting anonymous selects. Migration 021 removed it
   * — the live database was also letting anon enumerate `conversations`, so the
   * id being filtered on was not private either. /api/chat/history does the read
   * with the service role after checking the session token.
   */
  useEffect(() => {
    if (!conversationId || !businessId || !restoredRef.current) return
    restoredRef.current = false

    const token = guestTokenRef.current
    if (!token) return

    let cancelled = false
    setHistoryLoading(true)

    void (async () => {
      try {
        const res = await fetch('/api/chat/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            conversation_id: conversationId,
            guest_token: token,
          }),
        })
        if (cancelled) return

        if (res.status === 401) {
          // The session is over (expired, or the conversation predates tokens).
          // Drop it and let the next message open a fresh one, rather than
          // leaving the guest looking at a thread they can no longer add to.
          clearSession(businessId)
          guestTokenRef.current = null
          setConversationId(null)
          setHistoryLoading(false)
          return
        }

        if (res.ok) {
          const data = (await res.json()) as {
            messages?: { id: string; role: 'user' | 'assistant'; content: string }[]
          }
          if (cancelled) return
          const rows = data.messages ?? []
          if (rows.length > 0) {
            setMessages(
              rows.map((r) => ({
                id: r.id,
                sender: r.role === 'user' ? ('customer' as const) : ('ai' as const),
                text: r.content ?? '',
              })),
            )
          }
        }
      } catch {
        // Offline or a blocked request: keep the welcome message rather than an
        // error. The guest can still type, and sending recreates the thread.
      }
      if (!cancelled) setHistoryLoading(false)
    })()

    return () => { cancelled = true }
  }, [conversationId, businessId])

  // Persist the session whenever it changes. Id and token travel together — an
  // id stored without its token is unusable, so it is not stored at all.
  useEffect(() => {
    if (conversationId && businessId && guestTokenRef.current) {
      saveSession(businessId, conversationId, guestTokenRef.current)
    }
  }, [conversationId, businessId])

  /*
   * Live updates, by polling.
   *
   * This was a Supabase realtime subscription on `public.messages`. Realtime
   * applies RLS, and the policy it depended on let ANY anonymous caller read
   * messages — migration 021 removed it. Realtime has no way to present a guest
   * session token, so there is no safe way to keep the subscription; polling the
   * token-checked endpoint is the honest substitute until the transport can
   * carry a credential.
   *
   * What this delivers is the owner's replies during a human takeover. Only
   * while the panel is open — a closed widget has nothing to show, and this is a
   * request per interval per guest.
   */
  useEffect(() => {
    if (!conversationId || !businessId || !isOpen) return
    const token = guestTokenRef.current
    if (!token) return

    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch('/api/chat/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            conversation_id: conversationId,
            guest_token: token,
          }),
        })
        if (cancelled || !res.ok) return

        const data = (await res.json()) as {
          messages?: { id: string; role: 'user' | 'assistant'; content: string }[]
        }
        if (cancelled) return

        for (const row of data.messages ?? []) {
          const content = row.content ?? ''
          if (!content.trim()) continue
          const incomingId = row.id
          const isAssistant = row.role === 'assistant'

          setMessages((prev) => {
            if (prev.some((m) => m.id === incomingId)) return prev
            // Reconcile with the optimistic copy this client already rendered:
            // match on text and the client-side id prefix, then adopt the real id.
            const prefix = isAssistant ? 'ai-' : 'customer-'
            const localIdx = prev.findLastIndex(
              (m) =>
                m.sender === (isAssistant ? 'ai' : 'customer') &&
                m.text === content &&
                m.id.startsWith(prefix),
            )
            if (localIdx !== -1) {
              const next = [...prev]
              next[localIdx] = { ...next[localIdx], id: incomingId }
              return next
            }
            return [...prev, { id: incomingId, sender: isAssistant ? 'ai' : 'customer', text: content }]
          })
        }
      } catch {
        // Transient failure; the next tick tries again.
      }
    }

    // Not while the guest is waiting on a reply — the send already returns it.
    const timer = window.setInterval(() => {
      if (!isLoading) void poll()
    }, MESSAGE_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [conversationId, businessId, isOpen, isLoading])

  // Presence heartbeat — lets the dashboard see that the guest is online
  useEffect(() => {
    if (!isOpen || !conversationId) return

    const channel = supabase.channel(`presence:conv:${conversationId}`)
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ online_at: Date.now() })
      }
    })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [isOpen, conversationId])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    const el = messagesContainerRef.current
    if (!el) {
      return
    }
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
    // Late-growing content (staggered suggestion chips, the booking card
    // spring) adds height after the first scroll — follow it down once settled.
    const settle = window.setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
    }, 520)
    return () => window.clearTimeout(settle)
  }, [messages, isOpen, isLoading, reduceMotion])

  useEffect(() => {
    if (!businessId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset branding when the widget loses its business id
      setBusinessName(null)
      setConciergeName(DEFAULT_CONCIERGE_NAME)
      setWidgetTheme(DEFAULT_WIDGET_THEME)
      setLauncherColor(null)
      return
    }
    /*
     * Branding comes from /api/widget/meta, not from a direct read of
     * `public.businesses`.
     *
     * The direct read needed an anon SELECT policy on that table, and the policy
     * that provided it granted `using (true)` over every column — every
     * restaurant's email, phone, address, system prompt and menu text, readable
     * by anyone with the public key. Migration 021 dropped it. The endpoint runs
     * with the service role and returns four display fields for one venue.
     *
     * On any failure the widget keeps whatever branding it already has (the
     * defaults on first load), which is the same thing the old code did when the
     * query errored — an unbranded chat still books tables.
     */
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/widget/meta?id=${encodeURIComponent(businessId)}`)
        if (cancelled || !res.ok) return

        const meta = (await res.json()) as {
          name?: unknown
          agentName?: unknown
          theme?: unknown
          launcherColor?: unknown
          timezone?: unknown
        }
        if (cancelled) return

        const nextName =
          typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : null
        const nextConcierge =
          typeof meta.agentName === 'string' && meta.agentName.trim()
            ? meta.agentName.trim()
            : DEFAULT_CONCIERGE_NAME

        setBusinessName(nextName)
        setConciergeName(nextConcierge)
        if (typeof meta.timezone === 'string' && meta.timezone.trim()) {
          setVenueTimezone(resolveBusinessTimezone(meta.timezone.trim()))
        }
        setWidgetTheme(parseWidgetTheme(meta.theme))
        setLauncherColor(parseWidgetLauncherColor(meta.launcherColor))
        setMessages((prev) =>
          prev.length === 1 && prev[0].id === 'welcome'
            ? [buildWelcome(nextName, nextConcierge)]
            : prev,
        )
      } catch {
        // Offline or blocked: keep the default branding rather than an error.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [businessId])

  // Reveal the proactive nudge a beat after load, only while the chat is closed
  // and this visit has not already opened or dismissed it. Embedded, the host
  // page runs its own nudge next to its own launcher.
  useEffect(() => {
    if (isEmbed || !businessId || isOpen || nudgeSpentRef.current) return
    const timer = window.setTimeout(() => setShowNudge(true), NUDGE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [isEmbed, businessId, isOpen])

  /**
   * Talk to widget.js. The host origin is unknown (any restaurant's domain), so
   * messages go out with '*' — they carry no contact details, only "I am up",
   * "the guest closed me", and how many replies are waiting. The host verifies
   * they came from this frame.
   */
  const postToHost = useCallback(
    (message: { type: 'ready' | 'close' } | { type: 'unread'; count: number; preview?: string }) => {
      if (!isEmbed || typeof window === 'undefined' || window.parent === window) return
      window.parent.postMessage({ source: WIDGET_MESSAGE_SOURCE, ...message }, '*')
    },
    [isEmbed],
  )

  useEffect(() => {
    postToHost({ type: 'ready' })
  }, [postToHost])

  /*
   * Embedded, the panel never unmounts — widget.js just hides the frame — so the
   * chat has no way of knowing whether the guest can see it. Without that, a
   * reply that lands while the launcher is closed goes unnoticed: the guest
   * asked a question, walked away from a silent bubble, and never came back.
   * The host tells us, and we count what it missed.
   */
  const [hostVisible, setHostVisible] = useState(true)
  const seenMessageIdRef = useRef<string | null>(null)
  const unreadRef = useRef(0)

  useEffect(() => {
    if (!isEmbed) return
    const onHostMessage = (event: MessageEvent) => {
      const data = event.data as { source?: string; type?: string; visible?: boolean } | null
      if (!data || data.source !== WIDGET_MESSAGE_SOURCE || data.type !== 'visibility') return
      setHostVisible(Boolean(data.visible))
    }
    window.addEventListener('message', onHostMessage)
    return () => window.removeEventListener('message', onHostMessage)
  }, [isEmbed])

  useEffect(() => {
    if (!isEmbed) return
    const latest = messages[messages.length - 1]
    if (!latest) return

    // Coming back into view clears the count, whatever arrived while away.
    if (hostVisible) {
      seenMessageIdRef.current = latest.id
      if (unreadRef.current !== 0) {
        unreadRef.current = 0
        postToHost({ type: 'unread', count: 0 })
      }
      return
    }

    // Only the concierge's own words are news; the guest's last line is not.
    if (latest.id === seenMessageIdRef.current || latest.sender !== 'ai') return
    seenMessageIdRef.current = latest.id
    unreadRef.current += 1
    postToHost({
      type: 'unread',
      count: unreadRef.current,
      // Trimmed here rather than in the host: the badge shows a teaser, and a
      // whole reply pasted onto a restaurant's page is a wall of text.
      preview: latest.text.length > 120 ? `${latest.text.slice(0, 117)}…` : latest.text,
    })
  }, [messages, hostVisible, isEmbed, postToHost])

  const closeChat = useCallback(() => {
    if (isEmbed) {
      // The frame itself is what gets hidden — stay open behind it so the
      // thread is still there when the guest comes back.
      postToHost({ type: 'close' })
      return
    }
    setIsOpen(false)
  }, [isEmbed, postToHost])

  // Escape closes the chat, the way every other overlay on the web does.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeChat()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, closeChat])

  const openChat = useCallback(() => {
    nudgeSpentRef.current = true
    setShowNudge(false)
    setIsOpen(true)
  }, [])

  const closeNudge = useCallback(() => {
    nudgeSpentRef.current = true
    setShowNudge(false)
  }, [])

  const handleContactSubmit = async () => {
    // A number that cannot work must not reach the restaurant as a callback
    // number; the field says why instead of silently sending it.
    const value = phoneCheck.ok ? contactPhone : contactEmail.trim()
    if (!value) return
    setContactPhone('')
    setContactEmail('')
    setContactMode(null)
    await handleSend(value)
  }

  const handleNewChat = useCallback(() => {
    if (businessId) clearSession(businessId)
    // Drop the token with the thread: "new chat" must not leave a credential
    // behind that still reaches the old conversation.
    guestTokenRef.current = null
    setConversationId(null)
    setMessages([buildWelcome(businessName, conciergeName)])
  }, [businessId, businessName, conciergeName])

  const headerTitle = businessName ?? conciergeName

  const lastContactAskIdx = [...messages].reduce(
    (found, m, i) => (m.sender === 'ai' && aiAsksForContact(m.text) ? i : found),
    -1,
  )
  const showContactStep =
    lastContactAskIdx !== -1 &&
    !messages
      .slice(lastContactAskIdx + 1)
      .some((m) => m.sender === 'customer' && looksLikeContactValue(m.text))

  // The contact card must ALWAYS show an input — never make the guest tap a pill
  // to reveal a field. Default to phone (email if the ask was email-only), and
  // let the pills switch between them.
  const contactAskText =
    lastContactAskIdx !== -1 ? messages[lastContactAskIdx].text.toLowerCase() : ''
  const defaultContactMode: 'phone' | 'email' =
    /\bemail\b/.test(contactAskText) && !/\bphone\b/.test(contactAskText) ? 'email' : 'phone'
  const effectiveContactMode = contactMode ?? defaultContactMode

  const phoneCheck = validatePhoneInput(contactPhone)
  const emailReady = !!contactEmail.trim()
  const canSubmit = effectiveContactMode === 'phone' ? phoneCheck.ok : emailReady
  /** Shown only once the guest has typed something that cannot work. */
  const phoneError =
    effectiveContactMode === 'phone' ? phoneCheck.message : null

  useEffect(() => {
    if (!showContactStep || isMobile) return
    const frame = requestAnimationFrame(() => contactInputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [showContactStep, effectiveContactMode, isMobile])

  // Fresh conversation → offer quick-start chips instead of a blank input.
  const showQuickChips =
    !historyLoading &&
    !isLoading &&
    messages.length === 1 &&
    messages[0]?.id === 'welcome' &&
    Boolean(businessId)

  // Scroll to bottom when the contact card appears or a chip is selected so the
  // input field is always visible. Declared here, after showContactStep is defined.
  useEffect(() => {
    if (!isOpen) return
    const el = messagesContainerRef.current
    if (!el) return
    const frame = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [showContactStep, contactMode, isOpen, reduceMotion])

  const selectContactMode = (mode: 'phone' | 'email') => {
    setContactMode(mode)
    requestAnimationFrame(() => contactInputRef.current?.focus())
  }

  const handleSend = async (textOverride?: string) => {
    const text = (textOverride ?? draft).trim()
    if (!text || isLoading) {
      return
    }

    const customerMessage: WidgetMessage = {
      id: nextMessageId('customer'),
      sender: 'customer',
      text,
    }
    const nextMessages = [...messages, customerMessage]

    setMessages(nextMessages)
    if (!textOverride) setDraft('')
    setIsLoading(true)

    try {
      const body: {
        messages: { role: string; content: string }[]
        business_id?: string
        conversation_id?: string
        guest_token?: string
      } = {
        messages: nextMessages.map((message) => ({
          role: message.sender === 'customer' ? 'user' : 'assistant',
          content: message.text,
        })),
      }
      if (businessId) {
        body.business_id = businessId
        // Both or neither: an id without its token cannot resume a conversation,
        // and sending one would only earn a refusal and a new thread.
        if (conversationId && guestTokenRef.current) {
          body.conversation_id = conversationId
          body.guest_token = guestTokenRef.current
        }
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const data = (await response.json()) as {
        message?: string | null
        conversation_id?: string
        /** Present only on the response that created the conversation. */
        guest_token?: string
        skipped?: boolean
        reason?: string
        booking_created?: boolean
        booking_details?:
          | {
              guest_name: string
              party_size: number | null
              date: string
              time: string
              dining_area: string | null
              resource?: string | null
              duration_minutes?: number
            }
          | Array<{
              guest_name: string
              party_size: number | null
              date: string
              time: string
              dining_area: string | null
              resource?: string | null
              duration_minutes?: number
            }>
          | null
        suggested_times?: string[]
      }

      if (response.ok && typeof data.conversation_id === 'string' && data.conversation_id) {
        setConversationId(data.conversation_id)
        /*
         * A token comes back only on the response that minted the conversation.
         * The server keeps a hash, so this is the only copy — persist it with
         * the id, and keep the existing one on every later turn.
         */
        if (typeof data.guest_token === 'string' && data.guest_token) {
          guestTokenRef.current = data.guest_token
        }
        if (businessId && guestTokenRef.current) {
          saveSession(businessId, data.conversation_id, guestTokenRef.current)
        }
      }

      if (data.skipped) {
        return
      }

      const aiText =
        response.ok && typeof data.message === 'string' && data.message.trim()
          ? data.message
          : 'Sorry, something went wrong. Please try again.'

      setMessages((prev) => {
        const lastAi = [...prev].reverse().find((m) => m.sender === 'ai')
        const suggestions =
          response.ok && Array.isArray(data.suggested_times) && data.suggested_times.length > 0
            ? data.suggested_times.filter((t): t is string => typeof t === 'string').slice(0, 6)
            : undefined
        // Realtime may have delivered this reply from the DB before the fetch
        // resolved. The DB row has no suggestions, so merge them in rather than
        // dropping the response on the floor.
        if (lastAi && lastAi.text === aiText && !lastAi.id.startsWith('ai-')) {
          if (!suggestions) return prev
          return prev.map((m) => (m.id === lastAi.id ? { ...m, suggestions } : m))
        }
        const next: WidgetMessage[] = [
          ...prev,
          { id: nextMessageId('ai'), sender: 'ai', text: aiText, suggestions },
        ]
        if (data.booking_created && data.booking_details) {
          const detailsList = Array.isArray(data.booking_details)
            ? data.booking_details
            : [data.booking_details]
          for (const d of detailsList) {
            if (!d?.date || !d?.time) continue
            // Format date: 2026-06-19 → Fri, Jun 19
            const dateObj = new Date(`${d.date}T12:00:00`)
            const formattedDate = dateObj.toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            })
            // Format time: 19:30 → 7:30pm
            const [h, m] = d.time.split(':').map(Number)
            const formattedTime = `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
            next.push({
              id: nextMessageId('booking-card'),
              sender: 'ai',
              text: '',
              bookingCard: {
                guestName: d.guest_name,
                partySize:
                  typeof d.party_size === 'number' && d.party_size > 0
                    ? d.party_size
                    : null,
                date: formattedDate,
                time: formattedTime,
                zone: d.dining_area ?? null,
                resource: d.resource ?? null,
                rawDate: d.date,
                rawTime: d.time,
                durationMinutes: d.duration_minutes,
              },
            })
          }
        }
        return next
      })
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId('ai-error'),
          sender: 'ai',
          text: "I couldn't reach the server. Please try again in a moment.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const panelStyle: React.CSSProperties = isEmbed
    ? {
        // The frame is the panel: widget.js owns its size, corners and shadow.
        position: 'absolute',
        inset: 0,
        background: CHAT_CANVAS,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }
    : isMobile
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: CHAT_CANVAS,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }
    : {
        width: 372,
        height: 'min(600px, calc(100vh - 120px))',
        background: CHAT_CANVAS,
        borderRadius: 24,
        border: `1px solid rgba(${WIDGET_ACCENT_RGB}, 0.35)`,
        boxShadow: `0 24px 56px rgba(27, 77, 124, 0.22), 0 0 64px rgba(${WIDGET_ACCENT_RGB}, 0.12)`,
        marginBottom: 14,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }

  return (
    <div
      className={isEmbed ? undefined : 'oc-dark-page'}
      style={
        isEmbed
          ? { position: 'absolute', inset: 0, background: 'transparent' }
          : {
              minHeight: '100vh',
              background: 'var(--ocean-canvas)',
              backgroundColor: 'var(--ocean-deep)',
              color: 'var(--ocean-text)',
            }
      }
    >
      {!isEmbed && (
        <div style={{ padding: 32, color: 'var(--ocean-text-muted)' }}>
          <h1 style={{ margin: 0, fontSize: 30, color: 'var(--ocean-text)' }}>OceanCore · Widget preview</h1>
          <p style={{ marginTop: 10, maxWidth: 700 }}>
            Standalone chat widget. Use the bubble in the bottom-right to open your AI Concierge.
          </p>
        </div>
      )}

      <div
        style={{
          ...widgetPaletteVars,
          ...(isEmbed
            ? { position: 'absolute', inset: 0 }
            : {
                position: 'fixed',
                right: isMobile ? 16 : 24,
                bottom: isMobile ? 16 : 24,
                zIndex: 30,
              }),
        }}
      >
        <AnimatePresence>
        {isOpen ? (
          <motion.div
            key="widget-panel"
            /* A chat panel that opens over the page is a dialog. Named and
               labelled so a screen reader announces what just appeared instead
               of a bare group of controls. Not modal: the guest may keep using
               the page behind it, and Escape already closes this. */
            id="oceancore-chat-panel"
            role="dialog"
            aria-label={`${conciergeName} — chat`}
            initial={{ opacity: 0, y: 18, scale: 0.95 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: reduceMotion
                ? { duration: 0.01 }
                : { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
            }}
            exit={{
              opacity: 0,
              y: 18,
              scale: 0.95,
              transition: reduceMotion
                ? { duration: 0.01 }
                : { duration: 0.3, ease: [0.64, 0, 0.78, 0] },
            }}
            style={panelStyle}
          >
            {/* ── Header ── */}
            <header
              style={{
                position: 'relative',
                overflow: 'hidden',
                padding: '14px 14px 26px 18px',
                paddingTop: isMobile ? 'max(14px, env(safe-area-inset-top))' : 14,
                background: HEADER_BACKGROUND,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: HEADER_SHADOW,
              }}
            >
              {/* A slow tide of light drifting across the deep end. */}
              <motion.span
                aria-hidden
                animate={reduceMotion ? undefined : { x: [-14, 26, -14], y: [0, 9, 0], opacity: [0.55, 0.9, 0.55] }}
                transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  position: 'absolute',
                  top: -96,
                  right: -30,
                  width: 210,
                  height: 210,
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${HEADER_GLOW} 0%, rgba(255,255,255,0) 70%)`,
                  pointerEvents: 'none',
                }}
              />

              {!reduceMotion &&
                HEADER_BUBBLES.map((bubble) => (
                  <motion.span
                    key={bubble.left}
                    aria-hidden
                    animate={{ y: [0, -44], opacity: [0, bubble.peak, 0] }}
                    transition={{
                      duration: bubble.duration,
                      delay: bubble.delay,
                      repeat: Infinity,
                      ease: 'easeOut',
                    }}
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      left: bubble.left,
                      width: bubble.size,
                      height: bubble.size,
                      borderRadius: '50%',
                      border: '1px solid rgba(255, 255, 255, 0.9)',
                      background: 'rgba(255, 255, 255, 0.12)',
                      pointerEvents: 'none',
                    }}
                  />
                ))}

              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <p
                  title={headerTitle}
                  style={{
                    margin: 0,
                    fontSize: 15.5,
                    fontWeight: 700,
                    color: HEADER_TEXT,
                    letterSpacing: '-0.012em',
                    lineHeight: 1.25,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {headerTitle}
                </p>
                <p
                  style={{
                    margin: '3px 0 0',
                    fontSize: 11.5,
                    lineHeight: 1.2,
                    color: HEADER_MUTED,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 0,
                  }}
                >
                  <motion.span
                    aria-hidden
                    animate={
                      reduceMotion
                        ? undefined
                        : {
                            boxShadow: [
                              '0 0 0 0 rgba(74, 222, 128, 0.55)',
                              '0 0 0 6px rgba(74, 222, 128, 0)',
                            ],
                          }
                    }
                    transition={{ duration: 2.1, repeat: Infinity, ease: 'easeOut' }}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--ocean-success)',
                      flexShrink: 0,
                    }}
                  />
                  {/* The status line doubles as a presence indicator. */}
                  <motion.span
                    key={isLoading ? 'typing' : 'idle'}
                    initial={reduceMotion ? false : { opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {isLoading
                      ? `${conciergeName} is typing…`
                      : `${conciergeName} · Replies instantly`}
                  </motion.span>
                </p>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {conversationId && (
                  <motion.button
                    type="button"
                    onClick={handleNewChat}
                    title="Start a new chat"
                    whileHover={reduceMotion ? undefined : { y: -1 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                    style={{ ...HEADER_BUTTON_STYLE, padding: '0 11px', gap: 5 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M12 5v14M5 12h14"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      />
                    </svg>
                    New chat
                  </motion.button>
                )}
                <motion.button
                  type="button"
                  onClick={closeChat}
                  aria-label="Close chat"
                  title="Close chat"
                  whileHover={reduceMotion ? undefined : { y: -1 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                  style={{ ...HEADER_BUTTON_STYLE, width: 30, padding: 0 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </motion.button>
              </div>

              {/* Waterline: the chat surface laps up against the header. Twice
                  the panel's width and shifted by exactly half, so the swell
                  loops without a seam. */}
              <svg
                aria-hidden
                viewBox="0 0 744 16"
                preserveAspectRatio="none"
                style={{ position: 'absolute', left: 0, bottom: -1, width: '200%', height: 16, display: 'block' }}
              >
                <motion.g
                  animate={reduceMotion ? undefined : { x: [0, -372] }}
                  transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
                >
                  <path
                    d="M0 9 Q 23.25 3 46.5 9 T 93 9 T 139.5 9 T 186 9 T 232.5 9 T 279 9 T 325.5 9 T 372 9 T 418.5 9 T 465 9 T 511.5 9 T 558 9 T 604.5 9 T 651 9 T 697.5 9 T 744 9 L744 16 L0 16 Z"
                    fill={CHAT_CANVAS}
                  />
                </motion.g>
              </svg>
            </header>

            {/* ── Messages ── */}
            <div
              ref={messagesContainerRef}
              style={{
                flex: 1,
                padding: '16px 14px 10px',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                background: CHAT_CANVAS,
              }}
            >
              {!businessId && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: `1px dashed rgba(${WIDGET_ACCENT_RGB}, 0.48)`,
                    background: WIDGET_ACCENT_SOFT,
                    color: CHAT_MUTED,
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  Preview mode — open this page with <code>?business_id=…</code> (or use the embed
                  snippet from Settings → Integrations) to connect your restaurant.
                </div>
              )}

              {historyLoading && <HistorySkeleton />}

              {!historyLoading && messages.map((message, messageIndex) => {
                const isCustomer = message.sender === 'customer'
                const isLastMessage = messageIndex === messages.length - 1

                // Booking confirmation card
                if (message.bookingCard) {
                  const c = message.bookingCard
                  return (
                    <motion.div
                      key={message.id}
                      initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                      style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}
                    >
                      <div
                        style={{
                          width: '100%',
                          maxWidth: '92%',
                          borderRadius: 16,
                          border: '1.5px solid rgba(52, 211, 153, 0.35)',
                          background: BOOKING_BACKGROUND,
                          overflow: 'hidden',
                          boxShadow: '0 8px 28px rgba(16,185,129,0.11)',
                        }}
                      >
                        <div style={{ padding: '11px 14px 9px', borderBottom: '1px solid rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <motion.span
                            initial={reduceMotion ? false : { scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.15 }}
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              background: 'rgba(52,211,153,0.18)',
                              display: 'grid',
                              placeItems: 'center',
                              color: '#34d399',
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            ✓
                          </motion.span>
                          <span style={{ color: '#34d399', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                            Reservation confirmed
                          </span>
                        </div>
                        <div style={{ padding: '11px 14px 13px' }}>
                          {[
                            { label: 'Guest', value: c.guestName },
                            ...(c.partySize != null
                              ? [{
                                  label: 'Party',
                                  value: `${c.partySize} ${c.partySize === 1 ? 'guest' : 'guests'}`,
                                }]
                              : []),
                            { label: 'When', value: `${c.date} · ${c.time}` },
                            ...(c.zone ? [{ label: 'Area', value: c.zone }] : []),
                            ...(c.resource && !c.zone
                              ? [{ label: 'Activity', value: c.resource }]
                              : []),
                          ].map((row) => (
                            <div
                              key={row.label}
                              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, gap: 12 }}
                            >
                              <span style={{ fontSize: 12, color: CHAT_MUTED, minWidth: 44 }}>{row.label}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: CHAT_TEXT, textAlign: 'right' }}>{row.value}</span>
                            </div>
                          ))}
                          {(() => {
                            const calUrl = googleCalendarUrl(c, businessName, venueTimezone)
                            return calUrl ? (
                              <a
                                href={calUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6,
                                  marginTop: 10,
                                  padding: '8px 12px',
                                  borderRadius: 10,
                                  border: '1px solid rgba(52,211,153,0.3)',
                                  background: 'rgba(52,211,153,0.09)',
                                  color: '#34d399',
                                  fontSize: 12.5,
                                  fontWeight: 700,
                                  textDecoration: 'none',
                                }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <rect x="3" y="4" width="18" height="18" rx="2" />
                                  <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
                                </svg>
                                Add to Google Calendar
                              </a>
                            ) : null
                          })()}
                        </div>
                      </div>
                    </motion.div>
                  )
                }

                return (
                  <motion.div
                    key={message.id}
                    initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isCustomer ? 'flex-end' : 'flex-start',
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: isCustomer ? 'flex-end' : 'flex-start',
                        alignItems: 'flex-start',
                        gap: 8,
                        width: '100%',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: isCustomer ? '76%' : '82%',
                          borderRadius: isCustomer ? '21px 21px 7px 21px' : '21px 21px 21px 7px',
                          padding: '13px 16px',
                          fontSize: 14.5,
                          lineHeight: 1.48,
                          background: isCustomer ? MESSAGE_CUSTOMER_BACKGROUND : MESSAGE_AI_BACKGROUND,
                          color: isCustomer ? CUSTOMER_TEXT : CHAT_TEXT,
                          border: isCustomer ? `1px solid ${MESSAGE_CUSTOMER_BORDER}` : `1px solid ${MESSAGE_AI_BORDER}`,
                          boxShadow: 'none',
                          fontWeight: 400,
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {message.text}
                      </div>
                    </div>

                    {/* Tappable time suggestions — only under the latest reply, gone once used. */}
                    {!isCustomer && isLastMessage && !isLoading && (message.suggestions?.length ?? 0) > 0 && (
                      <motion.div
                        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.2 }}
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 7, margin: '8px 0 0' }}
                      >
                        {message.suggestions!.map((suggestion, suggestionIndex) => (
                          <motion.button
                            key={suggestion}
                            type="button"
                            initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: 0.12 + suggestionIndex * 0.05, duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            whileHover={reduceMotion ? undefined : { y: -1, scale: 1.03 }}
                            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                            onClick={() => void handleSend(suggestion)}
                            style={{ ...CHIP_STYLE, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                          >
                            {suggestion}
                          </motion.button>
                        ))}
                      </motion.div>
                    )}
                  </motion.div>
                )
              })}

              <AnimatePresence>
                {isLoading && <TypingDots conciergeName={conciergeName} />}
              </AnimatePresence>

              {/* Quick-start chips */}
              {showQuickChips && (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.25 }}
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 7, margin: '6px 0 8px' }}
                >
                  {QUICK_CHIPS.map((chip, chipIndex) => (
                    <motion.button
                      key={chip}
                      type="button"
                      initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: reduceMotion ? 0 : 0.3 + chipIndex * 0.06, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      whileHover={reduceMotion ? undefined : { y: -1, scale: 1.03 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                      onClick={() => void handleSend(chip)}
                      style={CHIP_STYLE}
                    >
                      {chip}
                    </motion.button>
                  ))}
                </motion.div>
              )}

              <AnimatePresence initial={false}>
                {showContactStep && !isLoading && (
                  <motion.section
                    key="contact-step"
                    data-testid="contact-step"
                    aria-label="Share contact details"
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -10, y: 14, scale: 0.97, filter: 'blur(5px)' }}
                    animate={{ opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 7, scale: 0.985, filter: 'blur(3px)' }}
                    transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 0.8 }}
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      margin: '3px 0 10px',
                      padding: '13px',
                      borderRadius: 17,
                      border: `1px solid rgba(${WIDGET_ACCENT_RGB}, 0.26)`,
                      background: CONTACT_BACKGROUND,
                      boxShadow: CONTACT_SHADOW,
                    }}
                  >
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute',
                        top: -56,
                        right: -48,
                        width: 130,
                        height: 130,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, rgba(${WIDGET_ACCENT_RGB}, 0.12) 0%, rgba(${WIDGET_ACCENT_RGB}, 0) 70%)`,
                        pointerEvents: 'none',
                      }}
                    />
                    <motion.div
                      initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduceMotion ? 0 : 0.08, duration: 0.2 }}
                      style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 11 }}
                    >
                      <div>
                        <p style={{ margin: 0, color: CHAT_TEXT, fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>
                          Choose a contact method
                        </p>
                        <p style={{ margin: '2px 0 0', color: CHAT_MUTED, fontSize: 10.5 }}>
                          One is all we need
                        </p>
                      </div>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          flexShrink: 0,
                          color: CHAT_SUBTLE,
                          fontSize: 9.5,
                          fontWeight: 600,
                        }}
                      >
                        <PrivacyLockIcon /> Private
                      </span>
                    </motion.div>

                    <motion.div
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: reduceMotion ? 0 : 0.12, duration: 0.22 }}
                      role="tablist"
                      aria-label="Contact method"
                      style={{
                        position: 'relative',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 4,
                        padding: 4,
                        borderRadius: 13,
                        border: `1px solid rgba(${WIDGET_ACCENT_RGB}, 0.16)`,
                        background: CONTACT_TABS_BACKGROUND,
                      }}
                    >
                      {(['phone', 'email'] as const).map((mode) => {
                        const active = effectiveContactMode === mode
                        const label = mode === 'phone' ? 'Phone' : 'Email'
                        return (
                          <motion.button
                            key={mode}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => selectContactMode(mode)}
                            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                            style={{
                              position: 'relative',
                              zIndex: 1,
                              minHeight: 37,
                              padding: '0 12px',
                              border: 0,
                              borderRadius: 10,
                              background: 'transparent',
                              color: active ? WIDGET_ACCENT_TEXT : CHAT_MUTED,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 7,
                              fontWeight: active ? 700 : 600,
                              fontSize: 12.5,
                              cursor: 'pointer',
                              transition: 'color 0.18s ease',
                            }}
                          >
                            {active && (
                              <motion.span
                                layoutId="contact-method-active"
                                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  zIndex: -1,
                                  borderRadius: 10,
                                  border: `1px solid rgba(${WIDGET_ACCENT_RGB}, 0.45)`,
                                  background: CONTACT_ACTIVE_BACKGROUND,
                                  boxShadow: `0 5px 16px rgba(${WIDGET_ACCENT_RGB}, 0.12), inset 0 1px 0 rgba(255,255,255,0.9)`,
                                }}
                              />
                            )}
                            <ContactMethodIcon mode={mode} />
                            {label}
                          </motion.button>
                        )
                      })}
                    </motion.div>

                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={effectiveContactMode}
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: effectiveContactMode === 'phone' ? -8 : 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: effectiveContactMode === 'phone' ? 8 : -8 }}
                        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                        style={{ marginTop: 11 }}
                      >
                        <label
                          htmlFor="contact-detail"
                          style={{ display: 'block', margin: '0 0 6px 2px', color: CHAT_MUTED, fontSize: 10.5, fontWeight: 600 }}
                        >
                          {effectiveContactMode === 'phone' ? 'Phone number' : 'Email address'}
                        </label>
                        <div style={{ display: 'flex', gap: 7 }}>
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              height: 43,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '0 11px',
                              borderRadius: 12,
                              border: `1px solid rgba(${WIDGET_ACCENT_RGB}, 0.24)`,
                              background: CONTACT_INPUT_BACKGROUND,
                              color: CHAT_SUBTLE,
                              transition: 'border-color 0.18s, box-shadow 0.18s',
                            }}
                          >
                            <ContactMethodIcon mode={effectiveContactMode} size={16} />
                            <input
                              ref={contactInputRef}
                              id="contact-detail"
                              type={effectiveContactMode === 'phone' ? 'tel' : 'email'}
                              inputMode={effectiveContactMode === 'phone' ? 'tel' : 'email'}
                              autoComplete={effectiveContactMode === 'phone' ? 'tel' : 'email'}
                              value={effectiveContactMode === 'phone' ? contactPhone : contactEmail}
                              aria-invalid={phoneError ? true : undefined}
                              aria-describedby={phoneError ? 'contact-detail-error' : undefined}
                              onChange={(e) =>
                                effectiveContactMode === 'phone'
                                  ? setContactPhone(formatPhoneInput(e.target.value))
                                  : setContactEmail(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && canSubmit) void handleContactSubmit()
                              }}
                              placeholder={effectiveContactMode === 'phone' ? '(403) 555-0123' : 'name@email.com'}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                border: 0,
                                padding: 0,
                                outline: 'none',
                                background: 'transparent',
                                color: CHAT_TEXT,
                                fontSize: 13.5,
                              }}
                            />
                          </div>
                          <motion.button
                            type="button"
                            onClick={() => void handleContactSubmit()}
                            disabled={isLoading || !canSubmit}
                            aria-label="Send contact details"
                            whileHover={!canSubmit || reduceMotion ? undefined : { y: -1 }}
                            whileTap={!canSubmit || reduceMotion ? undefined : { scale: 0.97 }}
                            style={{
                              height: 43,
                              minWidth: 72,
                              padding: '0 12px',
                              border: '1px solid',
                              borderColor: canSubmit ? `rgba(${WIDGET_ACCENT_RGB}, 0.58)` : 'rgba(21,69,101,0.12)',
                              borderRadius: 12,
                              background: canSubmit
                                ? `linear-gradient(135deg, ${WIDGET_ACCENT} 0%, ${WIDGET_ACCENT_STRONG} 100%)`
                                : DISABLED_BACKGROUND,
                              color: canSubmit ? '#03111c' : CHAT_SUBTLE,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 5,
                              cursor: canSubmit ? 'pointer' : 'not-allowed',
                              boxShadow: canSubmit ? `0 7px 18px rgba(${WIDGET_ACCENT_RGB},0.22)` : 'none',
                              fontSize: 11.5,
                              fontWeight: 800,
                              transition: 'background 0.18s, border-color 0.18s, color 0.18s, box-shadow 0.18s',
                            }}
                          >
                            Send <ContactSendIcon />
                          </motion.button>
                        </div>
                        {phoneError && (
                          <p
                            id="contact-detail-error"
                            role="alert"
                            style={{
                              margin: '7px 2px 0',
                              color: CONTACT_ERROR_COLOR,
                              fontSize: 11,
                              fontWeight: 600,
                              lineHeight: 1.4,
                            }}
                          >
                            {phoneError}
                          </p>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </motion.section>
                )}
              </AnimatePresence>
            </div>

            {/* ── Composer ── */}
            {!showContactStep && (
              <footer
                style={{
                  borderTop: `1px solid ${CHAT_BORDER}`,
                  padding: '10px 12px',
                  paddingBottom: isMobile ? 'max(10px, env(safe-area-inset-bottom))' : 10,
                  background: COMPOSER_BACKGROUND,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        void handleSend()
                      }
                    }}
                    placeholder="Type your message…"
                    aria-label="Message"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: `1px solid ${COMPOSER_INPUT_BORDER}`,
                      borderRadius: 999,
                      padding: '11px 16px',
                      outline: 'none',
                      fontSize: 14,
                      background: COMPOSER_INPUT_BACKGROUND,
                      color: CHAT_TEXT,
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = WIDGET_ACCENT
                      e.currentTarget.style.boxShadow = `0 0 0 3px rgba(${WIDGET_ACCENT_RGB}, 0.16)`
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = COMPOSER_INPUT_BORDER
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  <motion.button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={isLoading || !draft.trim()}
                    aria-label="Send message"
                    whileTap={isLoading || !draft.trim() || reduceMotion ? undefined : { scale: 0.9 }}
                    style={{
                      border: 'none',
                      borderRadius: '50%',
                      width: 42,
                      height: 42,
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      cursor: isLoading || !draft.trim() ? 'not-allowed' : 'pointer',
                      background:
                        isLoading || !draft.trim()
                          ? DISABLED_BACKGROUND
                          : `linear-gradient(135deg, ${WIDGET_ACCENT} 0%, ${WIDGET_ACCENT_STRONG} 100%)`,
                      boxShadow: isLoading || !draft.trim() ? 'none' : `0 3px 12px rgba(${WIDGET_ACCENT_RGB}, 0.3)`,
                      transition: 'background 0.15s, box-shadow 0.15s',
                    }}
                  >
                    <SendIcon muted={isLoading || !draft.trim()} />
                  </motion.button>
                </div>
                <p
                  style={{
                    margin: '7px 2px 0',
                    fontSize: 10,
                    color: CHAT_SUBTLE,
                    textAlign: 'center',
                    letterSpacing: '0.03em',
                  }}
                >
                  Powered by OceanCore
                </p>
              </footer>
            )}
          </motion.div>
        ) : null}
        </AnimatePresence>

        {/* ── Proactive nudge ── */}
        <AnimatePresence>
          {!isEmbed && !isOpen && showNudge ? (
            <motion.div
              key="widget-nudge"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              onClick={openChat}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openChat()
                }
              }}
              aria-label="Open chat"
              style={{
                position: 'fixed',
                right: isMobile ? 16 : 24,
                bottom: isMobile ? 88 : 96,
                maxWidth: isMobile ? 220 : 244,
                padding: '11px 30px 11px 14px',
                borderRadius: 16,
                background: CHAT_SURFACE,
                color: CHAT_TEXT,
                border: `1px solid ${CHAT_BORDER}`,
                boxShadow: SOFT_SHADOW,
                fontSize: 13.5,
                lineHeight: 1.4,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {buildNudgeText(businessName, conciergeName)}

              {/* Tail pointing down toward the launcher. */}
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  right: 22,
                  bottom: -5,
                  width: 12,
                  height: 12,
                  background: CHAT_SURFACE,
                  borderRight: `1px solid ${CHAT_BORDER}`,
                  borderBottom: `1px solid ${CHAT_BORDER}`,
                  transform: 'rotate(45deg)',
                }}
              />

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  closeNudge()
                }}
                aria-label="Dismiss"
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 20,
                  height: 20,
                  display: 'grid',
                  placeItems: 'center',
                  border: 'none',
                  borderRadius: '50%',
                  background: 'transparent',
                  color: CHAT_MUTED,
                  fontSize: 15,
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* ── Launcher (the host page has its own when embedded) ── */}
        {!isEmbed && !(isMobile && isOpen) && (
          <motion.button
            type="button"
            onClick={() => (isOpen ? setIsOpen(false) : openChat())}
            whileHover={reduceMotion ? undefined : { scale: 1.07 }}
            whileTap={reduceMotion ? undefined : { scale: 0.93 }}
            layout
            transition={reduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 420, damping: 28 }}
            aria-label={isOpen ? 'Close chat widget' : 'Open chat widget'}
            /* widget.js sets these on the embedded launcher; this one never did,
               so a screen reader could not tell whether the chat was already
               open. */
            aria-expanded={isOpen}
            aria-controls="oceancore-chat-panel"
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              background: LAUNCHER_BACKGROUND,
              color: LAUNCHER_COLOR,
              boxShadow: LAUNCHER_SHADOW,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <motion.span
              key={isOpen ? 'close' : 'open'}
              initial={reduceMotion ? false : { rotate: -70, opacity: 0, scale: 0.6 }}
              animate={{ rotate: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              style={{ display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 700, lineHeight: 1 }}
            >
              {isOpen ? '×' : <ChatBubbleIcon />}
            </motion.span>
          </motion.button>
        )}
      </div>
    </div>
  )
}

export default function WidgetPage() {
  return (
    <Suspense fallback={null}>
      <WidgetPageInner />
    </Suspense>
  )
}
