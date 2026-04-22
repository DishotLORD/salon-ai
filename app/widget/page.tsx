'use client'

import { useState } from 'react'

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

export default function WidgetPage() {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<WidgetMessage[]>(initialMessages)

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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.sender === 'customer' ? 'user' : 'assistant',
            content: message.text,
          })),
        }),
      })

      const data = await response.json()
      const aiText =
        response.ok && typeof data.message === 'string'
          ? data.message
          : 'Sorry, something went wrong. Please try again.'

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: aiText,
        },
      ])
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
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>AI Assistant</p>
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

            <div style={{ flex: 1, padding: '14px 12px', overflowY: 'auto', background: '#f8fafc' }}>
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
