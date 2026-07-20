'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import Image from 'next/image'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { supabase } from '@/lib/supabase'
import {
  DEFAULT_WIDGET_THEME,
  parseWidgetTheme,
  WIDGET_THEME_PALETTES,
  type WidgetTheme,
} from '@/lib/widget-theme'

type BookingCard = {
  guestName: string
  partySize: number
  date: string
  time: string
  zone: string | null
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
function googleCalendarUrl(card: BookingCard, businessName: string | null): string | null {
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
    ? `Table for ${card.partySize} — ${businessName}`
    : `Restaurant reservation — table for ${card.partySize}`
  const details = card.zone ? `Seating: ${card.zone}` : ''
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    ctz: 'America/Edmonton',
    ...(details ? { details } : {}),
    ...(businessName ? { location: businessName } : {}),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

const DEFAULT_CONCIERGE_NAME = 'AI Concierge'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

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
const HEADER_BORDER = 'var(--widget-header-border)'
const HEADER_SHADOW = 'var(--widget-header-shadow)'
const HEADER_BUTTON_BACKGROUND = 'var(--widget-header-button-background)'
const HEADER_BUTTON_TEXT = 'var(--widget-header-button-text)'
const HEADER_ONLINE_BORDER = 'var(--widget-header-online-border)'
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
const SOFT_SHADOW = 'var(--widget-soft-shadow)'
const CONTACT_SHADOW = 'var(--widget-contact-shadow)'

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

function saveSession(businessId: string, convId: string) {
  try {
    localStorage.setItem(storageKey(businessId), JSON.stringify({ id: convId, ts: Date.now() }))
  } catch { /* storage full / blocked — non-critical */ }
}

function loadSession(businessId: string): string | null {
  try {
    const raw = localStorage.getItem(storageKey(businessId))
    if (!raw) return null
    const { id, ts } = JSON.parse(raw) as { id: string; ts: number }
    if (Date.now() - ts > SESSION_TTL_MS) {
      localStorage.removeItem(storageKey(businessId))
      return null
    }
    return id
  } catch {
    return null
  }
}

function clearSession(businessId: string) {
  try { localStorage.removeItem(storageKey(businessId)) } catch { /* noop */ }
}

// ── Device-level guest identity ───────────────────────────────────────────────
// Outlives the 24h conversation session: the same browser is recognized as the
// same guest for months, so returning guests get their history without retyping
// contact info. The server validates the id — a stale/foreign id is ignored.

const GUEST_TTL_MS = 180 * 24 * 60 * 60 * 1000

function guestKey(businessId: string) {
  return `oceancore-guest-${businessId}`
}

function saveGuestId(businessId: string, customerId: string) {
  try {
    localStorage.setItem(guestKey(businessId), JSON.stringify({ id: customerId, ts: Date.now() }))
  } catch { /* storage full / blocked — non-critical */ }
}

function loadGuestId(businessId: string): string | null {
  try {
    const raw = localStorage.getItem(guestKey(businessId))
    if (!raw) return null
    const { id, ts } = JSON.parse(raw) as { id: string; ts: number }
    if (Date.now() - ts > GUEST_TTL_MS) {
      localStorage.removeItem(guestKey(businessId))
      return null
    }
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

let messageSeq = 0
/** Unique client-side message id; the prefix drives the realtime de-dup logic. */
function nextMessageId(prefix: string): string {
  messageSeq += 1
  return `${prefix}-${Date.now()}-${messageSeq}`
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

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

function ConciergeAvatar({ size = 32 }: { name: string; size?: number }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        overflow: 'hidden',
        background: 'radial-gradient(circle at 45% 30%, #153653 0%, #061018 72%)',
        border: `${Math.max(1, size * 0.035)}px solid rgba(125, 211, 252, 0.42)`,
        boxShadow: `0 3px 12px rgba(${WIDGET_ACCENT_RGB}, 0.26), inset 0 1px 0 rgba(255,255,255,0.12)`,
      }}
    >
      <Image
        src="/avatars/oceancore-concierge.png"
        alt=""
        fill
        sizes={`${size}px`}
        preload={size >= 40}
        style={{
          objectFit: 'contain',
          transform: 'scale(1.16) translateY(2%)',
          filter: 'saturate(0.96) contrast(1.04)',
        }}
      />
    </div>
  )
}

function TypingDots({ conciergeName }: { conciergeName: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 12 }}
      aria-label={`${conciergeName} is typing`}
    >
      <ConciergeAvatar name={conciergeName} size={24} />
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
  const [businessName, setBusinessName] = useState<string | null>(null)
  const [conciergeName, setConciergeName] = useState<string>(DEFAULT_CONCIERGE_NAME)
  const [widgetTheme, setWidgetTheme] = useState<WidgetTheme>(DEFAULT_WIDGET_THEME)

  const [isOpen, setIsOpen] = useState(false)
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
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const contactInputRef = useRef<HTMLInputElement | null>(null)
  const restoredRef = useRef(false)
  const isMobile = useIsNarrow()
  const reduceMotion = useReducedMotion()
  const widgetPaletteVars = WIDGET_THEME_PALETTES[widgetTheme] as React.CSSProperties

  // Restore session from localStorage on mount / businessId change
  useEffect(() => {
    restoredRef.current = false
    if (!businessId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore persisted session on mount/business change
      setConversationId(null)
      return
    }
    const saved = loadSession(businessId)
    if (saved) {
      setConversationId(saved)
      restoredRef.current = true
    } else {
      setConversationId(null)
    }
  }, [businessId])

  // When conversationId is restored, fetch message history from DB
  useEffect(() => {
    if (!conversationId || !restoredRef.current) return
    restoredRef.current = false

    let cancelled = false
    setHistoryLoading(true)

    void (async () => {
      const { data: rows } = await supabase
        .from('messages')
        .select('id, role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (rows && rows.length > 0) {
        const history: WidgetMessage[] = rows.map((r) => ({
          id: r.id,
          sender: r.role === 'user' ? 'customer' as const : 'ai' as const,
          text: r.content ?? '',
        }))
        setMessages(history)
      }
      setHistoryLoading(false)
    })()

    return () => { cancelled = true }
  }, [conversationId])

  // Persist conversationId to localStorage whenever it changes
  useEffect(() => {
    if (conversationId && businessId) {
      saveSession(businessId, conversationId)
    }
  }, [conversationId, businessId])

  useEffect(() => {
    if (!conversationId) {
      return
    }

    const channel = supabase
      .channel(`widget-messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; role?: string; content?: string | null }
          if (typeof row.id !== 'string') {
            return
          }
          const incomingId = row.id
          const content = row.content ?? ''
          if (!content.trim()) return
          const isAssistant = row.role === 'assistant'

          if (isAssistant) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === incomingId)) return prev
              const ownIdx = prev.findLastIndex(
                (m) => m.sender === 'ai' && m.text === content && m.id.startsWith('ai-'),
              )
              if (ownIdx !== -1) {
                const next = [...prev]
                next[ownIdx] = { ...next[ownIdx], id: incomingId }
                return next
              }
              return [...prev, { id: incomingId, sender: 'ai', text: content }]
            })
            return
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === incomingId)) return prev
            const optimisticIdx = prev.findLastIndex(
              (m) => m.sender === 'customer' && m.text === content && m.id.startsWith('customer-'),
            )
            if (optimisticIdx !== -1) {
              const next = [...prev]
              next[optimisticIdx] = { id: incomingId, sender: 'customer', text: content }
              return next
            }
            return [...prev, { id: incomingId, sender: 'customer', text: content }]
          })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId])

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
      return
    }
    let cancelled = false
    void (async () => {
      const themedResult = await supabase
        .from('businesses')
        .select('name, agent_name, widget_theme')
        .eq('id', businessId)
        .maybeSingle()
      let data = themedResult.data as {
        name?: unknown
        agent_name?: unknown
        widget_theme?: unknown
      } | null
      let error = themedResult.error
      if (error?.message.toLowerCase().includes('widget_theme')) {
        const fallback = await supabase
          .from('businesses')
          .select('name, agent_name')
          .eq('id', businessId)
          .maybeSingle()
        data = fallback.data as { name?: unknown; agent_name?: unknown } | null
        error = fallback.error
      }
      if (cancelled) return
      if (error) return
      const nextName = typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : null
      const nextConcierge =
        typeof data?.agent_name === 'string' && data.agent_name.trim()
          ? data.agent_name.trim()
          : DEFAULT_CONCIERGE_NAME
      setBusinessName(nextName)
      setConciergeName(nextConcierge)
      setWidgetTheme(parseWidgetTheme(data?.widget_theme))
      setMessages((prev) =>
        prev.length === 1 && prev[0].id === 'welcome'
          ? [buildWelcome(nextName, nextConcierge)]
          : prev,
      )
    })()
    return () => {
      cancelled = true
    }
  }, [businessId])

  const handleContactSubmit = async () => {
    const phoneDigits = contactPhone.replace(/\D/g, '')
    const value = phoneDigits.length >= 7 ? contactPhone : contactEmail.trim()
    if (!value) return
    setContactPhone('')
    setContactEmail('')
    setContactMode(null)
    await handleSend(value)
  }

  const handleNewChat = useCallback(() => {
    if (businessId) clearSession(businessId)
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

  const phoneReady = contactPhone.replace(/\D/g, '').length >= 7
  const emailReady = !!contactEmail.trim()
  const canSubmit = effectiveContactMode === 'phone' ? phoneReady : emailReady

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
        guest_customer_id?: string
      } = {
        messages: nextMessages.map((message) => ({
          role: message.sender === 'customer' ? 'user' : 'assistant',
          content: message.text,
        })),
      }
      if (businessId) {
        body.business_id = businessId
        if (conversationId) {
          body.conversation_id = conversationId
        }
        const rememberedGuestId = loadGuestId(businessId)
        if (rememberedGuestId) {
          body.guest_customer_id = rememberedGuestId
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
        customer_id?: string | null
        skipped?: boolean
        reason?: string
        booking_created?: boolean
        booking_details?: {
          guest_name: string
          party_size: number
          date: string
          time: string
          dining_area: string | null
          duration_minutes?: number
        } | null
        suggested_times?: string[]
      }

      if (response.ok && typeof data.conversation_id === 'string' && data.conversation_id) {
        setConversationId(data.conversation_id)
      }
      // Remember who this device belongs to — after a booking the id points to
      // the merged/real guest profile, so future chats greet them by name.
      if (response.ok && businessId && typeof data.customer_id === 'string' && data.customer_id) {
        saveGuestId(businessId, data.customer_id)
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
          const d = data.booking_details
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
              partySize: d.party_size,
              date: formattedDate,
              time: formattedTime,
              zone: d.dining_area ?? null,
              rawDate: d.date,
              rawTime: d.time,
              durationMinutes: d.duration_minutes,
            },
          })
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

  const panelStyle: React.CSSProperties = isMobile
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
      style={{
        minHeight: '100vh',
        background: 'var(--ocean-canvas)',
        backgroundColor: 'var(--ocean-deep)',
        color: 'var(--ocean-text)',
      }}
    >
      <div style={{ padding: 32, color: 'var(--ocean-text-muted)' }}>
        <h1 style={{ margin: 0, fontSize: 30, color: 'var(--ocean-text)' }}>OceanCore · Widget preview</h1>
        <p style={{ marginTop: 10, maxWidth: 700 }}>
          Standalone chat widget. Use the bubble in the bottom-right to open your AI Concierge.
        </p>
      </div>

      <div
        style={{
          ...widgetPaletteVars,
          position: 'fixed',
          right: isMobile ? 16 : 24,
          bottom: isMobile ? 16 : 24,
          zIndex: 30,
        }}
      >
        <AnimatePresence>
        {isOpen ? (
          <motion.div
            key="widget-panel"
            initial={{ opacity: 0, y: 18, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.96 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={panelStyle}
          >
            {/* ── Header ── */}
            <header
              style={{
                padding: '14px 16px',
                background: HEADER_BACKGROUND,
                borderBottom: `1px solid ${HEADER_BORDER}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                boxShadow: HEADER_SHADOW,
              }}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <ConciergeAvatar name={conciergeName} size={40} />
                <motion.span
                  animate={reduceMotion ? undefined : { boxShadow: [
                    '0 0 0 0 rgba(74,222,128,0.5)',
                    '0 0 0 5px rgba(74,222,128,0)',
                  ] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 11,
                    height: 11,
                    borderRadius: '50%',
                    background: 'var(--ocean-success)',
                    border: `2px solid ${HEADER_ONLINE_BORDER}`,
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 750,
                    color: CHAT_TEXT,
                    letterSpacing: '-0.015em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {headerTitle}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: CHAT_MUTED, fontWeight: 500 }}>
                  {conciergeName} · Replies instantly
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {conversationId && (
                  <button
                    type="button"
                    onClick={handleNewChat}
                    title="Start a new chat"
                    style={{
                      border: `1px solid rgba(${WIDGET_ACCENT_RGB}, 0.28)`,
                      borderRadius: 10,
                      height: 30,
                      padding: '0 10px',
                      cursor: 'pointer',
                      background: HEADER_BUTTON_BACKGROUND,
                      color: HEADER_BUTTON_TEXT,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.02em',
                    }}
                  >
                    New chat
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close chat"
                  style={{
                    border: `1px solid rgba(${WIDGET_ACCENT_RGB}, 0.28)`,
                    borderRadius: 10,
                    width: 30,
                    height: 30,
                    cursor: 'pointer',
                    background: HEADER_BUTTON_BACKGROUND,
                    color: HEADER_BUTTON_TEXT,
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
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
                            { label: 'Party', value: `${c.partySize} ${c.partySize === 1 ? 'guest' : 'guests'}` },
                            { label: 'When', value: `${c.date} · ${c.time}` },
                            ...(c.zone ? [{ label: 'Area', value: c.zone }] : []),
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
                            const calUrl = googleCalendarUrl(c, businessName)
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
                      {!isCustomer && <ConciergeAvatar name={conciergeName} size={28} />}
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
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '7px 0 0 36px' }}
                      >
                        {message.suggestions!.map((suggestion, suggestionIndex) => (
                          <motion.button
                            key={suggestion}
                            type="button"
                            initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.12 + suggestionIndex * 0.05, duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            whileHover={reduceMotion ? undefined : { y: -1, scale: 1.03 }}
                            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                            onClick={() => void handleSend(suggestion)}
                            style={{
                              border: `1.5px solid rgba(${WIDGET_ACCENT_RGB}, 0.45)`,
                              borderRadius: 11,
                              padding: '8px 13px',
                              background: CHAT_SURFACE,
                              color: WIDGET_ACCENT_TEXT,
                              fontSize: 12.5,
                              fontWeight: 700,
                              letterSpacing: '0.01em',
                              cursor: 'pointer',
                              boxShadow: SOFT_SHADOW,
                              fontVariantNumeric: 'tabular-nums',
                            }}
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
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 7, margin: '4px 0 8px 32px' }}
                >
                  {QUICK_CHIPS.map((chip) => (
                    <motion.button
                      key={chip}
                      type="button"
                      whileHover={reduceMotion ? undefined : { y: -1, scale: 1.02 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                      onClick={() => void handleSend(chip)}
                      style={{
                        border: `1px solid rgba(${WIDGET_ACCENT_RGB}, 0.28)`,
                        borderRadius: 999,
                        padding: '7px 13px',
                        background: WIDGET_ACCENT_SOFT,
                        color: WIDGET_ACCENT_TEXT,
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
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
                      margin: '3px 0 10px 32px',
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
                              onChange={(e) =>
                                effectiveContactMode === 'phone'
                                  ? setContactPhone(formatPhone(e.target.value))
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

        {/* ── Launcher ── */}
        {!(isMobile && isOpen) && (
          <motion.button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            whileHover={reduceMotion ? undefined : { scale: 1.07 }}
            whileTap={reduceMotion ? undefined : { scale: 0.93 }}
            layout
            aria-label={isOpen ? 'Close chat widget' : 'Open chat widget'}
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              background: LAUNCHER_BACKGROUND,
              color: LAUNCHER_COLOR,
              boxShadow: `0 0 40px rgba(${WIDGET_ACCENT_RGB}, 0.34)`,
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
