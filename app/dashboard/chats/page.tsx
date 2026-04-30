'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { oceanTransition } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'

type ConversationStatus = 'Live' | 'Waiting' | 'Resolved' | 'Human'
type Sender = 'customer' | 'ai'

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

const panelStyle = {
  background: 'rgba(8,20,40,0.5)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
}

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
  const sender: Sender = row.role === 'assistant' ? 'ai' : 'customer'
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
    customerName: row.customer_name?.trim() || 'Customer',
    preview,
    time: formatRelativeTime(lastActivity),
    status: normalizeStatus(row.status),
    messages: ordered.map(mapDbMessageToMessage),
  }
}

function getStatusStyle(status: ConversationStatus) {
  if (status === 'Live') {
    return {
      background: 'rgba(56,189,248,0.15)',
      color: '#38bdf8',
      border: 'rgba(56,189,248,0.28)',
    }
  }
  if (status === 'Human') {
    return {
      background: 'rgba(251,191,36,0.12)',
      color: '#fbbf24',
      border: 'rgba(251,191,36,0.28)',
    }
  }
  if (status === 'Waiting') {
    return {
      background: 'rgba(167,139,250,0.14)',
      color: '#c4b5fd',
      border: 'rgba(167,139,250,0.3)',
    }
  }
  return {
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.55)',
    border: 'rgba(255,255,255,0.1)',
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
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    let cancelled = false

    async function loadConversations() {
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
    const next = selectedConversation.status !== 'Human'
    const status = next ? 'human' : 'active'
    const { error } = await supabase.from('conversations').update({ status }).eq('id', selectedId)
    if (error) {
      console.error(error)
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
        id: `m-${Date.now()}-customer`,
        sender: 'customer',
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
                padding: '22px 20px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div>
                <h1 style={{ margin: 0, color: 'white', fontSize: 18, fontWeight: 700 }}>Chat Inbox</h1>
                <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                  {conversationList.length} active
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
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'white',
                    fontSize: 18,
                    cursor: 'pointer',
                  }}
                >
                  ☰
                </motion.button>
              ) : (
                <span
                  style={{
                    borderRadius: 999,
                    padding: '7px 10px',
                    background: 'rgba(56,189,248,0.14)',
                    color: '#38bdf8',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  19 active
                </span>
              )}
            </div>

            <div style={{ padding: 10, overflowY: 'auto', flex: 1 }}>
              {inboxFetchError ? (
                <div style={{ padding: 20, color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.5 }}>
                  We couldn’t load the inbox right now.
                </div>
              ) : null}

              {inboxLoaded && !inboxFetchError && conversationList.length === 0 ? (
                <div style={{ padding: 20, color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.5 }}>
                  No conversations yet.
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
                    whileHover={reduceMotion ? undefined : { backgroundColor: 'rgba(255,255,255,0.04)' }}
                    onClick={() => setSelectedId(conversation.id)}
                    style={{
                      width: '100%',
                      marginBottom: 8,
                      padding: '13px 12px',
                      borderRadius: 16,
                      borderLeft: isSelected ? '2px solid #38bdf8' : '2px solid transparent',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      borderRight: '1px solid rgba(255,255,255,0.06)',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      background: isSelected ? 'rgba(56,189,248,0.08)' : 'transparent',
                      color: 'inherit',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '42px 1fr auto', gap: 12, alignItems: 'center' }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          background: 'linear-gradient(135deg, rgba(56,189,248,0.8), rgba(14,165,233,0.28))',
                          color: 'white',
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
                              color: 'white',
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
                            marginTop: 4,
                            color: 'rgba(255,255,255,0.42)',
                            fontSize: 12,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {conversation.preview}
                        </div>
                      </div>
                      <div style={{ display: 'grid', justifyItems: 'end', gap: 8 }}>
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{conversation.time}</div>
                        <span
                          style={{
                            padding: '4px 8px',
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
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  <div>
                    <div style={{ color: 'white', fontSize: 18, fontWeight: 700 }}>{selectedConversation.customerName}</div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#4ade80',
                          boxShadow: '0 0 0 6px rgba(74,222,128,0.16)',
                        }}
                      />
                      <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: 13 }}>Session Active</span>
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '7px 10px',
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
                    overflowY: 'auto',
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
                        <div style={{ maxWidth: '72%' }}>
                          <div
                            style={{
                              borderRadius: 18,
                              padding: '12px 14px',
                              background: isAi ? 'rgba(8,20,40,0.6)' : 'rgba(14,165,233,0.15)',
                              border: isAi
                                ? '1px solid rgba(255,255,255,0.08)'
                                : '1px solid rgba(56,189,248,0.2)',
                              color: 'white',
                              boxShadow: isAi ? 'none' : '0 8px 24px rgba(14,165,233,0.16)',
                            }}
                          >
                            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{message.text}</p>
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 10,
                              color: 'rgba(255,255,255,0.3)',
                              textAlign: isAi ? 'left' : 'right',
                            }}
                          >
                            {isAi ? 'AI Agent' : 'Customer'} • {message.time}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {isLoading && sendingConversationId === selectedConversation.id ? (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div
                        style={{
                          borderRadius: 18,
                          padding: '12px 14px',
                          background: 'rgba(8,20,40,0.6)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.75)',
                          fontSize: 14,
                        }}
                      >
                        AI is typing...
                      </div>
                    </div>
                  ) : null}
                </div>

                <footer
                  style={{
                    padding: 16,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(5,20,40,0.45)',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  <div
                    style={{
                      marginBottom: 10,
                      borderRadius: 14,
                      border: `1px solid ${isTakenOver ? 'rgba(251,191,36,0.32)' : 'rgba(74,222,128,0.32)'}`,
                      background: isTakenOver ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)',
                      color: isTakenOver ? '#fbbf24' : '#4ade80',
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '10px 12px',
                    }}
                  >
                    {isTakenOver ? 'Human operator is handling this session' : 'AI is handling this session'}
                  </div>

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
                          ? 'Write a message...'
                          : 'AI is in control. Click Take Over to respond.'
                      }
                      style={{
                        flex: 1,
                        minWidth: 180,
                        borderRadius: 16,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: isTakenOver ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                        padding: '14px 16px',
                        fontSize: 14,
                        color: isTakenOver ? 'white' : 'rgba(255,255,255,0.45)',
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
                        borderRadius: 16,
                        background:
                          !isTakenOver || isLoading || !draft.trim()
                            ? 'rgba(255,255,255,0.08)'
                            : '#0ea5e9',
                        color:
                          !isTakenOver || isLoading || !draft.trim() ? 'rgba(255,255,255,0.38)' : 'white',
                        fontWeight: 700,
                        fontSize: 13,
                        padding: '0 18px',
                        minHeight: 50,
                        cursor:
                          !isTakenOver || isLoading || !draft.trim() ? 'not-allowed' : 'pointer',
                        boxShadow:
                          !isTakenOver || isLoading || !draft.trim()
                            ? 'none'
                            : '0 8px 24px rgba(14,165,233,0.32)',
                      }}
                    >
                      {isLoading ? 'Sending...' : 'Send'}
                    </motion.button>
                    <motion.button
                      type="button"
                      onClick={() => void handleTakeOverToggle()}
                      whileHover={reduceMotion ? undefined : { y: -1 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                      style={{
                        borderRadius: 16,
                        border: `1px solid ${isTakenOver ? 'rgba(249,115,22,0.45)' : 'rgba(255,255,255,0.12)'}`,
                        background: isTakenOver ? 'rgba(249,115,22,0.14)' : 'rgba(255,255,255,0.05)',
                        color: isTakenOver ? '#fb923c' : 'rgba(255,255,255,0.82)',
                        fontWeight: 700,
                        fontSize: 13,
                        padding: '0 18px',
                        minHeight: 50,
                        cursor: 'pointer',
                      }}
                    >
                      {isTakenOver ? 'Return to AI' : 'Take Over'}
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
                  color: 'rgba(255,255,255,0.48)',
                  fontSize: 14,
                }}
              >
                Select a conversation to start.
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
              <div style={{ padding: '22px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ color: 'white', fontSize: 18, fontWeight: 700 }}>Session Detail</div>
                <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                  Live operator controls
                </div>
              </div>

              {selectedConversation ? (
                <div style={{ padding: 18, display: 'grid', gap: 16, overflowY: 'auto' }}>
                  <div
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>{selectedConversation.customerName}</div>
                    <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.42)', fontSize: 13 }}>
                      Last update {selectedConversation.time}
                    </div>
                    <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <span
                        style={{
                          padding: '5px 8px',
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
                          padding: '5px 8px',
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.04)',
                          color: 'rgba(255,255,255,0.7)',
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
                      borderRadius: 18,
                      padding: 16,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'grid',
                      gap: 12,
                    }}
                  >
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                      AI Agent
                    </div>
                    {[
                      { label: 'Mode', value: isTakenOver ? 'Human takeover' : 'Autonomous' },
                      { label: 'Response time', value: '< 2 seconds' },
                      { label: 'Queue state', value: 'Healthy' },
                    ].map((item) => (
                      <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12 }}>{item.label}</span>
                        <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      borderRadius: 18,
                      padding: 16,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>Preview</div>
                    <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 1.65 }}>
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
                    color: 'rgba(255,255,255,0.45)',
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
