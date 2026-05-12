'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { supabase } from '@/lib/supabase'

type WidgetMessage = {
  id: string
  sender: 'customer' | 'ai'
  text: string
}

const DEFAULT_CONCIERGE_NAME = 'AI Concierge'

const buildWelcome = (businessName: string | null, conciergeName: string): WidgetMessage => ({
  id: 'welcome',
  sender: 'ai',
  text: businessName
    ? `Hi! I'm ${conciergeName} for ${businessName}. Ask me about reservations, the menu, hours, or anything else.`
    : `Hi! I'm ${conciergeName}. Ask me about reservations, the menu, hours, or anything else.`,
})

function WidgetPageInner() {
  const searchParams = useSearchParams()
  const businessId = searchParams.get('business_id')
  const [businessName, setBusinessName] = useState<string | null>(null)
  const [conciergeName, setConciergeName] = useState<string>(DEFAULT_CONCIERGE_NAME)

  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<WidgetMessage[]>([
    buildWelcome(null, DEFAULT_CONCIERGE_NAME),
  ])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- new embed target needs fresh conversation
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
          const incomingId = row.id
          const content = row.content ?? ''
          const isAssistant = row.role === 'assistant'

          if (isAssistant) {
            setMessages((prev) => {
              // ID already in state — realtime delivered twice, skip
              if (prev.some((m) => m.id === incomingId)) return prev
              // Find our own optimistically-rendered AI message (temp id starts with 'ai-')
              // and replace its temp id with the real DB UUID — same pattern as customer messages.
              const ownIdx = prev.findLastIndex(
                (m) => m.sender === 'ai' && m.text === content && m.id.startsWith('ai-'),
              )
              if (ownIdx !== -1) {
                const next = [...prev]
                next[ownIdx] = { ...next[ownIdx], id: incomingId }
                return next
              }
              // No optimistic match — this is an operator message from the dashboard
              return [...prev, { id: incomingId, sender: 'ai', text: content }]
            })
            return
          }

          // Customer messages are added optimistically with a temp id.
          // Replace the optimistic entry by content to avoid duplicates.
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear name when no business context
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

  const headerTitle = businessName ?? conciergeName

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
      if (!conversationId && businessId) {
        console.log('[widget] creating new conversation with business_id:', businessId)
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

      setMessages((prev) => {
        // Realtime may have already delivered this exact message — skip if duplicate text
        const lastAi = [...prev].reverse().find((m) => m.sender === 'ai')
        if (lastAi && lastAi.text === aiText && !lastAi.id.startsWith('ai-')) return prev
        return [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            sender: 'ai',
            text: aiText,
          },
        ]
      })
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-error-${Date.now()}`,
          sender: 'ai',
          text: "I couldn't reach the server. Please try again in a moment.",
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

      <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 30 }}>
        <AnimatePresence>
        {isOpen ? (
          <motion.div
            key="widget-panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{
              width: 350,
              height: 500,
              background: 'var(--ocean-card)',
              borderRadius: 'var(--ocean-radius-xl)',
              border: '1px solid var(--ocean-border)',
              boxShadow: 'var(--ocean-shadow-lg)',
              marginBottom: 14,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <header
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--ocean-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ocean-text)' }}>{headerTitle}</p>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--ocean-success)',
                      boxShadow: '0 0 0 3px rgba(74, 222, 128, 0.25)',
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--ocean-text-muted)' }}>Online</span>
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
                  background: 'var(--ocean-surface)',
                  color: 'var(--ocean-text-muted)',
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </header>

            <div
              ref={messagesContainerRef}
              style={{ flex: 1, padding: '14px 12px', overflowY: 'auto', background: 'var(--ocean-deep)' }}
            >
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
                        background: isCustomer
                          ? 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)'
                          : 'var(--ocean-surface)',
                        color: isCustomer ? 'var(--ocean-black)' : 'var(--ocean-text)',
                        border: `1px solid ${isCustomer ? 'var(--ocean-border-strong)' : 'var(--ocean-border)'}`,
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
                      background: 'var(--ocean-surface)',
                      color: 'var(--ocean-text)',
                      border: '1px solid var(--ocean-border)',
                    }}
                  >
                    {conciergeName} is typing…
                  </div>
                </div>
              )}
            </div>

            <footer style={{ borderTop: '1px solid var(--ocean-border)', padding: 10, background: 'var(--ocean-ink)' }}>
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
                  placeholder="Type your message…"
                  style={{
                    flex: 1,
                    border: '1px solid var(--ocean-border)',
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
                    background:
                      isLoading || !draft.trim() ? 'var(--ocean-surface)' : 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)',
                    color: isLoading || !draft.trim() ? 'var(--ocean-text-subtle)' : 'var(--ocean-black)',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  Send
                </button>
              </div>
            </footer>
          </motion.div>
        ) : null}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          layout
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            background: 'linear-gradient(140deg, var(--ocean-sky), var(--ocean-sand-deep))',
            color: 'var(--ocean-black)',
            boxShadow: 'var(--ocean-shadow-glow)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 25,
          }}
          aria-label="Toggle chat widget"
        >
          💬
        </motion.button>
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
