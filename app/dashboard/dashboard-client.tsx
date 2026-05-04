'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { fadeUp, oceanTransition } from '@/lib/ocean-motion'
import { card, t } from '@/lib/dashboard-theme'

export type RecentActivity = {
  id: string
  title: string
  timestamp: string
  role: 'assistant' | 'guest'
}

type DashboardClientProps = {
  businessDisplayName: string
  conciergeName: string
  userEmail: string
  activeChats: number
  messageCount: number
  recentActivity: RecentActivity[]
}

function formatRelativeTime(timestamp: string): string {
  const time = new Date(timestamp).getTime()
  if (Number.isNaN(time)) return ''
  const seconds = Math.max(1, Math.floor((Date.now() - time) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatLongDate() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())
}

export function DashboardClient({
  businessDisplayName,
  conciergeName,
  userEmail,
  activeChats,
  messageCount,
  recentActivity,
}: DashboardClientProps) {
  const reduceMotion = useReducedMotion()

  const stats = [
    { label: 'Revenue', value: '$0', trend: '+0.0%', positive: true, bars: [20, 28, 24, 36, 42, 38, 48, 56] },
    { label: 'Reservations', value: '0', trend: '+0.0%', positive: true, bars: [18, 16, 26, 20, 30, 34, 32, 40] },
    { label: 'Chats', value: String(activeChats), trend: activeChats > 0 ? '+8.2%' : '0.0%', positive: true, bars: [14, 22, 30, 26, 34, 46, 40, 54] },
    { label: 'Satisfaction', value: '—', trend: '-2.0%', positive: false, bars: [36, 42, 38, 44, 40, 48, 46, 50] },
  ]

  return (
    <DashboardOceanNav activeNav="Dashboard">
      {({ isMobile, openNav }) => (
        <main style={{ display: 'grid', gap: 24 }}>
          {isMobile ? (
            <motion.button
              type="button"
              onClick={openNav}
              whileHover={reduceMotion ? undefined : { scale: 1.03 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                border: `1px solid ${t.border}`,
                background: t.bgSurface,
                color: t.text,
                fontSize: 22,
                cursor: 'pointer',
                boxShadow: t.shadowSm,
              }}
            >
              ☰
            </motion.button>
          ) : null}

          {/* ── Greeting header ── */}
          <motion.section
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            style={{ display: 'grid', gap: 12 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile ? 'column' : 'row',
                gap: 16,
              }}
            >
              <div>
                <h1
                  style={{
                    margin: 0,
                    color: t.text,
                    fontSize: isMobile ? 28 : 32,
                    fontWeight: 700,
                    fontFamily: 'var(--font-playfair)',
                    letterSpacing: '-0.03em',
                  }}
                >
                  {getGreeting()}, {businessDisplayName}
                </h1>
                <p style={{ margin: '8px 0 0', color: t.textMuted, fontSize: 13 }}>
                  {formatLongDate()}
                </p>
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: `1px solid ${t.successBorder}`,
                  background: t.successBg,
                  color: t.success,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: t.success,
                  }}
                />
                All systems operational
              </div>
            </div>
          </motion.section>

          {/* ── Hero card ── */}
          <motion.section
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={oceanTransition(reduceMotion, { delay: 0.05 })}
            style={{
              ...card,
              padding: isMobile ? '22px 18px' : '28px 32px',
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.3fr) minmax(280px, 0.7fr)',
              gap: 20,
            }}
          >
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <p
                  style={{
                    margin: 0,
                    color: t.accent,
                    fontSize: 11,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Restaurant AI
                </p>
                <h2
                  style={{
                    margin: '10px 0 0',
                    color: t.text,
                    fontSize: isMobile ? 24 : 28,
                    lineHeight: 1.2,
                    fontWeight: 700,
                  }}
                >
                  Your {conciergeName} is live and ready for tonight&apos;s service.
                </h2>
                <p
                  style={{
                    margin: '12px 0 0',
                    maxWidth: 620,
                    color: t.textMuted,
                    fontSize: 14,
                    lineHeight: 1.7,
                  }}
                >
                  Monitor reservations, conversations, and guest activity from one calm command deck while
                  OceanCore keeps your front of house moving.
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                {[
                  { label: 'Active conversations', value: String(activeChats) },
                  { label: 'Messages today', value: String(messageCount) },
                  { label: 'Operator email', value: userEmail || '—' },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${t.border}`,
                      background: t.bgSurfaceMuted,
                      padding: '14px 16px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: t.textMuted,
                        fontWeight: 600,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        color: t.text,
                        fontSize: item.label === 'Operator email' ? 14 : 24,
                        fontWeight: 700,
                        lineHeight: 1.2,
                        wordBreak: 'break-word',
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link href="/dashboard/settings?tab=widget" style={{ textDecoration: 'none' }}>
                  <motion.div
                    whileHover={reduceMotion ? undefined : { y: -1 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                    style={{
                      borderRadius: 10,
                      padding: '11px 18px',
                      background: t.accent,
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Deploy Concierge
                  </motion.div>
                </Link>
                <Link href="/dashboard/bookings" style={{ textDecoration: 'none' }}>
                  <motion.div
                    whileHover={reduceMotion ? undefined : { y: -1 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      padding: '10px 18px',
                      background: t.bgSurface,
                      color: t.text,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Open Reservations
                  </motion.div>
                </Link>
              </div>
            </div>

            {/* Concierge sidebar tile */}
            <div
              style={{
                borderRadius: 14,
                border: `1px solid ${t.accentSoftBorder}`,
                background: t.accentSoftBg,
                padding: 18,
                display: 'grid',
                gap: 16,
                alignContent: 'start',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: t.text, fontSize: 18, fontWeight: 700 }}>{conciergeName}</div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: t.success,
                      }}
                    />
                    <span style={{ color: t.textMuted, fontSize: 13 }}>Online</span>
                  </div>
                </div>
                <div
                  style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    background: '#ffffff',
                    border: `1px solid ${t.accentSoftBorder}`,
                    color: t.accentText,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                  }}
                >
                  Live
                </div>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {[
                  { label: 'Messages today', value: String(messageCount) },
                  { label: 'Response time', value: '< 2s' },
                  { label: 'Conversations', value: String(activeChats) },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderRadius: 10,
                      padding: '10px 14px',
                      background: '#ffffff',
                      border: `1px solid ${t.borderSoft}`,
                    }}
                  >
                    <span style={{ color: t.textMuted, fontSize: 12 }}>{item.label}</span>
                    <span style={{ color: t.text, fontWeight: 700, fontSize: 16 }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          {/* ── KPI tiles ── */}
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
              gap: 16,
            }}
          >
            {stats.map((stat, index) => (
              <motion.article
                key={stat.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={oceanTransition(reduceMotion, {
                  duration: 0.26,
                  delay: 0.08 + index * 0.06,
                })}
                whileHover={reduceMotion ? undefined : { y: -2 }}
                style={{ ...card, padding: 20, display: 'grid', gap: 14 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div
                      style={{
                        color: t.textMuted,
                        fontSize: 11,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                      }}
                    >
                      {stat.label}
                    </div>
                    <div style={{ marginTop: 12, color: t.text, fontSize: 36, fontWeight: 700, lineHeight: 1 }}>
                      {stat.value}
                    </div>
                  </div>
                  <span
                    style={{
                      borderRadius: 999,
                      padding: '4px 10px',
                      background: stat.positive ? t.successBg : t.dangerBg,
                      border: `1px solid ${stat.positive ? t.successBorder : t.dangerBorder}`,
                      color: stat.positive ? t.success : t.danger,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {stat.trend}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'end', gap: 6, height: 56 }}>
                  {stat.bars.map((bar, barIndex) => (
                    <span
                      key={`${stat.label}-${barIndex}`}
                      style={{
                        flex: 1,
                        height: `${bar}%`,
                        borderRadius: 999,
                        background: barIndex > 4 ? t.accent : '#e2e8f0',
                      }}
                    />
                  ))}
                </div>
              </motion.article>
            ))}
          </section>

          {/* ── Recent activity ── */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={oceanTransition(reduceMotion, { delay: 0.22, duration: 0.28 })}
            style={{ ...card, overflow: 'hidden' }}
          >
            <div
              style={{
                padding: '18px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                borderBottom: `1px solid ${t.border}`,
              }}
            >
              <h3 style={{ margin: 0, color: t.text, fontSize: 17, fontWeight: 700 }}>Recent Concierge Activity</h3>
              <span
                style={{
                  borderRadius: 999,
                  padding: '4px 12px',
                  background: t.bgSurfaceMuted,
                  color: t.textMuted,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Today
              </span>
            </div>

            <div style={{ padding: '4px 8px 8px' }}>
              {recentActivity.length === 0 ? (
                <div
                  style={{
                    padding: '36px 16px',
                    textAlign: 'center',
                    color: t.textMuted,
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  No activity yet — once guests start chatting with {conciergeName}, you&apos;ll see live activity here.
                </div>
              ) : (
                recentActivity.map((activity, index) => {
                  const isAssistant = activity.role === 'assistant'
                  return (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={oceanTransition(reduceMotion, {
                        duration: 0.2,
                        delay: 0.28 + index * 0.06,
                      })}
                      whileHover={reduceMotion ? undefined : { backgroundColor: t.bgSurfaceMuted }}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto',
                        gap: 14,
                        alignItems: 'center',
                        padding: '12px 14px',
                        borderBottom:
                          index === recentActivity.length - 1
                            ? 'none'
                            : `1px solid ${t.borderSoft}`,
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          background: isAssistant ? t.accentSoftBg : '#f3e8ff',
                          color: isAssistant ? t.accentText : '#7e22ce',
                          fontSize: 11,
                          fontWeight: 700,
                          border: `1px solid ${isAssistant ? t.accentSoftBorder : '#e9d5ff'}`,
                        }}
                      >
                        {isAssistant ? 'AI' : 'GU'}
                      </div>
                      <div style={{ color: t.text, fontSize: 14, lineHeight: 1.5 }}>{activity.title}</div>
                      <div style={{ color: t.textSubtle, fontSize: 12, whiteSpace: 'nowrap' }}>
                        {formatRelativeTime(activity.timestamp)}
                      </div>
                    </motion.div>
                  )
                })
              )}
            </div>
          </motion.section>
        </main>
      )}
    </DashboardOceanNav>
  )
}

export default DashboardClient
