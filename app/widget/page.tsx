'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { supabase } from '@/lib/supabase'

type WidgetMessage = {
  id: string
  sender: 'customer' | 'ai'
  text: string
}

const initialMessages: WidgetMessage[] = [
  {
    id: 'welcome',
    sender: 'ai',
    text: 'Hi! I am your AI Assistant. Ask me about bookings, services, or availability.',
  },
]

function WidgetPageInner() {
  const searchParams = useSearchParams()
  const businessId = searchParams.get('business_id')
  const [businessName, setBusinessName] = useState<string | null>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<WidgetMessage[]>(initialMessages)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setConversationId(null)
  }, [businessId])

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
          const sender: WidgetMessage['sender'] = row.role === 'assistant' ? 'ai' : 'customer'
          const incomingId = row.id
          setMessages((prev) => {
            if (prev.some((message) => message.id === incomingId)) {
              return prev
            }
            return [...prev, { id: incomingId, sender, text: row.content ?? '' }]
          })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    const el = messagesContainerRef.current
    if (!el) {
      return
    }
    el.scrollTop = el.scrollHeight
  }, [messages.length, isOpen])

  useEffect(() => {
    if (!businessId) {
      setBusinessName(null)
      return
    }
    let cancelled = false
    void (async () => {
      const { data } = await supabase.from('businesses').select('name').eq('id', businessId).maybeSingle()
      if (!cancelled && data?.name?.trim()) {
        setBusinessName(data.name.trim())
      } else if (!cancelled) {
        setBusinessName(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [businessId])

  const headerTitle = businessName ?? 'AI Assistant'

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || isLoading) {
      return
    }

    const customerMessage: WidgetMessage = {
      id: `customer-${Date.now()}`,
      sender: 'customer',
      text,
    }
    const nextMessages = [...messages, customerMessage]

    setMessages(nextMessages)
    setDraft('')
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
      }

      if (response.ok && typeof data.conversation_id === 'string' && data.conversation_id) {
        setConversationId(data.conversation_id)
      }

      if (data.skipped) {
        return
      }

      const aiText =
        response.ok && typeof data.message === 'string'
          ? data.message
          : 'Sorry, something went wrong. Please try again.'

      if (!businessId || !data.conversation_id) {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            sender: 'ai',
            text: aiText,
          },
        ])
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-error-${Date.now()}`,
          sender: 'ai',
          text: 'I could not reach the server. Please try again in a moment.',
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ padding: 32, color: '#475569' }}>
        <h1 style={{ margin: 0, fontSize: 30, color: '#0f172a' }}>Widget Preview</h1>
        <p style={{ marginTop: 10, maxWidth: 700 }}>
          This is a standalone chat widget page. Use the purple bubble button in the bottom-right corner to open
          the assistant.
        </p>
      </div>

      <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 30 }}>
        {isOpen && (
          <div
            style={{
              width: 350,
              height: 500,
              background: '#ffffff',
              borderRadius: 20,
              border: '1px solid #e2e8f0',
              boxShadow: '0 24px 50px rgba(15, 23, 42, 0.22)',
              marginBottom: 14,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <header
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>{headerTitle}</p>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#22c55e',
                      boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.2)',
                    }}
                  />
                  <span style={{ fontSize: 12, color: '#4b5563' }}>Online</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  border: 'none',
                  borderRadius: 8,
                  width: 30,
                  height: 30,
                  cursor: 'pointer',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                x
              </button>
            </header>

            <div ref={messagesContainerRef} style={{ flex: 1, padding: '14px 12px', overflowY: 'auto', background: '#f8fafc' }}>
              {messages.map((message) => {
                const isCustomer = message.sender === 'customer'
                return (
                  <div
                    key={message.id}
                    style={{
                      display: 'flex',
                      justifyContent: isCustomer ? 'flex-end' : 'flex-start',
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '78%',
                        borderRadius: 14,
                        padding: '9px 12px',
                        fontSize: 14,
                        lineHeight: 1.45,
                        background: isCustomer ? '#7c3aed' : '#e5e7eb',
                        color: isCustomer ? '#ffffff' : '#111827',
                        border: `1px solid ${isCustomer ? '#6d28d9' : '#d1d5db'}`,
                      }}
                    >
                      {message.text}
                    </div>
                  </div>
                )
              })}

              {isLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
                  <div
                    style={{
                      maxWidth: '78%',
                      borderRadius: 14,
                      padding: '9px 12px',
                      fontSize: 14,
                      lineHeight: 1.45,
                      background: '#e5e7eb',
                      color: '#111827',
                      border: '1px solid #d1d5db',
                    }}
                  >
                    AI is typing...
                  </div>
                </div>
              )}
            </div>

            <footer style={{ borderTop: '1px solid #f1f5f9', padding: 10, background: '#ffffff' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleSend()
                    }
                  }}
                  placeholder="Type your message..."
                  style={{
                    flex: 1,
                    border: '1px solid #cbd5e1',
                    borderRadius: 10,
                    padding: '10px 12px',
                    outline: 'none',
                    fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={isLoading || !draft.trim()}
                  style={{
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 13px',
                    cursor: isLoading || !draft.trim() ? 'not-allowed' : 'pointer',
                    background: isLoading || !draft.trim() ? '#c4b5fd' : '#7c3aed',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  Send
                </button>
              </div>
            </footer>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            background: 'linear-gradient(140deg, #8b5cf6, #7c3aed)',
            color: '#fff',
            boxShadow: '0 14px 30px rgba(124, 58, 237, 0.45)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 25,
          }}
          aria-label="Toggle chat widget"
        >
          💬
        </button>
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
