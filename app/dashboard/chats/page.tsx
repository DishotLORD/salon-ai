'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { DashboardLogoutButton } from '@/components/dashboard-logout-button'
import { supabase } from '@/lib/supabase'

type ConversationStatus = 'Live' | 'Waiting' | 'Resolved'
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
  if (key === 'waiting') {
    return 'Waiting'
  }
  if (key === 'resolved') {
    return 'Resolved'
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

const navItems = ['Dashboard', 'Chats', 'Calendar', 'Bookings', 'CRM', 'Settings']
const navLinks: Record<string, string> = {
  Dashboard: '/dashboard',
  Chats: '/dashboard/chats',
  Calendar: '/dashboard/bookings',
  Bookings: '/dashboard/bookings',
  CRM: '/dashboard/crm',
  Settings: '/dashboard/settings',
}

function getStatusStyle(status: ConversationStatus) {
  if (status === 'Live') {
    return { background: '#dcfce7', color: '#166534', border: '#bbf7d0' }
  }
  if (status === 'Waiting') {
    return { background: '#fef3c7', color: '#92400e', border: '#fde68a' }
  }
  return { background: '#e5e7eb', color: '#374151', border: '#d1d5db' }
}

export default function ChatsInboxPage() {
  const [conversationList, setConversationList] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sendingConversationId, setSendingConversationId] = useState<string | null>(null)
  const [inboxLoaded, setInboxLoaded] = useState(false)
  const [inboxFetchError, setInboxFetchError] = useState(false)

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

  const handleSend = async () => {
    if (!selectedConversation || !draft.trim() || isLoading) {
      return
    }

    const messageText = draft.trim()
    const conversationId = selectedConversation.id

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
    <div
      style={{
        minHeight: '100vh',
        background: '#f3f4f6',
        color: '#111827',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <aside
          style={{
            width: 258,
            background: '#ffffff',
            borderRight: '1px solid #e5e7eb',
            padding: '24px 14px 20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <p
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.24em',
              color: '#ef4444',
              margin: '0 12px 6px',
            }}
          >
            Salon AI
          </p>
          <h2 style={{ margin: '0 12px 24px', fontSize: 20, fontWeight: 700 }}>Operations</h2>

          <nav style={{ display: 'grid', gap: 6 }}>
            {navItems.map((item) => {
              const isActive = item === 'Chats'
              return (
                <Link
                  key={item}
                  href={navLinks[item] ?? '#'}
                  style={{
                    padding: '11px 13px',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 500,
                    color: isActive ? '#7f1d1d' : '#6b7280',
                    background: isActive ? '#fee2e2' : 'transparent',
                    border: isActive ? '1px solid #fecaca' : '1px solid transparent',
                    textDecoration: 'none',
                  }}
                >
                  {item}
                </Link>
              )
            })}
          </nav>

          <div style={{ marginTop: 'auto', padding: '0 8px', display: 'grid', gap: 10 }}>
            <DashboardLogoutButton />
            <button
              type="button"
              style={{
                width: '100%',
                border: 'none',
                borderRadius: 10,
                background: '#dc2626',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                padding: '11px 14px',
                cursor: 'pointer',
              }}
            >
              Deploy Agent
            </button>
          </div>
        </aside>

        <main style={{ flex: 1, padding: 24 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '360px minmax(0, 1fr)',
              gap: 14,
              height: 'calc(100vh - 48px)',
            }}
          >
            <section
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 14,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <header style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f3f4f6' }}>
                <h1 style={{ margin: 0, fontSize: 18 }}>Chat Inbox</h1>
                <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 13 }}>
                  {conversationList.length} active conversations
                </p>
              </header>

              <div style={{ overflowY: 'auto', padding: 8 }}>
                {inboxLoaded && !inboxFetchError && conversationList.length === 0 ? (
                  <p
                    style={{
                      margin: '24px 12px',
                      color: '#6b7280',
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
                        border: `1px solid ${isSelected ? '#fecaca' : '#f3f4f6'}`,
                        background: isSelected ? '#fef2f2' : '#ffffff',
                        borderRadius: 12,
                        padding: '12px 12px',
                        marginBottom: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0, fontWeight: 600, color: '#111827', fontSize: 14 }}>
                          {conversation.customerName}
                        </p>
                        <p style={{ margin: 0, color: '#9ca3af', fontSize: 12 }}>{conversation.time}</p>
                      </div>
                      <p
                        style={{
                          margin: '6px 0 9px',
                          color: '#6b7280',
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

            <section
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 14,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {selectedConversation ? (
                <>
                  <header
                    style={{
                      padding: '16px 18px',
                      borderBottom: '1px solid #f3f4f6',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <h2 style={{ margin: 0, fontSize: 18 }}>{selectedConversation.customerName}</h2>
                      <p style={{ margin: '5px 0 0', color: '#6b7280', fontSize: 13 }}>
                        AI assistant is handling this conversation
                      </p>
                    </div>
                    <span
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        border: '1px solid #d1fae5',
                        background: '#ecfdf5',
                        color: '#047857',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Session Active
                    </span>
                  </header>

                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', background: '#f9fafb' }}>
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
                              background: isAI ? '#dc2626' : '#ffffff',
                              border: isAI ? '1px solid #b91c1c' : '1px solid #e5e7eb',
                              color: isAI ? '#fff' : '#1f2937',
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
                            background: '#fee2e2',
                            border: '1px solid #fecaca',
                            color: '#991b1b',
                          }}
                        >
                          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4 }}>AI is typing...</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <footer style={{ borderTop: '1px solid #f3f4f6', padding: 14, background: '#ffffff' }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input
                        type="text"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            void handleSend()
                          }
                        }}
                        placeholder="Write a message..."
                        style={{
                          flex: 1,
                          border: '1px solid #d1d5db',
                          borderRadius: 10,
                          padding: '10px 12px',
                          fontSize: 14,
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={isLoading || !draft.trim()}
                        style={{
                          border: 'none',
                          borderRadius: 10,
                          background: isLoading || !draft.trim() ? '#fca5a5' : '#dc2626',
                          color: '#fff',
                          fontWeight: 600,
                          padding: '10px 14px',
                          cursor: isLoading || !draft.trim() ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isLoading ? 'Sending...' : 'Send'}
                      </button>
                      <button
                        type="button"
                        style={{
                          borderRadius: 10,
                          border: '1px solid #d1d5db',
                          background: '#ffffff',
                          color: '#374151',
                          fontWeight: 600,
                          padding: '10px 14px',
                          cursor: 'pointer',
                        }}
                      >
                        Take Over
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
                    color: '#9ca3af',
                    fontSize: 14,
                    minHeight: 200,
                  }}
                />
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
