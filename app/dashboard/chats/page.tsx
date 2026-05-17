'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
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
    status: normalizeStatus(row.status),
    messages: ordered.map(mapDbMessageToMessage),
  }
}


function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export default function ChatsInboxPage() {
  const [conversationList, setConversationList] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sendingConversationId, setSendingConversationId] = useState<string | null>(null)
  const [inboxLoaded, setInboxLoaded] = useState(false)
  const [inboxFetchError, setInboxFetchError] = useState(false)
  const [conciergeName, setConciergeName] = useState('AI Concierge')
  const [takeoverError, setTakeoverError] = useState('')
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<'All' | 'Active' | 'Human' | 'Closed'>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [onlineConvIds, setOnlineConvIds] = useState<Set<string>>(new Set())
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useReducedMotion()

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

      const { data: business } = await supabase
        .from('businesses')
        .select('id, agent_name')
        .eq('user_id', user.id)
        .maybeSingle()

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

      console.log('[chats] business_id:', business.id, '| conversations returned:', data?.length ?? 0, data)

      if (!data?.length) {
        setConversationList([])
        setSelectedId('')
        return
      }

      // Auto-close conversations inactive for more than 15 minutes
      const STALE_MS = 15 * 60 * 1000
      const now = Date.now()
      const staleIds: string[] = []
      for (const row of data) {
        const status = ((row as DbConversationRow).status ?? '').toLowerCase()
        const updatedAt = (row as DbConversationRow).updated_at
          ? new Date((row as DbConversationRow).updated_at!).getTime()
          : 0
        if ((status === 'active' || status === '') && updatedAt > 0 && now - updatedAt > STALE_MS) {
          staleIds.push((row as DbConversationRow).id)
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
      setSelectedId(mapped[0].id)
    }

    void loadConversations()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedConversation = useMemo(() => {
    if (!selectedId) {
      return null
    }
    return conversationList.find((conversation) => conversation.id === selectedId) ?? null
  }, [conversationList, selectedId])

  const filteredList = useMemo(() => {
    const statusOrder: Record<ConversationStatus, number> = { Live: 0, Human: 1, Waiting: 2, Resolved: 3 }
    let list = conversationList
    if (filterTab === 'Active') list = list.filter((c) => c.status === 'Live')
    else if (filterTab === 'Human') list = list.filter((c) => c.status === 'Human')
    else if (filterTab === 'Closed') list = list.filter((c) => c.status === 'Resolved')
    else {
      // "All" — sort active/human first, resolved last
      list = [...list].sort((a, b) => statusOrder[a.status] - statusOrder[b.status])
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(
        (c) => c.customerName.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q),
      )
    }
    return list
  }, [conversationList, filterTab, searchQuery])

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

  // ── Patch customer_name in the inbox list when syncGuestInfo writes back ────
  useEffect(() => {
    if (!businessId) return

    const channel = supabase
      .channel(`conversations:${businessId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const updated = payload.new as { id?: string; customer_name?: string | null; status?: string | null }
          if (typeof updated.id !== 'string') return

          setConversationList((prev) =>
            prev.map((c) => {
              if (c.id !== updated.id) return c
              return {
                ...c,
                customerName:
                  typeof updated.customer_name === 'string' && updated.customer_name.trim()
                    ? updated.customer_name.trim()
                    : c.customerName,
                status: updated.status ? normalizeStatus(updated.status) : c.status,
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
    const { error } = await supabase.from('conversations').update({ status: 'active' }).eq('id', conversationId)
    if (!error) {
      setConversationList((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, status: 'Live' } : c)),
      )
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

  const handleTakeOverToggle = async () => {
    if (!selectedId || !selectedConversation) {
      return
    }
    setTakeoverError('')
    const next = selectedConversation.status !== 'Human'
    const status = next ? 'human' : 'active'
    const { error } = await supabase.from('conversations').update({ status }).eq('id', selectedId)
    if (error) {
      setTakeoverError(error.message ?? 'Could not switch modes. Please try again.')
      return
    }
    setConversationList((prev) =>
      prev.map((conversation) =>
        conversation.id === selectedId ? { ...conversation, status: next ? 'Human' : 'Live' } : conversation,
      ),
    )
  }

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
            height: '100%',
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
            <div style={{ padding: '16px 16px 0', borderBottom: `1px solid ${t.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h1 style={{ margin: 0, color: t.text, fontSize: 15, fontWeight: 700 }}>Conversations</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {conversationList.filter((c) => c.status === 'Live' || c.status === 'Human').length > 0 && (
                    <span style={{ borderRadius: 6, padding: '2px 8px', background: '#38bdf8', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                      {conversationList.filter((c) => c.status === 'Live' || c.status === 'Human').length} active
                    </span>
                  )}
                  {isMobile && (
                    <motion.button
                      type="button"
                      onClick={openNav}
                      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                      style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bgSurface, color: t.text, fontSize: 16, cursor: 'pointer' }}
                    >
                      ☰
                    </motion.button>
                  )}
                </div>
              </div>

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

              {/* Filter tabs — pill style */}
              <div style={{ display: 'flex', gap: 4, paddingBottom: 12 }}>
                {(['All', 'Active', 'Human', 'Closed'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilterTab(tab)}
                    style={{
                      flex: 1,
                      padding: '5px 0',
                      borderRadius: 999,
                      border: 'none',
                      background: filterTab === tab ? '#38bdf8' : 'rgba(255,255,255,0.06)',
                      color: filterTab === tab ? '#0d1f3c' : 'rgba(255,255,255,0.45)',
                      fontSize: 11,
                      fontWeight: filterTab === tab ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {tab}
                  </button>
                ))}
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
                  {conversationList.length === 0
                    ? 'No conversations yet.'
                    : 'No matches.'}
                </div>
              )}

              {filteredList.map((conversation, index) => {
                const isSelected = conversation.id === selectedId
                const isClosed = conversation.status === 'Resolved'
                const isHovered = hoveredId === conversation.id
                // In "All" tab, show a divider before the first Resolved row
                const showDivider =
                  filterTab === 'All' &&
                  isClosed &&
                  index > 0 &&
                  filteredList[index - 1].status !== 'Resolved'

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
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Resolved</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedId(conversation.id)}
                      style={{
                        width: '100%',
                        height: 52,
                        padding: '0 10px',
                        borderRadius: 8,
                        borderLeft: isSelected ? '2px solid #38bdf8' : '2px solid transparent',
                        border: '1px solid transparent',
                        borderLeftWidth: 2,
                        background: isSelected
                          ? 'rgba(56,189,248,0.1)'
                          : isHovered
                          ? 'rgba(255,255,255,0.04)'
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
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        background: isClosed ? 'rgba(255,255,255,0.06)' : '#38bdf8',
                        color: isClosed ? 'rgba(255,255,255,0.3)' : '#0d1f3c',
                        fontSize: 10,
                        fontWeight: 700,
                      }}>
                        {getInitials(conversation.customerName)}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0, paddingRight: isHovered ? 28 : 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <span style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: isClosed ? 'rgba(255,255,255,0.5)' : '#ffffff',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {conversation.customerName}
                          </span>
                          <span style={{ flexShrink: 0, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{conversation.time}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{
                            fontSize: 11,
                            color: isClosed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.5)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}>
                            {conversation.preview}
                          </span>
                          {isClosed ? (
                            <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.2)', borderRadius: 4, padding: '1px 5px', background: 'rgba(255,255,255,0.04)' }}>
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
                        </div>
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
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: 'rgba(255,255,255,0.07)',
                          color: 'rgba(255,255,255,0.5)',
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
                          border: '1px solid rgba(56,189,248,0.25)',
                          background: 'rgba(56,189,248,0.08)',
                          color: 'rgba(56,189,248,0.7)',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <span style={{ color: t.text, fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedConversation.customerName}
                    </span>
                    {isGuestOnline(selectedConversation.id) && (
                      <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 0 3px rgba(74,222,128,0.2)' }} />
                    )}
                  </div>
                  <span style={{ flexShrink: 0, color: t.textMuted, fontSize: 12 }}>
                    {selectedConversation.messages.length} messages
                  </span>
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
                          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
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
                  <div
                    style={{
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: isTakenOver ? t.warning : t.textMuted,
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: isTakenOver ? t.warning : t.success, flexShrink: 0 }} />
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

                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
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
                          ? 'Write a message…'
                          : 'Take over from the sidebar to reply'
                      }
                      style={{
                        flex: 1,
                        minWidth: 0,
                        borderRadius: 10,
                        border: `1px solid ${t.border}`,
                        background: isTakenOver ? t.bgSurface : t.bgSurfaceMuted,
                        padding: '10px 14px',
                        fontSize: 14,
                        color: isTakenOver ? t.text : t.textMuted,
                        outline: 'none',
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
                        color:
                          !isTakenOver || isLoading || !draft.trim() ? t.textSubtle : '#ffffff',
                        fontWeight: 600,
                        fontSize: 13,
                        padding: '0 18px',
                        minHeight: 42,
                        cursor:
                          !isTakenOver || isLoading || !draft.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isLoading ? '…' : 'Send'}
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
                      ? 'No conversations yet'
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
                      background: selectedConversation.status === 'Resolved' ? 'rgba(255,255,255,0.08)' : '#38bdf8',
                      color: selectedConversation.status === 'Resolved' ? 'rgba(255,255,255,0.35)' : '#0d1f3c',
                      fontSize: 17, fontWeight: 700,
                      position: 'relative',
                    }}>
                      {getInitials(selectedConversation.customerName)}
                      <span style={{
                        position: 'absolute', bottom: 1, right: 1,
                        width: 12, height: 12, borderRadius: '50%',
                        border: '2px solid #0e1a2e',
                        background: isGuestOnline(selectedConversation.id) ? '#4ade80' : 'rgba(255,255,255,0.2)',
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
                    <motion.button
                      type="button"
                      onClick={() => void handleTakeOverToggle()}
                      whileHover={reduceMotion ? undefined : { scale: 1.02, y: -2 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                      style={{
                        width: '100%', padding: '11px 14px', borderRadius: 10,
                        border: 'none',
                        background: isTakenOver
                          ? 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(245,158,11,0.08) 100%)'
                          : 'linear-gradient(135deg, rgba(56,189,248,0.2) 0%, rgba(96,184,255,0.08) 100%)',
                        color: isTakenOver ? t.warning : '#38bdf8',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        boxShadow: isTakenOver
                          ? '0 2px 12px rgba(245,158,11,0.15), inset 0 1px 0 rgba(255,255,255,0.06)'
                          : '0 2px 12px rgba(56,189,248,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
                      }}
                    >
                      {isTakenOver ? 'Return to AI' : 'Take Over Chat'}
                    </motion.button>
                    {selectedConversation.status !== 'Resolved' ? (
                      <motion.button
                        type="button"
                        onClick={() => void handleResolve(selectedConversation.id)}
                        whileHover={reduceMotion ? undefined : { scale: 1.02, y: -2 }}
                        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        style={{
                          width: '100%', padding: '11px 14px', borderRadius: 10,
                          border: 'none',
                          background: 'linear-gradient(135deg, rgba(74,222,128,0.15) 0%, rgba(74,222,128,0.05) 100%)',
                          color: '#4ade80', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          boxShadow: '0 2px 12px rgba(74,222,128,0.1), inset 0 1px 0 rgba(255,255,255,0.06)',
                        }}
                      >
                        Mark as Resolved
                      </motion.button>
                    ) : (
                      <motion.button
                        type="button"
                        onClick={() => void handleReopen(selectedConversation.id)}
                        whileHover={reduceMotion ? undefined : { scale: 1.02, y: -2 }}
                        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                        style={{
                          width: '100%', padding: '11px 14px', borderRadius: 10,
                          border: 'none',
                          background: 'linear-gradient(135deg, rgba(56,189,248,0.2) 0%, rgba(96,184,255,0.08) 100%)',
                          color: '#38bdf8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          boxShadow: '0 2px 12px rgba(56,189,248,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
                        }}
                      >
                        Reopen Conversation
                      </motion.button>
                    )}
                  </div>

                  {/* Contact */}
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ color: t.textMuted, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, padding: '0 2px' }}>
                      Contact
                    </div>
                    <div style={{
                      borderRadius: 12, padding: 14,
                      background: t.bgSurfaceMuted, border: `1px solid ${t.border}`,
                      display: 'grid', gap: 10,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <span style={{ color: t.textMuted, fontSize: 12 }}>Phone</span>
                        {selectedConversation.phone ? (
                          <a href={`tel:${selectedConversation.phone}`} style={{ color: '#38bdf8', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                            {selectedConversation.phone}
                          </a>
                        ) : (
                          <span style={{ color: t.textSubtle, fontSize: 12, fontStyle: 'italic' }}>Not provided</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <span style={{ color: t.textMuted, fontSize: 12 }}>Email</span>
                        {selectedConversation.email ? (
                          <a href={`mailto:${selectedConversation.email}`} style={{ color: '#38bdf8', fontSize: 12, fontWeight: 600, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                            {selectedConversation.email}
                          </a>
                        ) : (
                          <span style={{ color: t.textSubtle, fontSize: 12, fontStyle: 'italic' }}>Not provided</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div style={{
                    borderRadius: 12, padding: 14,
                    background: t.bgSurfaceMuted, border: `1px solid ${t.border}`,
                    display: 'grid', gap: 10,
                  }}>
                    <div style={{ color: t.textMuted, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }}>
                      Info
                    </div>
                    {[
                      { label: 'Status', value: selectedConversation.status },
                      { label: 'Messages', value: String(selectedConversation.messages.length) },
                      { label: 'Last activity', value: selectedConversation.time },
                      { label: 'Handled by', value: isTakenOver ? 'Human' : conciergeName },
                    ].map((item) => (
                      <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ color: t.textMuted, fontSize: 12 }}>{item.label}</span>
                        <span style={{ color: t.text, fontSize: 12, fontWeight: 600 }}>{item.value}</span>
                      </div>
                    ))}
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
      )}
    </DashboardOceanNav>
  )
}
