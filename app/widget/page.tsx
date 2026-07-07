'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { supabase } from '@/lib/supabase'

type BookingCard = {
  guestName: string
  partySize: number
  date: string
  time: string
  zone: string | null
}

type WidgetMessage = {
  id: string
  sender: 'customer' | 'ai'
  text: string
  bookingCard?: BookingCard
}

const DEFAULT_CONCIERGE_NAME = 'AI Concierge'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

const QUICK_CHIPS = ['Book a table', 'What’s on the menu?', 'What are your hours?']

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
    /\b(may i have|could i have|could i get|can i get|would you share).{0,60}(phone|email)/i.test(
      t,
    )
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

function ConciergeAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = (name.trim().charAt(0) || 'A').toUpperCase()
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(140deg, var(--ocean-sky) 0%, #0284c7 100%)',
        color: '#04121f',
        fontSize: size * 0.44,
        fontWeight: 800,
        boxShadow: '0 2px 8px rgba(56,189,248,0.35)',
      }}
    >
      {initial}
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
          background: 'var(--ocean-surface)',
          border: '1px solid var(--ocean-border)',
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
              background: 'var(--ocean-sky-bright)',
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
            background: 'var(--ocean-surface)',
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
        stroke={muted ? 'var(--ocean-text-subtle)' : '#04121f'}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
      <circle cx="8.6" cy="11.5" r="1.15" fill="var(--ocean-sky-bright)" />
      <circle cx="12" cy="11.5" r="1.15" fill="var(--ocean-sky-bright)" />
      <circle cx="15.4" cy="11.5" r="1.15" fill="var(--ocean-sky-bright)" />
    </svg>
  )
}

// ─── Widget ─────────────────────────────────────────────────────────────────

function WidgetPageInner() {
  const searchParams = useSearchParams()
  const businessId = searchParams.get('business_id')
  const [businessName, setBusinessName] = useState<string | null>(null)
  const [conciergeName, setConciergeName] = useState<string>(DEFAULT_CONCIERGE_NAME)

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
  const restoredRef = useRef(false)
  const isMobile = useIsNarrow()
  const reduceMotion = useReducedMotion()

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
  }, [messages.length, isOpen, isLoading, reduceMotion])

  useEffect(() => {
    if (!businessId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset branding when the widget loses its business id
      setBusinessName(null)
      setConciergeName(DEFAULT_CONCIERGE_NAME)
      return
    }
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('businesses')
        .select('name, agent_name')
        .eq('id', businessId)
        .maybeSingle()
      if (cancelled) return
      const nextName = typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : null
      const nextConcierge =
        typeof data?.agent_name === 'string' && data.agent_name.trim()
          ? data.agent_name.trim()
          : DEFAULT_CONCIERGE_NAME
      setBusinessName(nextName)
      setConciergeName(nextConcierge)
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

  const phoneReady = contactPhone.replace(/\D/g, '').length >= 7
  const emailReady = !!contactEmail.trim()
  const canSubmit = contactMode === 'phone' ? phoneReady : emailReady

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
    el.scrollTop = el.scrollHeight
  }, [showContactStep, contactMode, isOpen])

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
        skipped?: boolean
        reason?: string
        booking_created?: boolean
        booking_details?: {
          guest_name: string
          party_size: number
          date: string
          time: string
          dining_area: string | null
        } | null
      }

      if (response.ok && typeof data.conversation_id === 'string' && data.conversation_id) {
        setConversationId(data.conversation_id)
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
        if (lastAi && lastAi.text === aiText && !lastAi.id.startsWith('ai-')) return prev
        const next: WidgetMessage[] = [
          ...prev,
          { id: nextMessageId('ai'), sender: 'ai', text: aiText },
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
        background: 'var(--ocean-deep)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }
    : {
        width: 372,
        height: 'min(600px, calc(100vh - 120px))',
        background: 'var(--ocean-mid)',
        borderRadius: 'var(--ocean-radius-xl)',
        border: '1px solid var(--ocean-border-strong)',
        boxShadow: 'var(--ocean-shadow-lg), 0 0 60px rgba(56,189,248,0.08)',
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

      <div style={{ position: 'fixed', right: isMobile ? 16 : 24, bottom: isMobile ? 16 : 24, zIndex: 30 }}>
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
                background: 'linear-gradient(150deg, var(--ocean-ink) 0%, var(--ocean-mid) 60%, #0d2a45 100%)',
                borderBottom: '1px solid var(--ocean-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
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
                    border: '2px solid var(--ocean-ink)',
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--ocean-text)',
                    letterSpacing: '-0.01em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {headerTitle}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--ocean-text-muted)' }}>
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
                      border: '1px solid var(--ocean-border)',
                      borderRadius: 9,
                      height: 30,
                      padding: '0 10px',
                      cursor: 'pointer',
                      background: 'rgba(125,211,252,0.06)',
                      color: 'var(--ocean-text-muted)',
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
                    border: '1px solid var(--ocean-border)',
                    borderRadius: 9,
                    width: 30,
                    height: 30,
                    cursor: 'pointer',
                    background: 'rgba(125,211,252,0.06)',
                    color: 'var(--ocean-text-muted)',
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
                background: 'var(--ocean-deep)',
              }}
            >
              {!businessId && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1px dashed var(--ocean-border-strong)',
                    background: 'var(--ocean-sky-muted)',
                    color: 'var(--ocean-text-muted)',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  Preview mode — open this page with <code>?business_id=…</code> (or use the embed
                  snippet from Settings → Integrations) to connect your restaurant.
                </div>
              )}

              {historyLoading && <HistorySkeleton />}

              {!historyLoading && messages.map((message) => {
                const isCustomer = message.sender === 'customer'

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
                          background: 'linear-gradient(150deg, rgba(6,28,46,0.96) 0%, rgba(8,38,45,0.96) 100%)',
                          overflow: 'hidden',
                          boxShadow: '0 8px 28px rgba(16,185,129,0.12)',
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
                              <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.8)', minWidth: 44 }}>{row.label}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', textAlign: 'right' }}>{row.value}</span>
                            </div>
                          ))}
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
                      justifyContent: isCustomer ? 'flex-end' : 'flex-start',
                      alignItems: 'flex-end',
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    {!isCustomer && <ConciergeAvatar name={conciergeName} size={24} />}
                    <div
                      style={{
                        maxWidth: '80%',
                        borderRadius: isCustomer ? '16px 16px 5px 16px' : '16px 16px 16px 5px',
                        padding: '10px 13px',
                        fontSize: 14,
                        lineHeight: 1.5,
                        background: isCustomer
                          ? 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)'
                          : 'var(--ocean-surface)',
                        color: isCustomer ? '#04121f' : 'var(--ocean-text)',
                        border: isCustomer ? 'none' : '1px solid var(--ocean-border)',
                        boxShadow: isCustomer ? '0 3px 12px rgba(56,189,248,0.25)' : 'none',
                        fontWeight: isCustomer ? 500 : 400,
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {message.text}
                    </div>
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
                        border: '1px solid var(--ocean-border-strong)',
                        borderRadius: 999,
                        padding: '7px 13px',
                        background: 'var(--ocean-sky-muted)',
                        color: 'var(--ocean-sky-bright)',
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

              {showContactStep && !isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                    style={{
                      margin: '4px 0 8px 32px',
                      background: 'var(--ocean-surface)',
                      border: '1px solid var(--ocean-border)',
                      borderRadius: 14,
                      padding: '12px 12px 10px',
                    }}
                  >
                    <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ocean-text-muted)', fontWeight: 500, lineHeight: 1.4 }}>
                      How would you like us to reach you?
                    </p>

                    <div style={{ display: 'flex', gap: 7 }}>
                      {(['phone', 'email'] as const).map((mode) => {
                        const active = contactMode === mode
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setContactMode(active ? null : mode)}
                            style={{
                              flex: 1,
                              padding: '9px 0',
                              borderRadius: 11,
                              border: `1.5px solid ${active ? 'var(--ocean-sky)' : 'var(--ocean-border)'}`,
                              background: active ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                              color: active ? 'var(--ocean-sky)' : 'var(--ocean-text-muted)',
                              fontWeight: 600,
                              fontSize: 13,
                              cursor: 'pointer',
                              transition: 'border-color 0.18s, background 0.18s, color 0.18s',
                            }}
                          >
                            {mode === 'phone' ? '📞  Phone' : '✉️  Email'}
                          </button>
                        )
                      })}
                    </div>

                    <AnimatePresence initial={false} mode="wait">
                      {contactMode && (
                        <motion.div
                          key={contactMode}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                            <input
                              autoFocus
                              type={contactMode === 'phone' ? 'tel' : 'email'}
                              value={contactMode === 'phone' ? contactPhone : contactEmail}
                              onChange={(e) =>
                                contactMode === 'phone'
                                  ? setContactPhone(formatPhone(e.target.value))
                                  : setContactEmail(e.target.value)
                              }
                              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) void handleContactSubmit() }}
                              placeholder={contactMode === 'phone' ? '(403) ___-____' : 'name@email.com'}
                              style={{
                                flex: 1,
                                border: '1px solid var(--ocean-border)',
                                borderRadius: 10,
                                padding: '9px 11px',
                                fontSize: 14,
                                outline: 'none',
                                background: 'var(--ocean-deep)',
                                color: 'var(--ocean-text)',
                                boxSizing: 'border-box',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => void handleContactSubmit()}
                              disabled={isLoading || !canSubmit}
                              aria-label="Submit contact"
                              style={{
                                border: 'none',
                                borderRadius: 10,
                                padding: '9px 14px',
                                cursor: isLoading || !canSubmit ? 'not-allowed' : 'pointer',
                                background: isLoading || !canSubmit
                                  ? 'var(--ocean-border)'
                                  : 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)',
                                color: isLoading || !canSubmit ? 'var(--ocean-text-subtle)' : '#04121f',
                                fontWeight: 700,
                                fontSize: 16,
                                lineHeight: 1,
                                transition: 'background 0.15s',
                              }}
                            >
                              →
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
              )}
            </div>

            {/* ── Composer ── */}
            {!showContactStep && (
              <footer
                style={{
                  borderTop: '1px solid var(--ocean-border)',
                  padding: '10px 12px',
                  paddingBottom: isMobile ? 'max(10px, env(safe-area-inset-bottom))' : 10,
                  background: 'var(--ocean-ink)',
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
                      border: '1px solid var(--ocean-border)',
                      borderRadius: 999,
                      padding: '11px 16px',
                      outline: 'none',
                      fontSize: 14,
                      background: 'var(--ocean-deep)',
                      color: 'var(--ocean-text)',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--ocean-sky)'
                      e.currentTarget.style.boxShadow = '0 0 0 3px var(--ocean-sky-muted)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--ocean-border)'
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
                          ? 'var(--ocean-surface)'
                          : 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)',
                      boxShadow: isLoading || !draft.trim() ? 'none' : '0 3px 12px rgba(56,189,248,0.35)',
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
                    color: 'var(--ocean-text-subtle)',
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
              background: 'linear-gradient(140deg, var(--ocean-sky), var(--ocean-sand-deep))',
              color: '#04121f',
              boxShadow: 'var(--ocean-shadow-glow)',
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
