'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

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

const navItems = ['Dashboard', 'Chats', 'Calendar', 'CRM', 'Settings']

const initialConversations: Conversation[] = [
  {
    id: 'c1',
    customerName: 'Emma Johnson',
    preview: 'Can I move my balayage appointment to Friday?',
    time: '2m',
    status: 'Live',
    messages: [
      { id: 'm1', sender: 'customer', text: 'Hi! Can I move my balayage appointment to Friday?', time: '10:02' },
      { id: 'm2', sender: 'ai', text: 'Absolutely. Friday has openings at 1:30 PM and 4:00 PM. Which works best?', time: '10:03' },
      { id: 'm3', sender: 'customer', text: '1:30 PM works for me.', time: '10:04' },
    ],
  },
  {
    id: 'c2',
    customerName: 'Olivia Martinez',
    preview: 'Do you have any lash extension slots tomorrow?',
    time: '11m',
    status: 'Waiting',
    messages: [
      { id: 'm1', sender: 'customer', text: 'Do you have any lash extension slots tomorrow?', time: '09:48' },
      { id: 'm2', sender: 'ai', text: 'Yes, we currently have 11:00 AM and 2:30 PM available.', time: '09:49' },
    ],
  },
  {
    id: 'c3',
    customerName: 'Sophia Lee',
    preview: 'Thanks, the AI helped me rebook successfully.',
    time: '27m',
    status: 'Resolved',
    messages: [
      { id: 'm1', sender: 'customer', text: 'I need to cancel my manicure today.', time: '09:22' },
      { id: 'm2', sender: 'ai', text: 'No problem. I can cancel and suggest tomorrow 3:00 PM instead.', time: '09:23' },
      { id: 'm3', sender: 'customer', text: 'Perfect, thank you!', time: '09:24' },
    ],
  },
  {
    id: 'c4',
    customerName: 'Mia Wilson',
    preview: 'Could I get a quote for the bridal package?',
    time: '1h',
    status: 'Live',
    messages: [
      { id: 'm1', sender: 'customer', text: 'Could I get a quote for the bridal package?', time: '08:40' },
      { id: 'm2', sender: 'ai', text: 'Our bridal package starts at $320 and can be customized.', time: '08:41' },
    ],
  },
]

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
  const [conversationList, setConversationList] = useState(initialConversations)
  const [selectedId, setSelectedId] = useState(initialConversations[0].id)
  const [draft, setDraft] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sendingConversationId, setSendingConversationId] = useState<string | null>(null)

  const selectedConversation = useMemo(
    () =>
      conversationList.find((conversation) => conversation.id === selectedId) ?? conversationList[0],
    [conversationList, selectedId]
  )

  const handleSend = async () => {
    if (!selectedConversation || !draft.trim() || isLoading) {
      return
    }

    const messageText = draft.trim()
    const conversationId = selectedConversation.id
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const customerMessage: Message = {
      id: `m-${Date.now()}-customer`,
      sender: 'customer',
      text: messageText,
      time: now,
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
      const aiMessage: Message = {
        id: `m-${Date.now()}-ai`,
        sender: 'ai',
        text: aiText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
      const fallbackMessage: Message = {
        id: `m-${Date.now()}-ai-fallback`,
        sender: 'ai',
        text: 'I could not reach the AI service right now. Please try again.',
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
                  href={item === 'Dashboard' ? '/dashboard' : '#'}
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

          <div style={{ marginTop: 'auto', padding: '0 8px' }}>
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
                {conversationList.map((conversation) => {
                  const isSelected = conversation.id === selectedConversation.id
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
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
