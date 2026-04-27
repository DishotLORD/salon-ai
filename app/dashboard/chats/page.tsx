'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
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
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
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
      background: 'rgba(74, 222, 128, 0.12)',
      color: 'var(--ocean-success)',
      border: 'rgba(74, 222, 128, 0.35)',
    }
  }
  if (status === 'Human') {
    return {
      background: 'rgba(232, 220, 200, 0.15)',
      color: 'var(--ocean-sand)',
      border: 'rgba(232, 220, 200, 0.35)',
    }
  }
  if (status === 'Waiting') {
    return {
      background: 'rgba(251, 191, 36, 0.12)',
      color: 'var(--ocean-warning)',
      border: 'rgba(251, 191, 36, 0.35)',
    }
  }
  return {
    background: 'var(--ocean-surface)',
    color: 'var(--ocean-text-muted)',
    border: 'var(--ocean-border)',
  }
}

export default function ChatsInboxPage() {
  const [conversationList, setConversationList] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sendingConversationId, setSendingConversationId] = useState<string | null>(null)
  const [inboxLoaded, setInboxLoaded] = useState(false)
  const [inboxFetchError, setInboxFetchError] = useState(false)
  const [isTakenOver, setIsTakenOver] = useState(false)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const previousSelectedIdRef = useRef<string>('')

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
        `
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
      previousSelectedIdRef.current = ''
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset takeover when leaving selection
      setIsTakenOver(false)
      return
    }
    if (previousSelectedIdRef.current === selectedId) {
      return
    }
    previousSelectedIdRef.current = selectedId
    setIsTakenOver(selectedConversation?.status === 'Human')
  }, [selectedId, selectedConversation?.status])

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
              if (conversation.messages.some((m) => m.id === incoming.id)) {
                return conversation
              }
              return {
                ...conversation,
                messages: [...conversation.messages, incoming],
                preview: incoming.text,
                time: formatRelativeTime(inserted.created_at),
              }
            })
          )
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [selectedId])

  useEffect(() => {
    if (!selectedConversation) {
      return
    }
    const container = messagesScrollRef.current
    if (!container) {
      return
    }
    container.scrollTop = container.scrollHeight
  }, [selectedConversation?.id, selectedConversation?.messages.length])

  const handleTakeOverToggle = async () => {
    if (!selectedId) {
      return
    }
    const next = !isTakenOver
    const status = next ? 'human' : 'active'
    const { error } = await supabase.from('conversations').update({ status }).eq('id', selectedId)
    if (error) {
      console.error(error)
      return
    }
    setIsTakenOver(next)
    setConversationList((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, status: next ? 'Human' : 'Live' } : c))
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
              : conversation
          )
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
          : conversation
      )
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
            : conversation
        )
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
            : conversation
        )
      )
    } finally {
      setIsLoading(false)
      setSendingConversationId(null)
    }
  }

  return (
    <DashboardOceanNav activeNav="Chats" fillViewport>
      {({ isMobile, openNav }) => (
      <div style={{ flex: 1, display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {isMobile ? null : (
          <section
            style={{
              width: 300,
              height: '100vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              borderRight: '1px solid var(--ocean-border)',
              background: 'var(--ocean-card)',
              flexShrink: 0,
            }}
          >
            <header style={{ padding: 20, flexShrink: 0, borderBottom: '1px solid var(--ocean-border)' }}>
              <h1 style={{ margin: 0, fontSize: 18, color: 'var(--ocean-text)' }}>Chat Inbox</h1>
              <p style={{ margin: '6px 0 0', color: 'var(--ocean-text-muted)', fontSize: 13 }}>
                {conversationList.length} active conversations
              </p>
            </header>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {inboxLoaded && !inboxFetchError && conversationList.length === 0 ? (
                <p
                  style={{
                    margin: '24px 12px',
                    color: 'var(--ocean-text-muted)',
                    fontSize: 14,
                    textAlign: 'center',
                    lineHeight: 1.5,
                  }}
                >
                  No conversations yet
                </p>
              ) : null}
              {conversationList.map((conversation) => {
                const isSelected = conversation.id === selectedId
                const badge = getStatusStyle(conversation.status)
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedId(conversation.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: `1px solid ${isSelected ? 'var(--ocean-border-strong)' : 'var(--ocean-border)'}`,
                      background: isSelected ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                      borderRadius: 12,
                      padding: '12px 12px',
                      marginBottom: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ margin: 0, fontWeight: 600, color: 'var(--ocean-text)', fontSize: 14 }}>
                        {conversation.customerName}
                      </p>
                      <p style={{ margin: 0, color: 'var(--ocean-text-subtle)', fontSize: 12 }}>{conversation.time}</p>
                    </div>
                    <p
                      style={{
                        margin: '6px 0 9px',
                        color: 'var(--ocean-text-muted)',
                        fontSize: 13,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {conversation.preview}
                    </p>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: 999,
                        border: `1px solid ${badge.border}`,
                        background: badge.background,
                        color: badge.color,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {conversation.status}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <section
          style={{
            flex: 1,
            height: '100vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--ocean-ink)',
          }}
        >
          {selectedConversation ? (
            <>
              <header
                style={{
                  padding: 16,
                  flexShrink: 0,
                  borderBottom: '1px solid var(--ocean-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {isMobile && (
                    <button
                      type="button"
                      onClick={() => openNav()}
                      style={{
                        borderRadius: 8,
                        border: '1px solid var(--ocean-border)',
                        background: 'var(--ocean-surface)',
                        color: 'var(--ocean-text)',
                        fontWeight: 700,
                        fontSize: 12,
                        padding: '6px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      Menu
                    </button>
                  )}
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{selectedConversation.customerName}</h2>
                    <p style={{ margin: '5px 0 0', color: 'var(--ocean-text-muted)', fontSize: 13 }}>
                      AI assistant is handling this conversation
                    </p>
                  </div>
                </div>
                <span
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    border: '1px solid rgba(74, 222, 128, 0.35)',
                    background: 'rgba(74, 222, 128, 0.12)',
                    color: 'var(--ocean-success)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Session Active
                </span>
              </header>

              <div
                ref={messagesScrollRef}
                style={{ flex: 1, overflowY: 'auto', padding: 20, background: 'var(--ocean-deep)' }}
              >
                {selectedConversation.messages.map((message) => {
                  const isAI = message.sender === 'ai'
                  return (
                    <div
                      key={message.id}
                      style={{
                        display: 'flex',
                        justifyContent: isAI ? 'flex-end' : 'flex-start',
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '72%',
                          borderRadius: 12,
                          padding: '10px 12px',
                          background: isAI ? 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)' : 'var(--ocean-surface)',
                          border: isAI ? '1px solid var(--ocean-border-strong)' : '1px solid var(--ocean-border)',
                          color: isAI ? 'var(--ocean-black)' : 'var(--ocean-text)',
                        }}
                      >
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4 }}>{message.text}</p>
                        <p
                          style={{
                            margin: '7px 0 0',
                            fontSize: 11,
                            opacity: isAI ? 0.88 : 0.5,
                            textAlign: 'right',
                          }}
                        >
                          {message.sender === 'ai' ? 'AI' : 'Customer'} - {message.time}
                        </p>
                      </div>
                    </div>
                  )
                })}
                {isLoading && sendingConversationId === selectedConversation.id && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                    <div
                      style={{
                        maxWidth: '72%',
                        borderRadius: 12,
                        padding: '10px 12px',
                        background: 'rgba(248, 113, 113, 0.12)',
                        border: '1px solid rgba(248, 113, 113, 0.35)',
                        color: 'var(--ocean-danger)',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4 }}>AI is typing...</p>
                    </div>
                  </div>
                )}
              </div>

              <footer
                style={{
                  flexShrink: 0,
                  padding: 16,
                  borderTop: '1px solid var(--ocean-border)',
                  background: 'var(--ocean-card)',
                }}
              >
                <div
                  style={{
                    marginBottom: 8,
                    borderRadius: 9,
                    border: `1px solid ${isTakenOver ? 'rgba(251, 191, 36, 0.45)' : 'rgba(74, 222, 128, 0.35)'}`,
                    background: isTakenOver ? 'rgba(251, 191, 36, 0.1)' : 'rgba(74, 222, 128, 0.1)',
                    color: isTakenOver ? 'var(--ocean-warning)' : 'var(--ocean-success)',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '8px 10px',
                  }}
                >
                  {isTakenOver ? 'You are now handling this conversation' : 'AI is handling this conversation'}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
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
                        : 'AI is handling this conversation - click Take Over to respond manually'
                    }
                    style={{
                      flex: 1,
                      border: '1px solid var(--ocean-border)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      fontSize: 14,
                      outline: 'none',
                      background: !isTakenOver ? 'var(--ocean-surface)' : 'var(--ocean-ink-soft)',
                      color: !isTakenOver ? 'var(--ocean-text-muted)' : 'var(--ocean-text)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!isTakenOver || isLoading || !draft.trim()}
                    style={{
                      border: 'none',
                      borderRadius: 10,
                      background:
                        !isTakenOver || isLoading || !draft.trim()
                          ? 'var(--ocean-surface)'
                          : 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)',
                      color: !isTakenOver || isLoading || !draft.trim() ? 'var(--ocean-text-subtle)' : 'var(--ocean-black)',
                      fontWeight: 600,
                      fontSize: 14,
                      padding: '10px 14px',
                      cursor: !isTakenOver || isLoading || !draft.trim() ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isLoading ? 'Sending...' : 'Send'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleTakeOverToggle()}
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${isTakenOver ? 'rgba(251, 191, 36, 0.5)' : 'var(--ocean-border)'}`,
                      background: isTakenOver ? 'rgba(251, 191, 36, 0.25)' : 'var(--ocean-surface)',
                      color: isTakenOver ? 'var(--ocean-warning)' : 'var(--ocean-text)',
                      fontWeight: 600,
                      fontSize: 14,
                      padding: '10px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    {isTakenOver ? 'AI Mode' : 'Take Over'}
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 32,
                color: 'var(--ocean-text-muted)',
                fontSize: 14,
              }}
            >
              Select a conversation to start
            </div>
          )}
        </section>
      </div>
      )}
    </DashboardOceanNav>
  )
}
