'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'

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
  customerName: string
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

type DbConversationRow = {
  id: string
  customer_name: string | null
  status: string | null
  updated_at: string | null
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
  if (key === 'resolved') {
    return 'Resolved'
  }
  if (key === 'active' || key === 'live' || key === '') {
    return 'Live'
  }
  return 'Live'
}

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime(iso: string | null | undefined) {
  if (!iso) {
    return 'now'
  }
  const then = new Date(iso).getTime()
  const sec = Math.floor((Date.now() - then) / 1000)
  if (sec < 45) {
    return 'now'
  }
  if (sec < 3600) {
    return `${Math.floor(sec / 60)}m`
  }
  if (sec < 86400) {
    return `${Math.floor(sec / 3600)}h`
  }
  if (sec < 604800) {
    return `${Math.floor(sec / 86400)}d`
  }
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
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
  const lastActivity = row.updated_at ?? last?.created_at
  return {
    id: row.id,
    customerName: row.customer_name?.trim() || 'Guest',
    preview,
    time: formatRelativeTime(lastActivity),
    status: normalizeStatus(row.status),
    messages: ordered.map(mapDbMessageToMessage),
  }
}

function getStatusStyle(status: ConversationStatus) {
  if (status === 'Live') {
    return { background: t.accentSoftBg, color: t.accentText, border: t.accentSoftBorder }
  }
  if (status === 'Human') {
    return { background: t.warningBg, color: t.warning, border: t.warningBorder }
  }
  if (status === 'Waiting') {
    return { background: '#faf5ff', color: '#7e22ce', border: '#e9d5ff' }
  }
  return { background: t.bgSurfaceMuted, color: t.textMuted, border: t.border }
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
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useReducedMotion()

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
          customer_name,
          status,
          updated_at,
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
                  status: 'Live',
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

    let customerMessage: Message
    const { data: insertedUser, error: userInsertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content: messageText,
      })
      .select('id, role, content, created_at')
      .single()

    if (userInsertError || !insertedUser) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      customerMessage = {
        id: `m-${Date.now()}-guest`,
        sender: 'guest',
        text: messageText,
        time: now,
      }
    } else {
      customerMessage = mapDbMessageToMessage(insertedUser as DbMessageRow)
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
          messages: messagesForApi.map((message) => ({
            role: message.sender === 'ai' ? 'assistant' : 'user',
            content: message.text,
          })),
        }),
      })

      const data = await response.json()
      const aiText =
        response.ok && typeof data.message === 'string'
          ? data.message
          : 'Sorry, I hit a temporary issue. Please try again in a moment.'

      let aiMessage: Message
      const { data: insertedAssistant, error: assistantInsertError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: aiText,
        })
        .select('id, role, content, created_at')
        .single()

      if (assistantInsertError || !insertedAssistant) {
        aiMessage = {
          id: `m-${Date.now()}-ai`,
          sender: 'ai',
          text: aiText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
      } else {
        aiMessage = mapDbMessageToMessage(insertedAssistant as DbMessageRow)
      }

      setConversationList((prev) =>
        prev.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: [...conversation.messages, aiMessage],
                preview: aiText,
                time: 'now',
              }
            : conversation,
        ),
      )
    } catch {
      const fallbackText = 'I could not reach the AI service right now. Please try again.'
      let fallbackMessage: Message
      const { data: insertedAssistant, error: assistantInsertError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: fallbackText,
        })
        .select('id, role, content, created_at')
        .single()

      if (assistantInsertError || !insertedAssistant) {
        fallbackMessage = {
          id: `m-${Date.now()}-ai-fallback`,
          sender: 'ai',
          text: fallbackText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
      } else {
        fallbackMessage = mapDbMessageToMessage(insertedAssistant as DbMessageRow)
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

  const badge = selectedConversation ? getStatusStyle(selectedConversation.status) : getStatusStyle('Live')

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
            <div
              style={{
                padding: '20px 20px 16px',
                borderBottom: `1px solid ${t.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div>
                <h1 style={{ margin: 0, color: t.text, fontSize: 17, fontWeight: 700 }}>Guest Conversations</h1>
                <p style={{ margin: '6px 0 0', color: t.textMuted, fontSize: 13 }}>
                  {conversationList.length} {conversationList.length === 1 ? 'thread' : 'threads'}
                </p>
              </div>
              {isMobile ? (
                <motion.button
                  type="button"
                  onClick={openNav}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    background: t.bgSurface,
                    color: t.text,
                    fontSize: 18,
                    cursor: 'pointer',
                  }}
                >
                  ☰
                </motion.button>
              ) : conversationList.length > 0 ? (
                <span
                  style={{
                    borderRadius: 999,
                    padding: '5px 10px',
                    background: t.accentSoftBg,
                    border: `1px solid ${t.accentSoftBorder}`,
                    color: t.accentText,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {conversationList.filter((c) => c.status === 'Live' || c.status === 'Human').length} active
                </span>
              ) : null}
            </div>

            <div
              style={{
                padding: 10,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                flex: 1,
                minHeight: 0,
              }}
            >
              {!inboxLoaded ? (
                <div style={{ display: 'grid', gap: 8, padding: 6 }}>
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={idx}
                      style={{
                        height: 64,
                        borderRadius: 12,
                        background: t.bgSurfaceMuted,
                        border: `1px solid ${t.borderSoft}`,
                      }}
                    />
                  ))}
                </div>
              ) : null}

              {inboxFetchError ? (
                <div style={{ padding: 20, color: t.danger, fontSize: 14, lineHeight: 1.5 }}>
                  We couldn&apos;t load the inbox right now.
                </div>
              ) : null}

              {inboxLoaded && !inboxFetchError && conversationList.length === 0 ? (
                <div
                  style={{
                    padding: '32px 20px',
                    color: t.textMuted,
                    fontSize: 14,
                    lineHeight: 1.6,
                    textAlign: 'center',
                  }}
                >
                  No conversations yet.
                  <div style={{ marginTop: 6, color: t.textSubtle, fontSize: 12 }}>
                    Guest chats will appear here as soon as your AI Concierge greets them.
                  </div>
                </div>
              ) : null}

              {conversationList.map((conversation, index) => {
                const isSelected = conversation.id === selectedId
                const statusStyle = getStatusStyle(conversation.status)

                return (
                  <motion.button
                    key={conversation.id}
                    type="button"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={oceanTransition(reduceMotion, { delay: 0.04 + index * 0.03, duration: 0.16 })}
                    whileHover={reduceMotion ? undefined : { backgroundColor: isSelected ? t.accentSoftBg : t.bgSurfaceMuted }}
                    onClick={() => setSelectedId(conversation.id)}
                    style={{
                      width: '100%',
                      marginBottom: 6,
                      padding: '12px 12px',
                      borderRadius: 10,
                      borderLeft: isSelected ? `3px solid ${t.accent}` : '3px solid transparent',
                      borderTop: '1px solid transparent',
                      borderRight: '1px solid transparent',
                      borderBottom: '1px solid transparent',
                      background: isSelected ? t.accentSoftBg : 'transparent',
                      color: 'inherit',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center' }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          background: t.accent,
                          color: '#ffffff',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {getInitials(conversation.customerName)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div
                            style={{
                              color: t.text,
                              fontSize: 13,
                              fontWeight: 700,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {conversation.customerName}
                          </div>
                        </div>
                        <div
                          style={{
                            marginTop: 3,
                            color: t.textMuted,
                            fontSize: 12,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {conversation.preview}
                        </div>
                      </div>
                      <div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>
                        <div style={{ color: t.textSubtle, fontSize: 11 }}>{conversation.time}</div>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 999,
                            border: `1px solid ${statusStyle.border}`,
                            background: statusStyle.background,
                            color: statusStyle.color,
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                        >
                          {conversation.status === 'Live' ? 'Live' : conversation.status}
                        </span>
                      </div>
                    </div>
                  </motion.button>
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
                    padding: '20px 22px 16px',
                    borderBottom: `1px solid ${t.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ color: t.text, fontSize: 17, fontWeight: 700 }}>{selectedConversation.customerName}</div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: t.success,
                        }}
                      />
                      <span style={{ color: t.textMuted, fontSize: 13 }}>Conversation Active</span>
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '5px 10px',
                      borderRadius: 999,
                      border: `1px solid ${badge.border}`,
                      background: badge.background,
                      color: badge.color,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {selectedConversation.status}
                  </span>
                </header>

                <div
                  ref={messagesScrollRef}
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    padding: '18px 20px',
                    display: 'grid',
                    alignContent: 'start',
                    gap: 12,
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
                        <div style={{ maxWidth: '70%' }}>
                          <div
                            style={{
                              borderRadius: 14,
                              padding: '10px 14px',
                              background: isAi ? t.bgSurfaceMuted : t.accent,
                              border: isAi
                                ? `1px solid ${t.border}`
                                : `1px solid ${t.accent}`,
                              color: isAi ? t.text : '#ffffff',
                            }}
                          >
                            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{message.text}</p>
                          </div>
                          <div
                            style={{
                              marginTop: 5,
                              fontSize: 10,
                              color: t.textSubtle,
                              textAlign: isAi ? 'left' : 'right',
                            }}
                          >
                            {isAi ? conciergeName : 'Guest'} • {message.time}
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
                    padding: 16,
                    borderTop: `1px solid ${t.border}`,
                    background: t.bgSurface,
                  }}
                >
                  <div
                    style={{
                      marginBottom: 10,
                      borderRadius: 10,
                      border: `1px solid ${isTakenOver ? t.warningBorder : t.successBorder}`,
                      background: isTakenOver ? t.warningBg : t.successBg,
                      color: isTakenOver ? t.warning : t.success,
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '10px 12px',
                    }}
                  >
                    {isTakenOver
                      ? 'Human operator is handling this conversation'
                      : `${conciergeName} is handling this conversation`}
                  </div>
                  {takeoverError ? (
                    <div
                      role="alert"
                      style={{
                        marginBottom: 10,
                        borderRadius: 10,
                        border: `1px solid ${t.dangerBorder}`,
                        background: t.dangerBg,
                        color: t.danger,
                        fontSize: 12,
                        padding: '10px 12px',
                      }}
                    >
                      {takeoverError}
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', gap: 10, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
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
                          : `${conciergeName} is in control. Click Take Over to respond.`
                      }
                      style={{
                        flex: 1,
                        minWidth: 180,
                        borderRadius: 10,
                        border: `1px solid ${t.border}`,
                        background: isTakenOver ? t.bgSurface : t.bgSurfaceMuted,
                        padding: '12px 14px',
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
                        padding: '0 20px',
                        minHeight: 46,
                        cursor:
                          !isTakenOver || isLoading || !draft.trim() ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isLoading ? 'Sending…' : 'Send'}
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={() => void handleTakeOverToggle()}
                      whileHover={reduceMotion ? undefined : { y: -1 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                      style={{
                        borderRadius: 10,
                        border: `1px solid ${isTakenOver ? t.warningBorder : t.border}`,
                        background: isTakenOver ? t.warningBg : t.bgSurface,
                        color: isTakenOver ? t.warning : t.text,
                        fontWeight: 600,
                        fontSize: 13,
                        padding: '0 18px',
                        minHeight: 46,
                        cursor: 'pointer',
                      }}
                    >
                      {isTakenOver ? 'Return to AI Concierge' : 'Take Over'}
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
              <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${t.border}` }}>
                <div style={{ color: t.text, fontSize: 17, fontWeight: 700 }}>Conversation Detail</div>
                <div style={{ marginTop: 6, color: t.textMuted, fontSize: 13 }}>
                  Guest profile · concierge controls
                </div>
              </div>

              {selectedConversation ? (
                <div
                  style={{
                    padding: 18,
                    display: 'grid',
                    gap: 16,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    minHeight: 0,
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      borderRadius: 12,
                      padding: 16,
                      background: t.bgSurfaceMuted,
                      border: `1px solid ${t.border}`,
                    }}
                  >
                    <div style={{ color: t.text, fontSize: 16, fontWeight: 700 }}>{selectedConversation.customerName}</div>
                    <div style={{ marginTop: 6, color: t.textMuted, fontSize: 13 }}>
                      Last update {selectedConversation.time}
                    </div>
                    <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: 999,
                          border: `1px solid ${badge.border}`,
                          background: badge.background,
                          color: badge.color,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {selectedConversation.status}
                      </span>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: 999,
                          border: `1px solid ${t.border}`,
                          background: t.bgSurface,
                          color: t.textMuted,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {selectedConversation.messages.length} messages
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      borderRadius: 12,
                      padding: 16,
                      background: t.bgSurfaceMuted,
                      border: `1px solid ${t.border}`,
                      display: 'grid',
                      gap: 12,
                    }}
                  >
                    <div style={{ color: t.textMuted, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 600 }}>
                      Concierge
                    </div>
                    {[
                      { label: 'Mode', value: isTakenOver ? 'Human takeover' : 'Autonomous' },
                      { label: 'Response time', value: '< 2 seconds' },
                      { label: 'Status', value: 'Online' },
                    ].map((item) => (
                      <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ color: t.textMuted, fontSize: 12 }}>{item.label}</span>
                        <span style={{ color: t.text, fontSize: 13, fontWeight: 700 }}>{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      borderRadius: 12,
                      padding: 16,
                      background: t.bgSurfaceMuted,
                      border: `1px solid ${t.border}`,
                    }}
                  >
                    <div style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>Preview</div>
                    <p style={{ margin: '10px 0 0', color: t.textMuted, fontSize: 13, lineHeight: 1.65 }}>
                      {selectedConversation.preview}
                    </p>
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
                  Conversation insights will appear here.
                </div>
              )}
            </motion.aside>
          ) : null}
        </div>
      )}
    </DashboardOceanNav>
  )
}
