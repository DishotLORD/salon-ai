'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { resolveBusinessAccess } from '@/lib/business-access'
import { oceanTransition } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'
import { card, t } from '@/lib/dashboard-theme'

type ConversationStatus = 'Live' | 'Waiting' | 'Resolved' | 'Human'
type Sender = 'guest' | 'ai'

type Message = {
  id: string
  sender: Sender
  text: string
  time: string
}

type Conversation = {
  id: string
  customerId: string | null
  customerName: string
  phone: string | null
  email: string | null
  preview: string
  time: string
  /** Epoch ms of the last message (or updated_at). Drives archiving; the
   *  formatted `time` above cannot be compared. */
  lastActivityMs: number
  status: ConversationStatus
  messages: Message[]
}

type DbMessageRow = {
  id: string
  role: string
  content: string
  created_at: string
}

type DbCustomerRow = { phone: string | null; email: string | null }

type DbConversationRow = {
  id: string
  customer_id: string | null
  customer_name: string | null
  status: string | null
  updated_at: string | null
  customers: DbCustomerRow | DbCustomerRow[] | null
  messages: DbMessageRow[] | null
}

const panelStyle = card

function normalizeStatus(raw: string | null | undefined): ConversationStatus {
  const key = (raw ?? 'Live').toLowerCase()
  if (key === 'human') {
    return 'Human'
  }
  if (key === 'waiting') {
    return 'Waiting'
  }
  if (key === 'resolved' || key === 'closed') {
    return 'Resolved'
  }
  if (key === 'active' || key === 'live' || key === '') {
    return 'Live'
  }
  return 'Live'
}

/** Supabase returns timestamptz values without a suffix — ensure JS treats them as UTC. */
function parseUtc(iso: string): Date {
  if (/[Zz+\-]\d{2}:?\d{2}$/.test(iso) || iso.endsWith('Z')) return new Date(iso)
  return new Date(iso + 'Z')
}

function formatClock(iso: string) {
  return parseUtc(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime(iso: string | null | undefined) {
  if (!iso) {
    return 'now'
  }
  const then = parseUtc(iso).getTime()
  const sec = Math.floor((Date.now() - then) / 1000)
  if (sec < 60) {
    return 'now'
  }
  if (sec < 3600) {
    return `${Math.floor(sec / 60)} min`
  }
  if (sec < 86400) {
    return `${Math.floor(sec / 3600)}h`
  }
  if (sec < 604800) {
    return `${Math.floor(sec / 86400)}d`
  }
  return parseUtc(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function mapDbMessageToMessage(row: DbMessageRow): Message {
  const sender: Sender = row.role === 'assistant' ? 'ai' : 'guest'
  return {
    id: row.id,
    sender,
    text: row.content,
    time: formatClock(row.created_at),
  }
}

function mapDbConversationToConversation(row: DbConversationRow): Conversation {
  const ordered = [...(row.messages ?? [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  const last = ordered[ordered.length - 1]
  const preview = last?.content ?? 'No messages yet'
  const lastActivity = last?.created_at ?? row.updated_at
  // Activity is the later of the guest's last message and the last change to
  // the row, so reopening or taking over a chat counts as working on it. Going
  // by messages alone let a chat a host had just reopened stay filed as stale.
  // Supabase timestamps arrive without a zone suffix; parseUtc keeps them from
  // being read as local time, which would age every chat by the UTC offset.
  const lastActivityMs = Math.max(
    last?.created_at ? parseUtc(last.created_at).getTime() : 0,
    row.updated_at ? parseUtc(row.updated_at).getTime() : 0,
  )
  return {
    id: row.id,
    customerId: row.customer_id ?? null,
    customerName:
      row.customer_name?.trim() && row.customer_name.trim().toLowerCase() !== 'website visitor'
        ? row.customer_name.trim()
        : 'Guest',
    phone: (Array.isArray(row.customers) ? row.customers[0]?.phone : row.customers?.phone)?.trim() || null,
    email: (Array.isArray(row.customers) ? row.customers[0]?.email : row.customers?.email)?.trim() || null,
    preview,
    time: formatRelativeTime(lastActivity),
    lastActivityMs,
    status: normalizeStatus(row.status),
    messages: ordered.map(mapDbMessageToMessage),
  }
}


/** Colour per conversation state, so Status reads at a glance instead of
 *  being one more grey value in the list. */
const STATUS_COLOR: Record<ConversationStatus, string> = {
  Live: t.accent,
  Human: t.warning,
  Waiting: t.textMuted,
  Resolved: '#4ade80',
}

function IconTakeOver() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M13 8l-3 3 3 3" />
      <path d="M10 11h5" />
    </svg>
  )
}

function IconReopen() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  )
}

function IconMail() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  )
}

function IconSparkle() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  )
}

function IconBolt() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12z" />
    </svg>
  )
}

function IconSend() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 12L20 4l-4 16-4.5-6z" />
      <path d="M11.5 14L20 4" />
    </svg>
  )
}

/** Openers a host reaches for most while covering the AI. Deliberately
 *  unfinished sentences where a real answer has to follow, so nothing here can
 *  be fired off as a complete reply by mistake. */
const COMPOSER_MAX_H = 132

const SUGGESTED_REPLIES = [
  'Happy to help with that!',
  'Let me check availability.',
  "You're all set — anything else?",
] as const

function IconArchive() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  )
}

function IconGear() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a1.9 1.9 0 1 1-2.69 2.69l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47v.17a1.9 1.9 0 0 1-3.8 0V20.7a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.9 1.9 0 1 1-2.69-2.69l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3.6a1.9 1.9 0 0 1 0-3.8h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.9 1.9 0 1 1 2.69-2.69l.06.06a1.6 1.6 0 0 0 1.77.32H9.4a1.6 1.6 0 0 0 1-1.47V3.6a1.9 1.9 0 0 1 3.8 0v.09a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.9 1.9 0 1 1 2.69 2.69l-.06.06a1.6 1.6 0 0 0-.32 1.77v.01a1.6 1.6 0 0 0 1.47 1h.17a1.9 1.9 0 0 1 0 3.8H20.7a1.6 1.6 0 0 0-1.46 1z" />
    </svg>
  )
}

/** A chat drops out of the inbox once its last activity is a day old. */
const ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000

/* ── Inbox list preferences ─────────────────────────────────────────────────
   How the list is ordered and how tight the rows sit is a per-host habit: one
   works the newest chat down, another scans a room alphabetically. The gear in
   the list header holds those choices and they persist across sessions. */

type ListSort = 'recent' | 'oldest' | 'name'
type ListPrefs = {
  sort: ListSort
  /** Live and Human first, resolved last — the historical order of the All tab. */
  groupByStatus: boolean
  /** Drops the message preview line and shortens the row. */
  compact: boolean
}

const LIST_PREFS_KEY = 'oc-chats-list-prefs'

const DEFAULT_LIST_PREFS: ListPrefs = {
  sort: 'recent',
  groupByStatus: true,
  compact: false,
}

const SORT_LABELS: Record<ListSort, string> = {
  recent: 'Newest activity',
  oldest: 'Oldest activity',
  name: 'Guest name (A–Z)',
}

function SettingsToggle({
  label,
  hint,
  checked,
  disabled,
  disabledHint,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  disabledHint?: string
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '7px 8px',
        borderRadius: 8,
        border: 'none',
        background: 'transparent',
        color: t.textMuted,
        textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: t.text }}>{label}</span>
        <span style={{ fontSize: 10, color: t.textSubtle }}>{disabled ? (disabledHint ?? hint) : hint}</span>
      </span>
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 28,
          height: 16,
          borderRadius: 999,
          padding: 2,
          background: checked ? t.accent : t.bgSurfaceMuted,
          border: `1px solid ${checked ? t.accent : t.border}`,
          display: 'flex',
          justifyContent: checked ? 'flex-end' : 'flex-start',
          transition: 'background 0.15s, border-color 0.15s',
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: checked ? '#ffffff' : t.textSubtle,
            transition: 'background 0.15s',
          }}
        />
      </span>
    </button>
  )
}

function readListPrefs(): ListPrefs {
  try {
    const raw = window.localStorage.getItem(LIST_PREFS_KEY)
    if (!raw) return DEFAULT_LIST_PREFS
    const parsed = JSON.parse(raw) as Partial<ListPrefs>
    return {
      sort: parsed.sort === 'oldest' || parsed.sort === 'name' ? parsed.sort : DEFAULT_LIST_PREFS.sort,
      groupByStatus: typeof parsed.groupByStatus === 'boolean' ? parsed.groupByStatus : DEFAULT_LIST_PREFS.groupByStatus,
      compact: typeof parsed.compact === 'boolean' ? parsed.compact : DEFAULT_LIST_PREFS.compact,
    }
  } catch {
    return DEFAULT_LIST_PREFS
  }
}

function isArchived(conversation: Conversation, nowMs: number): boolean {
  // Only finished chats file themselves away. One still open is waiting on
  // somebody however old it is — a chat a host took over and left overnight is
  // exactly the one that must not disappear into the archive.
  if (conversation.status !== 'Resolved') return false
  // A conversation with no usable timestamp stays in the inbox: hiding it would
  // make it unreachable, since the archive is keyed on the age it is missing.
  if (!conversation.lastActivityMs) return false
  return nowMs - conversation.lastActivityMs > ARCHIVE_AFTER_MS
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export default function ChatsInboxPage() {
  const searchParams = useSearchParams()
  const [conversationList, setConversationList] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sendingConversationId, setSendingConversationId] = useState<string | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const [inboxLoaded, setInboxLoaded] = useState(false)
  const [inboxFetchError, setInboxFetchError] = useState(false)
  const [conciergeName, setConciergeName] = useState('AI Concierge')
  const [takeoverError, setTakeoverError] = useState('')
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<'All' | 'Active' | 'Human' | 'Closed'>('All')
  // Archive is derived from age, not a stored flag: nothing has to move rows on
  // a schedule, the cutoff stays correct as time passes, and a guest replying
  // pulls their chat back into the inbox on its own.
  const [showArchive, setShowArchive] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [onlineConvIds, setOnlineConvIds] = useState<Set<string>>(new Set())
  const [listPrefs, setListPrefs] = useState<ListPrefs>(DEFAULT_LIST_PREFS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmBulkResolve, setConfirmBulkResolve] = useState(false)
  const [bulkResolving, setBulkResolving] = useState(false)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useReducedMotion()

  // Stored preferences are read after mount: the server has no localStorage, so
  // seeding state with them would render one list and hydrate a different one.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration of a client-only store
    setListPrefs(readListPrefs())
  }, [])

  const updateListPrefs = useCallback((patch: Partial<ListPrefs>) => {
    setListPrefs((prev) => {
      const next = { ...prev, ...patch }
      try {
        window.localStorage.setItem(LIST_PREFS_KEY, JSON.stringify(next))
      } catch { /* storage blocked — the choice still applies to this session */ }
      return next
    })
  }, [])

  // Closing drops a pending confirmation: reopening the menu later and finding
  // a live "Resolve 12 chats?" button waiting is a trap.
  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    setConfirmBulkResolve(false)
  }, [])

  useEffect(() => {
    if (!settingsOpen) return
    function onDocClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        closeSettings()
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeSettings()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [settingsOpen, closeSettings])

  const isGuestOnline = useCallback(
    (convId: string) => onlineConvIds.has(convId),
    [onlineConvIds],
  )

  useEffect(() => {
    let cancelled = false

    async function loadConversations() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled) return

      if (!user) {
        setInboxLoaded(true)
        setInboxFetchError(false)
        setConversationList([])
        setSelectedId('')
        return
      }

      const access = await resolveBusinessAccess()
      if (cancelled) return

      const { data: business } = access
        ? await supabase
            .from('businesses')
            .select('id, agent_name')
            .eq('id', access.businessId)
            .maybeSingle()
        : { data: null }

      if (cancelled) return

      if (business?.agent_name?.trim()) {
        setConciergeName(business.agent_name.trim())
      }

      if (business?.id) {
        setBusinessId(business.id)
      }

      if (!business?.id) {
        setInboxLoaded(true)
        setInboxFetchError(false)
        setConversationList([])
        setSelectedId('')
        return
      }

      const { data, error } = await supabase
        .from('conversations')
        .select(
          `
          id,
          customer_id,
          customer_name,
          status,
          updated_at,
          customers ( phone, email ),
          messages (
            id,
            role,
            content,
            created_at
          )
        `,
        )
        .eq('business_id', business.id)
        .order('updated_at', { ascending: false })
        .order('created_at', { referencedTable: 'messages', ascending: true })

      if (cancelled) {
        return
      }

      setInboxLoaded(true)

      if (error) {
        console.error('[chats] conversations fetch error:', error.message)
        setInboxFetchError(true)
        setConversationList([])
        setSelectedId('')
        return
      }

      setInboxFetchError(false)

      if (!data?.length) {
        setConversationList([])
        setSelectedId('')
        return
      }

      // Auto-close conversations inactive for more than 15 minutes. Staleness is
      // based on the LAST MESSAGE time (falling back to updated_at), parsed as
      // UTC — new Date() on a suffix-less Supabase timestamp would read it in
      // local time and keep chats "fresh" for hours.
      const STALE_MS = 15 * 60 * 1000
      const now = Date.now()
      const staleIds: string[] = []
      for (const row of data) {
        const conv = row as DbConversationRow
        const status = (conv.status ?? '').toLowerCase()
        if (status !== 'active' && status !== '') continue
        const lastMessageAt = (conv.messages ?? []).reduce<string | null>(
          (latest, m) => (latest === null || m.created_at > latest ? m.created_at : latest),
          null,
        )
        // Same definition of activity the inbox uses: a chat someone just
        // reopened is being worked on, even if the guest has not written since.
        const lastActivity = Math.max(
          lastMessageAt ? parseUtc(lastMessageAt).getTime() : 0,
          conv.updated_at ? parseUtc(conv.updated_at).getTime() : 0,
        )
        if (lastActivity > 0 && now - lastActivity > STALE_MS) {
          staleIds.push(conv.id)
        }
      }
      if (staleIds.length > 0) {
        await supabase.from('conversations').update({ status: 'closed' }).in('id', staleIds)
        for (const row of data) {
          if (staleIds.includes((row as DbConversationRow).id)) {
            ;(row as Record<string, unknown>).status = 'closed'
          }
        }
      }

      const mapped = data.map((row) => mapDbConversationToConversation(row as DbConversationRow))
      setConversationList(mapped)
      const deepLink = searchParams.get('conversation')
      const linked = deepLink ? mapped.find((c) => c.id === deepLink) : undefined
      if (linked) {
        // A link can point at a day-old chat, so open the room that actually
        // holds it rather than leaving the list and the pane disagreeing.
        setShowArchive(isArchived(linked, now))
        setSelectedId(linked.id)
      } else {
        // Auto-open only from the room on screen. Picking the newest chat
        // overall used to park an archived conversation in the middle of an
        // empty inbox, which read as if it were still waiting on a reply.
        setSelectedId(mapped.find((c) => !isArchived(c, now))?.id ?? '')
      }
    }

    void loadConversations()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  const selectedConversation = useMemo(() => {
    if (!selectedId) {
      return null
    }
    return conversationList.find((conversation) => conversation.id === selectedId) ?? null
  }, [conversationList, selectedId])

  const returningCustomerIds = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of conversationList) {
      if (c.customerId) counts.set(c.customerId, (counts.get(c.customerId) ?? 0) + 1)
    }
    const result = new Set<string>()
    for (const [id, count] of counts) {
      if (count > 1) result.add(id)
    }
    return result
  }, [conversationList])

  // Re-read the clock so a chat crosses the one-day line while the tab is open.
  // A backgrounded tab has its timers frozen, so refresh on return too.
  useEffect(() => {
    const tick = () => setNowMs(Date.now())
    const id = setInterval(tick, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const toggleArchive = useCallback(() => {
    setShowArchive((prev) => {
      const next = !prev
      // Land on the first chat of the room being entered; leaving the pane on a
      // chat that is no longer in the list reads as a broken selection.
      const firstInRoom = conversationList.find((c) => isArchived(c, Date.now()) === next)
      setSelectedId(firstInRoom?.id ?? '')
      return next
    })
  }, [conversationList])

  // What the room is doing right now, in a sentence. The counts exist in the
  // list already; the point here is to answer "does anything need me?" without
  // reading it.
  const roomSummary = useMemo(() => {
    const needsYou = conversationList.filter((c) => c.status === 'Human').length
    const withAi = conversationList.filter((c) => c.status === 'Live').length
    if (needsYou > 0) {
      return `${needsYou} waiting on you · ${withAi} with ${conciergeName}`
    }
    if (withAi > 0) {
      return `${conciergeName} is handling ${withAi} ${withAi === 1 ? 'chat' : 'chats'}`
    }
    return 'All quiet — nothing needs a reply'
  }, [conversationList, conciergeName])

  const archivedCount = useMemo(
    () => conversationList.filter((c) => isArchived(c, nowMs)).length,
    [conversationList, nowMs],
  )

  const filteredList = useMemo(() => {
    const statusOrder: Record<ConversationStatus, number> = { Live: 0, Human: 1, Waiting: 2, Resolved: 3 }
    // The archive is a separate room, not an extra filter: the inbox hides
    // everything older than a day, and the archive shows only those.
    let list = conversationList.filter((c) => isArchived(c, nowMs) === showArchive)
    if (filterTab === 'Active') list = list.filter((c) => c.status === 'Live')
    else if (filterTab === 'Human') list = list.filter((c) => c.status === 'Human')
    else if (filterTab === 'Closed') list = list.filter((c) => c.status === 'Resolved')

    // Status grouping only says anything where statuses mix, so it stays on the
    // All tab; within a group the chosen order decides.
    const groupByStatus = listPrefs.groupByStatus && filterTab === 'All'
    const byPreference = (a: Conversation, b: Conversation) => {
      if (listPrefs.sort === 'name') return a.customerName.localeCompare(b.customerName)
      if (listPrefs.sort === 'oldest') return a.lastActivityMs - b.lastActivityMs
      return b.lastActivityMs - a.lastActivityMs
    }
    list = [...list].sort((a, b) => {
      if (groupByStatus) {
        const byStatus = statusOrder[a.status] - statusOrder[b.status]
        if (byStatus !== 0) return byStatus
      }
      return byPreference(a, b)
    })

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(
        (c) => c.customerName.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q),
      )
    }
    return list
  }, [conversationList, filterTab, searchQuery, showArchive, nowMs, listPrefs.sort, listPrefs.groupByStatus])

  /** Everything in the room being viewed, before the tab and the search cut it
   *  down — the denominator behind "12 of 40" in the settings menu. */
  const roomTotal = useMemo(
    () => conversationList.filter((c) => isArchived(c, nowMs) === showArchive).length,
    [conversationList, showArchive, nowMs],
  )

  const openInViewCount = useMemo(
    () => filteredList.filter((c) => c.status !== 'Resolved').length,
    [filteredList],
  )

  useEffect(() => {
    if (!selectedId) {
      return
    }

    const channel = supabase
      .channel(`messages:${selectedId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selectedId}`,
        },
        (payload) => {
          const inserted = payload.new as DbMessageRow
          if (!inserted?.id) {
            return
          }

          const incoming = mapDbMessageToMessage(inserted)
          setConversationList((prev) =>
            prev.map((conversation) => {
              if (conversation.id !== selectedId) {
                return conversation
              }
              if (conversation.messages.some((message) => message.id === incoming.id)) {
                return conversation
              }
              return {
                ...conversation,
                messages: [...conversation.messages, incoming],
                preview: incoming.text,
                time: formatRelativeTime(inserted.created_at),
              }
            }),
          )
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [selectedId, selectedConversation])

  // ── Live inbox: new conversations appear, names/status/previews stay fresh ──
  // (Requires messages/conversations in the supabase_realtime publication —
  // migration 016.)
  useEffect(() => {
    if (!businessId) return

    const channel = supabase
      .channel(`conversations:${businessId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const row = payload.new as DbConversationRow
          if (typeof row.id !== 'string') return
          setConversationList((prev) =>
            prev.some((c) => c.id === row.id)
              ? prev
              : [mapDbConversationToConversation({ ...row, customers: null, messages: [] }), ...prev],
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const updated = payload.new as {
            id?: string
            customer_name?: string | null
            status?: string | null
            updated_at?: string | null
          }
          if (typeof updated.id !== 'string') return
          const conversationId = updated.id

          setConversationList((prev) =>
            prev.map((c) => {
              if (c.id !== conversationId) return c
              return {
                ...c,
                customerName:
                  typeof updated.customer_name === 'string' && updated.customer_name.trim()
                    ? updated.customer_name.trim()
                    : c.customerName,
                status: updated.status ? normalizeStatus(updated.status) : c.status,
                time: updated.updated_at ? formatRelativeTime(updated.updated_at) : c.time,
              }
            }),
          )

          // The API bumps updated_at on every message, so refresh the preview
          // for conversations the owner is not currently reading.
          void (async () => {
            const { data: msg } = await supabase
              .from('messages')
              .select('content, created_at')
              .eq('conversation_id', conversationId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            if (!msg?.content) return
            setConversationList((prev) =>
              prev.map((c) =>
                c.id === conversationId
                  ? { ...c, preview: msg.content, time: formatRelativeTime(msg.created_at) }
                  : c,
              ),
            )
          })()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [businessId])

  // ── Refresh the transcript when opening a conversation ──────────────────────
  // Messages that arrived while another thread was selected are not in state
  // (the message subscription only covers the selected conversation).
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    void (async () => {
      const { data: rows } = await supabase
        .from('messages')
        .select('id, role, content, created_at')
        .eq('conversation_id', selectedId)
        .order('created_at', { ascending: true })
      if (cancelled || !rows) return
      setConversationList((prev) =>
        prev.map((c) => {
          if (c.id !== selectedId) return c
          if (rows.length <= c.messages.length) return c
          return { ...c, messages: (rows as DbMessageRow[]).map(mapDbMessageToMessage) }
        }),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  // ── Patch phone/email when syncGuestInfo updates the customers record ────
  useEffect(() => {
    if (!businessId) return

    const channel = supabase
      .channel(`customers:${businessId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'customers',
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const updated = payload.new as { id?: string; phone?: string | null; email?: string | null; name?: string | null }
          if (typeof updated.id !== 'string') return

          setConversationList((prev) =>
            prev.map((c) => {
              if (c.customerId !== updated.id) return c
              return {
                ...c,
                phone: updated.phone?.trim() || c.phone,
                email: updated.email?.trim() || c.email,
                customerName: updated.name?.trim() && updated.name.trim().toLowerCase() !== 'website visitor'
                  ? updated.name.trim()
                  : c.customerName,
              }
            }),
          )
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [businessId])

  // Presence tracking — subscribe to each active conversation's presence channel
  const activeConvIdKey = useMemo(
    () => conversationList.filter((c) => c.status !== 'Resolved').map((c) => c.id).sort().join(','),
    [conversationList],
  )

  useEffect(() => {
    const ids = activeConvIdKey.split(',').filter(Boolean)
    if (ids.length === 0) return

    const channels = ids.map((convId) => {
      const ch = supabase.channel(`presence:conv:${convId}`)
      ch.on('presence', { event: 'sync' }, () => {
        const hasGuest = Object.keys(ch.presenceState()).length > 0
        setOnlineConvIds((prev) => {
          const next = new Set(prev)
          if (hasGuest) next.add(convId)
          else next.delete(convId)
          return next
        })
      })
      ch.subscribe()
      return ch
    })

    return () => {
      channels.forEach((ch) => void supabase.removeChannel(ch))
      setOnlineConvIds(new Set())
    }
  }, [activeConvIdKey])

  useEffect(() => {
    if (!selectedConversation) {
      return
    }
    const container = messagesScrollRef.current
    if (!container) {
      return
    }
    container.scrollTop = container.scrollHeight
  }, [selectedConversation])

  const isTakenOver = selectedConversation?.status === 'Human'

  const handleReopen = async (conversationId: string) => {
    // Stamp updated_at ourselves: nothing on the table maintains it, and the
    // stale sweep would otherwise close this chat again on the next load,
    // dropping it straight back into the archive it was just pulled out of.
    const reopenedAt = new Date().toISOString()
    const { error } = await supabase
      .from('conversations')
      .update({ status: 'active', updated_at: reopenedAt })
      .eq('id', conversationId)
    if (!error) {
      setConversationList((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, status: 'Live', lastActivityMs: parseUtc(reopenedAt).getTime() }
            : c,
        ),
      )
      // Reopening from the archive moves the row to the inbox, so follow it
      // there rather than leaving the host looking at an empty archive slot.
      if (showArchive) setShowArchive(false)
      // If on Closed filter the row disappears — clear selection so the right panel empties
      if (selectedId === conversationId && filterTab === 'Closed') {
        setSelectedId('')
      }
    }
  }

  const handleResolve = async (conversationId: string) => {
    const { error } = await supabase.from('conversations').update({ status: 'closed' }).eq('id', conversationId)
    if (!error) {
      setConversationList((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, status: 'Resolved' } : c)),
      )
      // Only clear selection if the current filter will hide the resolved row.
      // In 'All' and 'Closed' views the row stays visible (muted), so keep it selected.
      if (selectedId === conversationId && (filterTab === 'Active' || filterTab === 'Human')) {
        setSelectedId('')
      }
    }
  }

  /** Closes every open chat currently in view — the end-of-shift sweep. Scoped
   *  to what the list shows, so a filter or a search is also the selection. */
  const handleResolveVisible = async () => {
    const ids = filteredList.filter((c) => c.status !== 'Resolved').map((c) => c.id)
    if (ids.length === 0) return
    setBulkResolving(true)
    const { error } = await supabase.from('conversations').update({ status: 'closed' }).in('id', ids)
    setBulkResolving(false)
    if (error) return
    const resolved = new Set(ids)
    setConversationList((prev) =>
      prev.map((c) => (resolved.has(c.id) ? { ...c, status: 'Resolved' } : c)),
    )
    if (selectedId && resolved.has(selectedId) && (filterTab === 'Active' || filterTab === 'Human')) {
      setSelectedId('')
    }
    closeSettings()
  }

  const handleTakeOverToggle = async () => {
    if (!selectedId || !selectedConversation) {
      return
    }
    setTakeoverError('')
    const next = selectedConversation.status !== 'Human'
    const status = next ? 'human' : 'active'
    const changedAt = new Date().toISOString()
    const { error } = await supabase
      .from('conversations')
      .update({ status, updated_at: changedAt })
      .eq('id', selectedId)
    if (error) {
      setTakeoverError(error.message ?? 'Could not switch modes. Please try again.')
      return
    }
    setConversationList((prev) =>
      prev.map((conversation) =>
        conversation.id === selectedId
          ? {
              ...conversation,
              status: next ? 'Human' : 'Live',
              lastActivityMs: parseUtc(changedAt).getTime(),
            }
          : conversation,
      ),
    )
  }

  // Grow the composer with the reply. A textarea does not size to its content
  // on its own, so measure after every change: collapse first, then take the
  // scroll height, capped so a long message never pushes the thread off screen.
  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_H)}px`
  }, [draft])

  const handleSend = async () => {
    if (!selectedConversation || !draft.trim() || isLoading) {
      return
    }

    const messageText = draft.trim()
    const conversationId = selectedConversation.id

    if (isTakenOver) {
      setDraft('')
      setIsLoading(true)
      setSendingConversationId(conversationId)
      try {
        let manualAssistantMessage: Message
        const { data: insertedAssistant, error: assistantInsertError } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: messageText,
          })
          .select('id, role, content, created_at')
          .single()

        if (assistantInsertError || !insertedAssistant) {
          manualAssistantMessage = {
            id: `m-${Date.now()}-manual-ai`,
            sender: 'ai',
            text: messageText,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }
        } else {
          manualAssistantMessage = mapDbMessageToMessage(insertedAssistant as DbMessageRow)
          // Keep updated_at in sync so ordering and the stale auto-close see this reply.
          void supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId)
        }

        setConversationList((prev) =>
          prev.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  messages: [...conversation.messages, manualAssistantMessage],
                  preview: manualAssistantMessage.text,
                  time: 'now',
                }
              : conversation,
          ),
        )
      } finally {
        setIsLoading(false)
        setSendingConversationId(null)
      }
      return
    }

    if (!businessId) {
      return
    }

    const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const customerMessage: Message = {
      id: `pending-guest-${Date.now()}`,
      sender: 'guest',
      text: messageText,
      time: nowLabel,
    }

    const messagesForApi = [...selectedConversation.messages, customerMessage]

    setConversationList((prev) =>
      prev.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              messages: messagesForApi,
              preview: messageText,
              time: 'now',
              status: 'Live',
            }
          : conversation,
      ),
    )
    setDraft('')

    setIsLoading(true)
    setSendingConversationId(conversationId)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          business_id: businessId,
          conversation_id: conversationId,
          from_dashboard: true,
          messages: messagesForApi.map((message) => ({
            role: message.sender === 'ai' ? 'assistant' : 'user',
            content: message.text,
          })),
        }),
      })

      const data = (await response.json()) as {
        message?: string | null
        skipped?: boolean
        reason?: string
      }

      if (data.skipped) {
        return
      }

      const aiText =
        response.ok && typeof data.message === 'string'
          ? data.message
          : 'Sorry, I hit a temporary issue. Please try again in a moment.'

      const aiMessage: Message = {
        id: `pending-ai-${Date.now()}`,
        sender: 'ai',
        text: aiText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setConversationList((prev) =>
        prev.map((conversation) => {
          if (conversation.id !== conversationId) return conversation
          const withoutPendingAi = conversation.messages.filter(
            (m) => !m.id.startsWith('pending-ai-'),
          )
          const last = withoutPendingAi[withoutPendingAi.length - 1]
          if (last?.sender === 'ai' && last.text === aiText) {
            return { ...conversation, preview: aiText, time: 'now' }
          }
          return {
            ...conversation,
            messages: [...withoutPendingAi, aiMessage],
            preview: aiText,
            time: 'now',
          }
        }),
      )
    } catch {
      const fallbackText = 'I could not reach the AI service right now. Please try again.'
      const fallbackMessage: Message = {
        id: `pending-ai-${Date.now()}`,
        sender: 'ai',
        text: fallbackText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      setConversationList((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: [...conversation.messages, fallbackMessage],
                preview: fallbackMessage.text,
                time: 'now',
              }
            : conversation,
        ),
      )
    } finally {
      setIsLoading(false)
      setSendingConversationId(null)
    }
  }

  return (
    <DashboardOceanNav activeNav="Chats" fillViewport>
      {({ isMobile, openNav }) => (
        <div
          style={{
            // Reclaim half of the shell's top padding. This view fills the
            // viewport, so space above the title is height the conversation
            // list never gets back. The height grows by the same amount, or
            // the panels would hang past the bottom and get clipped.
            marginTop: isMobile ? -10 : -18,
            height: isMobile ? 'calc(100% + 10px)' : 'calc(100% + 18px)',
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr)',
            gap: 12,
            overflow: 'hidden',
          }}
        >
          {/* Page header. Every other dashboard page opens with one; chats
              dropped straight into three panels, which is what made it read as
              a different product. */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            {/* No eyebrow above the title here: "Inbox" over "Chats" says the
                same thing twice, and this page fills the viewport, so every row
                of chrome comes straight out of the conversation list. */}
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: t.text, letterSpacing: '-0.03em' }}>
                Chats
              </h1>
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: t.textMuted }}>{roomSummary}</p>
            </div>
            {isMobile && (
              <motion.button
                type="button"
                onClick={openNav}
                aria-label="Open navigation"
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                style={{ width: 38, height: 38, borderRadius: 10, border: `1px solid ${t.border}`, background: t.bgSurface, color: t.text, fontSize: 17, cursor: 'pointer', flexShrink: 0 }}
              >
                ☰
              </motion.button>
            )}
          </div>

          <div
            style={{
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '300px minmax(0, 1fr) 320px',
              gap: 16,
              overflow: 'hidden',
            }}
          >
          <motion.section
            initial={{ opacity: 0, scale: 0.97, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={oceanTransition(reduceMotion, { duration: 0.24 })}
            style={{
              ...panelStyle,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* ── Header ── */}
            <div style={{ position: 'relative', padding: '16px 16px 0', borderBottom: `1px solid ${t.border}` }}>
              {/* The panel title names the room, which is the one thing the
                  list itself cannot show. The count moved to the page header
                  and the accent chip went with it: the segmented control below
                  is deliberately colourless, and a saturated block right above
                  it pulled the eye away from the actual choice. Where the count
                  sat there is now the gear: a bare number spent the corner on
                  something the list already shows, and the menu keeps it in its
                  header anyway. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <h2 style={{ margin: 0, color: t.text, fontSize: 14, fontWeight: 700 }}>
                  {showArchive ? 'Archive' : 'Conversations'}
                </h2>
                <motion.button
                  type="button"
                  onClick={() => (settingsOpen ? closeSettings() : setSettingsOpen(true))}
                  aria-haspopup="dialog"
                  aria-expanded={settingsOpen}
                  aria-label="List settings"
                  title="List settings"
                  whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                  style={{
                    flexShrink: 0,
                    width: 24,
                    height: 24,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 7,
                    border: `1px solid ${settingsOpen ? t.accentSoftBorder : 'transparent'}`,
                    background: settingsOpen ? t.accentSoftBg : 'transparent',
                    color: settingsOpen ? t.accent : t.textSubtle,
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                  }}
                >
                  {/* A gear should turn when you work it. Ninety degrees with a
                      little overshoot reads as a notch being driven, and it
                      unwinds on the way back so the closed state is the rest
                      position rather than wherever the last press left it. */}
                  <motion.span
                    style={{ display: 'flex' }}
                    animate={{ rotate: reduceMotion || !settingsOpen ? 0 : 90 }}
                    transition={oceanTransition(reduceMotion, {
                      type: 'spring',
                      stiffness: 260,
                      damping: 16,
                    })}
                  >
                    <IconGear />
                  </motion.span>
                </motion.button>
              </div>

              {settingsOpen && (
                <motion.div
                  ref={settingsRef}
                  role="dialog"
                  aria-label="List settings"
                  initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={oceanTransition(reduceMotion, { duration: 0.14 })}
                  style={{
                    position: 'absolute',
                    top: 44,
                    right: 16,
                    zIndex: 30,
                    width: 236,
                    padding: 10,
                    borderRadius: 12,
                    border: `1px solid ${t.border}`,
                    background: t.bgApp,
                    boxShadow: t.shadowLg,
                    display: 'grid',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '2px 6px 6px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.textSubtle }}>
                      Sort
                    </span>
                    <span style={{ fontSize: 10, color: t.textSubtle, fontVariantNumeric: 'tabular-nums' }}>
                      {filteredList.length} of {roomTotal}
                    </span>
                  </div>

                  {(Object.keys(SORT_LABELS) as ListSort[]).map((option) => {
                    const active = listPrefs.sort === option
                    return (
                      <button
                        key={option}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => updateListPrefs({ sort: option })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '7px 8px',
                          borderRadius: 8,
                          border: 'none',
                          background: active ? t.accentSoftBg : 'transparent',
                          color: active ? t.text : t.textMuted,
                          fontSize: 12,
                          fontWeight: active ? 600 : 500,
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <span>{SORT_LABELS[option]}</span>
                        {active && <span style={{ color: t.accent, display: 'flex' }}><IconCheck /></span>}
                      </button>
                    )
                  })}

                  <div style={{ height: 1, background: t.border, margin: '6px 2px' }} />

                  <SettingsToggle
                    label="Group by status"
                    hint="Live and human first, resolved last"
                    checked={listPrefs.groupByStatus}
                    disabled={filterTab !== 'All'}
                    disabledHint="Only applies on the All tab"
                    onChange={(value) => updateListPrefs({ groupByStatus: value })}
                  />
                  <SettingsToggle
                    label="Compact rows"
                    hint="Hides the message preview"
                    checked={listPrefs.compact}
                    onChange={(value) => updateListPrefs({ compact: value })}
                  />

                  <div style={{ height: 1, background: t.border, margin: '6px 2px' }} />

                  {/* Scoped to the rows on screen, so a filter or a search is
                      also the selection — and it asks first, because undoing it
                      means reopening every chat by hand. */}
                  <button
                    type="button"
                    disabled={openInViewCount === 0 || bulkResolving}
                    onClick={() => {
                      if (confirmBulkResolve) void handleResolveVisible()
                      else setConfirmBulkResolve(true)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 8px',
                      borderRadius: 8,
                      border: confirmBulkResolve ? `1px solid ${t.warningBorder}` : '1px solid transparent',
                      background: confirmBulkResolve ? t.warningBg : 'transparent',
                      color: openInViewCount === 0 ? t.textSubtle : confirmBulkResolve ? t.warning : t.textMuted,
                      fontSize: 12,
                      fontWeight: confirmBulkResolve ? 600 : 500,
                      textAlign: 'left',
                      cursor: openInViewCount === 0 || bulkResolving ? 'default' : 'pointer',
                      opacity: openInViewCount === 0 ? 0.55 : 1,
                    }}
                  >
                    <IconCheck />
                    <span>
                      {bulkResolving
                        ? 'Resolving…'
                        : confirmBulkResolve
                          ? `Resolve ${openInViewCount} — tap to confirm`
                          : openInViewCount === 0
                            ? 'Nothing open in view'
                            : `Resolve all in view (${openInViewCount})`}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      updateListPrefs(DEFAULT_LIST_PREFS)
                      setConfirmBulkResolve(false)
                    }}
                    style={{
                      justifySelf: 'start',
                      padding: '4px 8px',
                      border: 'none',
                      background: 'transparent',
                      color: t.textSubtle,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Reset to defaults
                  </button>
                </motion.div>
              )}

              {/* Search */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guests or messages…"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bgSurfaceMuted,
                  color: t.text,
                  fontSize: 12,
                  outline: 'none',
                  marginBottom: 10,
                }}
              />

              {/* Filter tabs — one segmented control, not four chips. A single
                  choice should look like a single control, and the moving
                  thumb shows where the selection went instead of one pill
                  lighting up while another goes out. */}
              <div
                role="tablist"
                style={{
                  display: 'flex',
                  gap: 2,
                  padding: 3,
                  marginBottom: 12,
                  borderRadius: 12,
                  background: t.bgSurfaceMuted,
                  border: `1px solid ${t.border}`,
                }}
              >
                {(['All', 'Active', 'Human', 'Closed'] as const).map((tab) => {
                  const active = filterTab === tab
                  return (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setFilterTab(tab)}
                      style={{
                        position: 'relative',
                        flex: 1,
                        padding: '6px 0',
                        borderRadius: 9,
                        border: 'none',
                        background: 'transparent',
                        color: active ? t.text : t.textMuted,
                        fontSize: 11,
                        fontWeight: active ? 700 : 500,
                        cursor: 'pointer',
                        transition: 'color 0.15s',
                      }}
                    >
                      {active && (
                        <motion.span
                          layoutId="chat-filter-thumb"
                          transition={oceanTransition(reduceMotion, {
                            type: 'spring',
                            stiffness: 420,
                            damping: 34,
                          })}
                          style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: 9,
                            background: t.bgSurface,
                            border: `1px solid ${t.border}`,
                            boxShadow: t.shadowSm,
                          }}
                        />
                      )}
                      <span style={{ position: 'relative' }}>{tab}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── List ── */}
            <div style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minHeight: 0, padding: '6px 8px' }}>
              {!inboxLoaded && (
                <div style={{ display: 'grid', gap: 4, padding: '4px 0' }}>
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <div key={idx} style={{ height: 56, borderRadius: 8, background: t.bgSurfaceMuted }} />
                  ))}
                </div>
              )}

              {inboxFetchError && (
                <div style={{ padding: 20, color: t.danger, fontSize: 13 }}>
                  Couldn&apos;t load conversations.
                </div>
              )}

              {inboxLoaded && !inboxFetchError && filteredList.length === 0 && (
                <div style={{ padding: '28px 12px', color: t.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
                  {searchQuery.trim()
                    ? 'Nothing matches that search'
                    : showArchive
                      ? 'Nothing archived yet — chats move here a day after their last message'
                      : conversationList.length === 0
                        ? 'No conversations yet'
                        : 'Inbox is clear — older chats are in the archive'}
                </div>
              )}

              {filteredList.map((conversation, index) => {
                const isSelected = conversation.id === selectedId
                const isClosed = conversation.status === 'Resolved'
                const isHovered = hoveredId === conversation.id
                // In "All" tab, show a divider before the first Resolved row.
                // Without status grouping the resolved rows sit wherever their
                // date puts them, and a "Resolved" rule across the middle of
                // the list would be announcing a section that is not there.
                const showDivider =
                  filterTab === 'All' &&
                  listPrefs.groupByStatus &&
                  isClosed &&
                  index > 0 &&
                  filteredList[index - 1].status !== 'Resolved'

                const rowBadges = (
                  <>
                    {conversation.customerId && returningCustomerIds.has(conversation.customerId) && (
                      <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 600, color: t.accentText, borderRadius: 4, padding: '1px 5px', background: t.accentSoftBg, border: `1px solid ${t.accentSoftBorder}` }}>
                        Returning
                      </span>
                    )}
                    {isClosed ? (
                      <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 600, color: t.textSubtle, borderRadius: 4, padding: '1px 5px', background: t.bgSurfaceMuted }}>
                        Closed
                      </span>
                    ) : conversation.status === 'Human' ? (
                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#f59e0b', borderRadius: 4, padding: '1px 6px', background: 'rgba(245,158,11,0.12)' }}>
                        Human
                      </span>
                    ) : isGuestOnline(conversation.id) ? (
                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#4ade80' }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
                      </span>
                    ) : null}
                  </>
                )

                return (
                  <motion.div
                    key={conversation.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={oceanTransition(reduceMotion, { delay: 0.02 + index * 0.02, duration: 0.14 })}
                    onMouseEnter={() => setHoveredId(conversation.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ position: 'relative', marginBottom: 2 }}
                  >
                    {showDivider && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px 6px', marginBottom: 2 }}>
                        <div style={{ flex: 1, height: 1, background: t.border }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: t.textSubtle, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Resolved</span>
                        <div style={{ flex: 1, height: 1, background: t.border }} />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedId(conversation.id)}
                      style={{
                        width: '100%',
                        height: listPrefs.compact ? 38 : 52,
                        padding: '0 10px',
                        borderRadius: 8,
                        borderLeft: isSelected ? `2px solid ${t.accent}` : '2px solid transparent',
                        border: '1px solid transparent',
                        borderLeftWidth: 2,
                        background: isSelected
                          ? t.accentSoftBg
                          : isHovered
                          ? t.bgSurfaceMuted
                          : 'transparent',
                        color: 'inherit',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        opacity: isClosed ? 0.45 : 1,
                        transition: 'background 0.12s, opacity 0.15s',
                      }}
                    >
                      {/* Avatar */}
                      <div style={{
                        flexShrink: 0,
                        width: listPrefs.compact ? 22 : 30,
                        height: listPrefs.compact ? 22 : 30,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        background: isClosed ? t.bgSurfaceMuted : t.accent,
                        color: isClosed ? t.textSubtle : '#ffffff',
                        fontSize: listPrefs.compact ? 9 : 10,
                        fontWeight: 700,
                      }}>
                        {getInitials(conversation.customerName)}
                      </div>

                      {/* Content. Compact drops the preview line, so the badges
                          ride up beside the name — losing the preview must not
                          also lose "this one is waiting on a human". */}
                      <div style={{ flex: 1, minWidth: 0, paddingRight: isHovered ? 28 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <span style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: isClosed ? t.textMuted : t.text,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {conversation.customerName}
                          </span>
                          {listPrefs.compact && rowBadges}
                          <span style={{ flexShrink: 0, fontSize: 10, color: t.textSubtle }}>{conversation.time}</span>
                        </div>
                        {!listPrefs.compact && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span style={{
                              fontSize: 11,
                              color: isClosed ? t.textSubtle : t.textMuted,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}>
                              {conversation.preview}
                            </span>
                            {rowBadges}
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Resolve button — active rows only */}
                    {isHovered && !isClosed && (
                      <button
                        type="button"
                        title="Mark as resolved"
                        onClick={(e) => { e.stopPropagation(); void handleResolve(conversation.id) }}
                        style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          translate: '0 -50%',
                          width: 22,
                          height: 22,
                          borderRadius: 5,
                          border: `1px solid ${t.border}`,
                          background: t.bgSurface,
                          color: t.textMuted,
                          fontSize: 13,
                          lineHeight: 1,
                          cursor: 'pointer',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        ✓
                      </button>
                    )}

                    {/* Reopen button — closed rows only */}
                    {isHovered && isClosed && (
                      <button
                        type="button"
                        title="Reopen conversation"
                        onClick={(e) => { e.stopPropagation(); void handleReopen(conversation.id) }}
                        style={{
                          position: 'absolute',
                          right: 8,
                          top: '50%',
                          translate: '0 -50%',
                          width: 22,
                          height: 22,
                          borderRadius: 5,
                          border: `1px solid ${t.accentSoftBorder}`,
                          background: t.accentSoftBg,
                          color: t.accent,
                          fontSize: 13,
                          lineHeight: 1,
                          cursor: 'pointer',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        ↩
                      </button>
                    )}
                  </motion.div>
                )
              })}
            </div>

            {/* ── Archive switch ── */}
            <button
              type="button"
              onClick={toggleArchive}
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                width: '100%',
                padding: '11px 14px',
                border: 'none',
                borderTop: `1px solid ${t.border}`,
                background: showArchive ? t.accentSoftBg : 'transparent',
                color: showArchive ? t.accent : t.textMuted,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <IconArchive />
              <span>{showArchive ? 'Back to inbox' : 'Archive'}</span>
              {!showArchive && archivedCount > 0 && (
                <span
                  style={{
                    marginLeft: 'auto',
                    minWidth: 20,
                    padding: '1px 7px',
                    borderRadius: 999,
                    background: t.bgSurfaceMuted,
                    color: t.textMuted,
                    fontSize: 11,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {archivedCount}
                </span>
              )}
            </button>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={oceanTransition(reduceMotion, { duration: 0.24, delay: 0.04 })}
            style={{
              ...panelStyle,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {selectedConversation ? (
              <>
                <header
                  style={{
                    padding: '16px 22px',
                    borderBottom: `1px solid ${t.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  {/* The widest panel had the thinnest header: a name and a
                      count. An avatar anchors it, and the second line answers
                      what the name alone could not — who is on it and when the
                      guest last wrote. */}
                  <div
                    style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      display: 'grid', placeItems: 'center',
                      background: selectedConversation.status === 'Resolved' ? t.bgSurfaceMuted : t.accent,
                      color: selectedConversation.status === 'Resolved' ? t.textSubtle : 'var(--t-on-accent)',
                      fontSize: 12, fontWeight: 700,
                    }}
                  >
                    {getInitials(selectedConversation.customerName)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ color: t.text, fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedConversation.customerName}
                      </span>
                      {isGuestOnline(selectedConversation.id) && (
                        <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 0 3px rgba(74,222,128,0.2)' }} />
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 11.5, color: t.textMuted, minWidth: 0 }}>
                      <span style={{ color: STATUS_COLOR[selectedConversation.status], fontWeight: 600 }}>
                        {selectedConversation.status}
                      </span>
                      <span aria-hidden>·</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedConversation.messages.length} messages · {selectedConversation.time}
                      </span>
                    </div>
                  </div>
                </header>

                <div
                  ref={messagesScrollRef}
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    padding: '20px 22px',
                    display: 'grid',
                    alignContent: 'start',
                    gap: 16,
                  }}
                >
                  {selectedConversation.messages.map((message) => {
                    const isAi = message.sender === 'ai'

                    return (
                      <div
                        key={message.id}
                        style={{
                          display: 'flex',
                          justifyContent: isAi ? 'flex-start' : 'flex-end',
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '72%',
                            borderRadius: 16,
                            ...(isAi ? { borderTopLeftRadius: 4 } : { borderTopRightRadius: 4 }),
                            padding: '12px 16px',
                            background: isAi ? t.bgSurfaceMuted : t.accent,
                            border: isAi ? `1px solid ${t.border}` : `1px solid ${t.accent}`,
                            color: isAi ? t.text : '#ffffff',
                          }}
                        >
                          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                            {message.text}
                          </p>
                          <div style={{ marginTop: 6, fontSize: 10, color: isAi ? t.textSubtle : 'rgba(255,255,255,0.55)', textAlign: isAi ? 'left' : 'right' }}>
                            {isAi ? conciergeName : 'Guest'} · {message.time}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {isLoading && sendingConversationId === selectedConversation.id ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div
                        style={{
                          borderRadius: 14,
                          padding: '10px 14px',
                          background: t.bgSurfaceMuted,
                          border: `1px solid ${t.border}`,
                          color: t.textMuted,
                          fontSize: 14,
                        }}
                      >
                        {conciergeName} is typing…
                      </div>
                    </div>
                  ) : null}
                </div>

                <footer
                  style={{
                    padding: '12px 16px',
                    borderTop: `1px solid ${t.border}`,
                  }}
                >
                  {/* Who is answering, as a pill rather than a loose line —
                      it sits above the composer as a label for it. */}
                  <div
                    style={{
                      marginBottom: 8,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '5px 11px',
                      borderRadius: 999,
                      background: isTakenOver ? t.warningBg : t.bgSurfaceMuted,
                      border: `1px solid ${isTakenOver ? t.warningBorder : t.border}`,
                      color: isTakenOver ? t.warning : t.textMuted,
                      fontSize: 11.5,
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ color: isTakenOver ? t.warning : t.accent, display: 'grid', placeItems: 'center' }}>
                      <IconSparkle />
                    </span>
                    {isTakenOver
                      ? 'You are responding manually'
                      : `${conciergeName} is handling this chat`}
                  </div>
                  {takeoverError ? (
                    <div
                      role="alert"
                      style={{
                        marginBottom: 8,
                        borderRadius: 8,
                        border: `1px solid ${t.dangerBorder}`,
                        background: t.dangerBg,
                        color: t.danger,
                        fontSize: 12,
                        padding: '8px 10px',
                      }}
                    >
                      {takeoverError}
                    </div>
                  ) : null}

                  {/* Quick replies, only while a human is on the chat: when
                      the AI is answering, the host is not typing and these
                      would be noise. They fill the field instead of sending,
                      so the reply is still read before it goes out. */}
                  {isTakenOver && !draft.trim() && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: t.accent, fontSize: 11, fontWeight: 600 }}>
                        <IconBolt />
                        Suggested
                      </span>
                      {SUGGESTED_REPLIES.map((reply) => (
                        <button
                          key={reply}
                          type="button"
                          onClick={() => {
                            setDraft(reply)
                            composerRef.current?.focus()
                          }}
                          style={{
                            padding: '5px 11px',
                            borderRadius: 999,
                            border: `1px solid ${t.border}`,
                            background: t.bgSurfaceMuted,
                            color: t.textMuted,
                            fontSize: 11.5,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'color 0.15s, border-color 0.15s',
                          }}
                        >
                          {reply}
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea
                      ref={composerRef}
                      rows={1}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      disabled={!isTakenOver || isLoading}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          void handleSend()
                        }
                      }}
                      placeholder={
                        isTakenOver
                          ? 'Write a reply…  (Enter to send, Shift+Enter for a new line)'
                          : 'Take over from the sidebar to reply'
                      }
                      style={{
                        flex: 1,
                        minWidth: 0,
                        borderRadius: 10,
                        border: `1px solid ${t.border}`,
                        background: isTakenOver ? t.bgSurface : t.bgSurfaceMuted,
                        padding: '11px 14px',
                        fontSize: 14,
                        lineHeight: 1.45,
                        color: isTakenOver ? t.text : t.textMuted,
                        outline: 'none',
                        fontFamily: 'inherit',
                        // Height is set by the effect above; the cap keeps a
                        // long reply from pushing the thread off screen.
                        resize: 'none',
                        maxHeight: COMPOSER_MAX_H,
                        overflowY: 'auto',
                      }}
                    />
                    <motion.button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={!isTakenOver || isLoading || !draft.trim()}
                      whileHover={
                        !isTakenOver || isLoading || !draft.trim() || reduceMotion ? undefined : { scale: 1.02 }
                      }
                      whileTap={
                        !isTakenOver || isLoading || !draft.trim() || reduceMotion ? undefined : { scale: 0.98 }
                      }
                      style={{
                        border: 'none',
                        borderRadius: 10,
                        background:
                          !isTakenOver || isLoading || !draft.trim()
                            ? t.bgSurfaceMuted
                            : t.accent,
                        // Same ink token the panel's filled buttons use: white
                        // on the light cyan accent sat under 3:1.
                        color:
                          !isTakenOver || isLoading || !draft.trim()
                            ? t.textSubtle
                            : 'var(--t-on-accent)',
                        fontWeight: 700,
                        fontSize: 13,
                        padding: '0 16px',
                        minHeight: 42,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        cursor:
                          !isTakenOver || isLoading || !draft.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isLoading ? '…' : <><IconSend />Send</>}
                    </motion.button>
                  </div>
                </footer>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'grid',
                  placeItems: 'center',
                  padding: 24,
                }}
              >
                <div style={{ textAlign: 'center', maxWidth: 320 }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      margin: '0 auto 14px',
                      borderRadius: 14,
                      background: t.accentSoftBg,
                      border: `1px solid ${t.accentSoftBorder}`,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 22,
                    }}
                    aria-hidden
                  >
                    💬
                  </div>
                  <div style={{ color: t.text, fontSize: 16, fontWeight: 700 }}>
                    {conversationList.length === 0
                      ? 'Nothing here yet'
                      : 'Select a conversation'}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      color: t.textMuted,
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {conversationList.length === 0
                      ? 'Once a guest reaches out through your widget, the conversation will appear here for review or take-over.'
                      : 'Pick a thread from the inbox to read the transcript and jump in if needed.'}
                  </div>
                </div>
              </div>
            )}
          </motion.section>

          {!isMobile ? (
            <motion.aside
              initial={{ opacity: 0, scale: 0.97, x: 10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={oceanTransition(reduceMotion, { duration: 0.24, delay: 0.08 })}
              style={{
                ...panelStyle,
                height: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {selectedConversation ? (
                <div
                  style={{
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    minHeight: 0,
                    flex: 1,
                  }}
                >
                  {/* Guest card */}
                  <div style={{ textAlign: 'center', padding: '20px 16px 16px' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%', margin: '0 auto 12px',
                      display: 'grid', placeItems: 'center',
                      background: selectedConversation.status === 'Resolved' ? t.bgSurfaceMuted : t.accent,
                      color: selectedConversation.status === 'Resolved' ? t.textSubtle : '#ffffff',
                      fontSize: 17, fontWeight: 700,
                      position: 'relative',
                    }}>
                      {getInitials(selectedConversation.customerName)}
                      <span style={{
                        position: 'absolute', bottom: 1, right: 1,
                        width: 12, height: 12, borderRadius: '50%',
                        border: `2px solid ${t.bgApp}`,
                        background: isGuestOnline(selectedConversation.id) ? '#4ade80' : t.borderStrong,
                      }} />
                    </div>
                    <div style={{ color: t.text, fontSize: 16, fontWeight: 700 }}>
                      {selectedConversation.customerName}
                    </div>
                    <div style={{ marginTop: 4, color: isGuestOnline(selectedConversation.id) ? '#4ade80' : t.textMuted, fontSize: 12, fontWeight: 500 }}>
                      {isGuestOnline(selectedConversation.id) ? 'Online now' : 'Offline'}
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ color: t.textMuted, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, padding: '0 2px' }}>
                      Actions
                    </div>
                    {/* One solid button carries the primary action; everything
                        else is a quiet outline. Three equally tinted buttons
                        gave the panel no focus — nothing looked like the thing
                        to press. */}
                    <motion.button
                      type="button"
                      onClick={() => void handleTakeOverToggle()}
                      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                      style={{
                        width: '100%', padding: '11px 14px', borderRadius: 10,
                        border: '1px solid transparent',
                        background: isTakenOver ? t.warning : t.accent,
                        // Ink is a token, not a constant: the amber is dark in
                        // the light theme and bright in the dark one, so one
                        // fixed colour cannot stay legible on both.
                        color: isTakenOver ? 'var(--t-on-warning)' : 'var(--t-on-accent)',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      <IconTakeOver />
                      {isTakenOver ? 'Return to AI' : 'Take over chat'}
                    </motion.button>
                    {selectedConversation.status !== 'Resolved' ? (
                      <motion.button
                        type="button"
                        onClick={() => void handleResolve(selectedConversation.id)}
                        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                        style={{
                          width: '100%', padding: '11px 14px', borderRadius: 10,
                          border: `1px solid ${t.border}`,
                          background: t.bgSurfaceMuted,
                          color: t.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                      >
                        <IconCheck />
                        Mark as resolved
                      </motion.button>
                    ) : (
                      <motion.button
                        type="button"
                        onClick={() => void handleReopen(selectedConversation.id)}
                        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                        style={{
                          width: '100%', padding: '11px 14px', borderRadius: 10,
                          border: `1px solid ${t.border}`,
                          background: t.bgSurfaceMuted,
                          color: t.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                      >
                        <IconReopen />
                        Reopen conversation
                      </motion.button>
                    )}
                  </div>

                  {/* Contact */}
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ color: t.textMuted, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, padding: '0 2px' }}>
                      Contact
                    </div>
                    {/* Label above value, not beside it: an email had to be
                        truncated to fit a side-by-side row, and a phone number
                        the host is about to dial is the wrong thing to hide. */}
                    <div style={{ display: 'grid', gap: 6 }}>
                      {([
                        {
                          key: 'phone',
                          label: 'Phone',
                          value: selectedConversation.phone,
                          href: selectedConversation.phone ? `tel:${selectedConversation.phone}` : null,
                          icon: <IconPhone />,
                        },
                        {
                          key: 'email',
                          label: 'Email',
                          value: selectedConversation.email,
                          href: selectedConversation.email ? `mailto:${selectedConversation.email}` : null,
                          icon: <IconMail />,
                        },
                      ] as const).map((row) => {
                        const body = (
                          <>
                            <span
                              style={{
                                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                                display: 'grid', placeItems: 'center',
                                background: row.value ? t.accentSoftBg : t.bgSurfaceMuted,
                                color: row.value ? t.accent : t.textSubtle,
                              }}
                            >
                              {row.icon}
                            </span>
                            <span style={{ minWidth: 0, display: 'grid', gap: 1 }}>
                              <span style={{ color: t.textMuted, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
                                {row.label}
                              </span>
                              <span
                                style={{
                                  color: row.value ? t.text : t.textSubtle,
                                  fontSize: 13,
                                  fontWeight: row.value ? 600 : 400,
                                  fontStyle: row.value ? 'normal' : 'italic',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}
                              >
                                {row.value ?? 'Not provided'}
                              </span>
                            </span>
                          </>
                        )
                        const shared: CSSProperties = {
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 10px', borderRadius: 12,
                          background: t.bgSurfaceMuted, border: `1px solid ${t.border}`,
                          textDecoration: 'none', minWidth: 0,
                        }
                        return row.href ? (
                          <a key={row.key} href={row.href} style={shared} title={row.value ?? undefined}>
                            {body}
                          </a>
                        ) : (
                          <div key={row.key} style={shared}>{body}</div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ color: t.textMuted, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, padding: '0 2px' }}>
                      Info
                    </div>
                    <div style={{
                      borderRadius: 12,
                      background: t.bgSurfaceMuted, border: `1px solid ${t.border}`,
                      overflow: 'hidden',
                    }}>
                      {[
                        { label: 'Status', value: selectedConversation.status, color: STATUS_COLOR[selectedConversation.status] },
                        { label: 'Messages', value: String(selectedConversation.messages.length), color: t.text },
                        { label: 'Last activity', value: selectedConversation.time, color: t.text },
                        { label: 'Handled by', value: isTakenOver ? 'Human' : conciergeName, color: t.text },
                      ].map((item, i) => (
                        <div
                          key={item.label}
                          style={{
                            display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center',
                            padding: '10px 12px',
                            // Hairlines between rows keep the eye on one line
                            // while it travels from label to value.
                            borderTop: i === 0 ? 'none' : `1px solid ${t.border}`,
                          }}
                        >
                          <span style={{ color: t.textMuted, fontSize: 12 }}>{item.label}</span>
                          <span style={{ color: item.color, fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: 'grid',
                    placeItems: 'center',
                    color: t.textMuted,
                    fontSize: 14,
                    padding: 24,
                    textAlign: 'center',
                  }}
                >
                  Select a conversation to see details.
                </div>
              )}
            </motion.aside>
          ) : null}
          </div>
        </div>
      )}
    </DashboardOceanNav>
  )
}
