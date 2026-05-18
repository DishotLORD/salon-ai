'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { supabase } from '@/lib/supabase'
import { t } from '@/lib/dashboard-theme'

export type RecentActivity = {
  id: string
  title: string
  timestamp: string
  role: 'assistant' | 'guest'
}

type DashboardClientProps = {
  businessDisplayName: string
  conciergeName: string
  businessId: string
  activeChats: number
  messageCount: number
  recentActivity: RecentActivity[]
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatRelativeTime(timestamp: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(0)
  useEffect(() => {
    const end = value
    const startTime = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - startTime) / 1000)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(ref.current + (end - ref.current) * eased))
      if (p < 1) requestAnimationFrame(tick)
      else ref.current = end
    }
    requestAnimationFrame(tick)
  }, [value])
  return <>{display}</>
}

function AnimatedHeading({ text, isMobile }: { text: string; isMobile: boolean }) {
  return (
    <h1 style={{
      margin: 0,
      fontSize: isMobile ? 30 : 40,
      fontWeight: 700,
      fontFamily: 'var(--font-playfair, Georgia, serif)',
      letterSpacing: '-0.03em',
      lineHeight: 1.15,
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0 0.25em',
    }}>
      {text.split(' ').map((word, i, arr) => (
        <motion.span
          key={i}
          initial={{ y: 30, opacity: 0, filter: 'blur(6px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.5, delay: 0.05 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: 'inline-block',
            background: i >= arr.length - 2
              ? `linear-gradient(135deg, #ffffff 0%, ${t.accent} 100%)`
              : 'rgba(255,255,255,0.92)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {word}
        </motion.span>
      ))}
    </h1>
  )
}

export function DashboardClient({
  businessDisplayName,
  conciergeName,
  businessId,
  activeChats,
  messageCount,
  recentActivity,
}: DashboardClientProps) {
  const reduceMotion = useReducedMotion()
  const [unreadCount, setUnreadCount] = useState(activeChats)

  useEffect(() => {
    const fetchCount = async () => {
      const { count } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .or('status.is.null,status.eq.active,status.eq.human')
      if (count !== null) setUnreadCount(count)
    }
    void fetchCount()
    const id = setInterval(() => void fetchCount(), 30_000)
    return () => clearInterval(id)
  }, [businessId])

  const metrics = [
    { label: 'Active chats', value: activeChats, suffix: '', accent: '#38bdf8' },
    { label: 'Messages today', value: messageCount, suffix: '', accent: '#6366f1' },
    { label: 'Response time', value: 2, suffix: 's', accent: '#10b981' },
  ]

  return (
    <DashboardOceanNav activeNav="Dashboard">
      {({ isMobile, openNav }) => (
        <main style={{ display: 'grid', gap: 32, maxWidth: 900, margin: '0 auto', position: 'relative', zIndex: 1 }}>

          {isMobile && (
            <button
              type="button"
              onClick={openNav}
              style={{
                width: 44, height: 44, borderRadius: 12,
                border: `1px solid ${t.border}`,
                background: t.bgSurface,
                color: t.text, fontSize: 20, cursor: 'pointer',
              }}
            >
              ☰
            </button>
          )}

          {/* Greeting */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}
          >
            <div>
              <AnimatedHeading text={`${getGreeting()}, ${businessDisplayName}`} isMobile={isMobile} />
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                style={{ margin: '8px 0 0', color: t.textMuted, fontSize: 14 }}
              >
                {new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}
              </motion.p>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 999,
                border: `1px solid ${t.accentSoftBorder}`,
                background: t.accentSoftBg,
                color: t.accent, fontSize: 13, fontWeight: 600,
                backdropFilter: 'blur(12px)',
              }}
            >
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{ width: 7, height: 7, borderRadius: '50%', background: t.accent, boxShadow: `0 0 8px ${t.accent}` }}
              />
              {conciergeName} is live
            </motion.div>
          </motion.section>

          {/* Metrics */}
          <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 16 }}>
            {metrics.map((m, i) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                whileHover={reduceMotion ? undefined : { y: -3, boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 24px ${m.accent}22` }}
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderLeft: `3px solid ${m.accent}`,
                  borderRadius: 20,
                  padding: '28px 28px 24px',
                  boxShadow: `0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)`,
                  transition: 'box-shadow 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Subtle accent glow inside card */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, width: '60%', height: '100%',
                  background: `radial-gradient(ellipse at 0% 50%, ${m.accent}12 0%, transparent 70%)`,
                  pointerEvents: 'none',
                }} />
                <div style={{ fontSize: 12, color: t.textMuted, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, position: 'relative' }}>
                  {m.label}
                </div>
                <div style={{ marginTop: 14, fontSize: 48, fontWeight: 700, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums', position: 'relative' }}>
                  <AnimatedCounter value={m.value} />{m.suffix}
                </div>
              </motion.div>
            ))}
          </section>

          {/* Actions */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}
          >
            <Link href="/dashboard/settings?tab=widget" style={{ textDecoration: 'none' }}>
              <motion.div
                whileHover={reduceMotion ? undefined : { scale: 1.03, boxShadow: `0 0 32px rgba(96,184,255,0.5)` }}
                whileTap={{ scale: 0.97 }}
                style={{
                  padding: '13px 28px', borderRadius: 14,
                  background: `linear-gradient(135deg, #ffffff 0%, ${t.accent} 100%)`,
                  color: '#0d1f3c', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  boxShadow: `0 4px 20px rgba(96,184,255,0.3)`,
                }}
              >
                Deploy Concierge
              </motion.div>
            </Link>
            <Link href="/dashboard/chats" style={{ textDecoration: 'none' }}>
              <motion.div
                whileHover={reduceMotion ? undefined : { scale: 1.02, background: t.bgSurfaceHover }}
                whileTap={{ scale: 0.98 }}
                style={{
                  padding: '12px 28px', borderRadius: 14,
                  border: `1px solid ${t.border}`,
                  background: t.bgSurface,
                  backdropFilter: 'blur(12px)',
                  color: t.text, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  transition: 'background 0.15s',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                Unread Chats
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 20, height: 20, borderRadius: 999,
                  background: unreadCount > 0 ? t.accent : 'rgba(255,255,255,0.12)',
                  color: unreadCount > 0 ? '#0d1f3c' : t.textMuted,
                  fontSize: 11, fontWeight: 700, padding: '0 5px',
                  transition: 'background 0.3s, color 0.3s',
                }}>
                  {unreadCount}
                </span>
              </motion.div>
            </Link>
            <Link href="/dashboard/bookings" style={{ textDecoration: 'none' }}>
              <motion.div
                whileHover={reduceMotion ? undefined : { scale: 1.02, background: t.bgSurfaceHover }}
                whileTap={{ scale: 0.98 }}
                style={{
                  padding: '12px 28px', borderRadius: 14,
                  border: `1px solid ${t.border}`,
                  background: t.bgSurface,
                  backdropFilter: 'blur(12px)',
                  color: t.text, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                Reservations
              </motion.div>
            </Link>
          </motion.section>

          {/* Recent activity */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.45 }}
            style={{
              background: 'var(--t-glass-bg)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: `1px solid ${t.border}`,
              borderRadius: 20,
              overflow: 'hidden',
              boxShadow: '0 4px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <div style={{
              padding: '20px 24px',
              borderBottom: `1px solid ${t.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: t.text }}>Recent activity</span>
              <span style={{ fontSize: 12, color: t.textMuted }}>Today</span>
            </div>

            {recentActivity.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: t.textMuted, fontSize: 14 }}>
                Quiet so far — guests will show up here once they start chatting
              </div>
            ) : (
              recentActivity.map((item, i) => {
                const isAI = item.role === 'assistant'
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.07 }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr auto',
                      gap: 14, alignItems: 'center',
                      padding: '14px 24px',
                      borderBottom: i < recentActivity.length - 1 ? `1px solid ${t.borderSoft}` : 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = t.bgSurfaceHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      display: 'grid', placeItems: 'center',
                      background: isAI ? t.accentSoftBg : 'rgba(180,160,255,0.1)',
                      border: `1px solid ${isAI ? t.accentSoftBorder : 'rgba(180,160,255,0.2)'}`,
                      color: isAI ? t.accent : '#b4a0ff',
                      fontSize: 10, fontWeight: 800,
                    }}>
                      {isAI ? 'AI' : 'GU'}
                    </div>
                    <div style={{ fontSize: 13, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 12, color: t.textSubtle, whiteSpace: 'nowrap' }}>
                      {formatRelativeTime(item.timestamp)}
                    </div>
                  </motion.div>
                )
              })
            )}
          </motion.section>

        </main>
      )}
    </DashboardOceanNav>
  )
}

export default DashboardClient
