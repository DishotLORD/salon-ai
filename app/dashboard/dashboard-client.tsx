'use client'

import { motion, useReducedMotion } from 'framer-motion'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { fadeUp, oceanTransition } from '@/lib/ocean-motion'

type DashboardClientProps = {
  businessDisplayName: string
  userEmail: string
  activeChats: number
  messageCount: number
}

const actions = [
  {
    title: 'Auto-confirmed booking for Emma Johnson',
    time: '2 min ago',
    tint: 'rgba(56, 189, 248, 0.14)',
    icon: 'AI',
  },
  {
    title: 'Sent follow-up reminders to tomorrow’s VIP clients',
    time: '11 min ago',
    tint: 'rgba(74, 222, 128, 0.14)',
    icon: 'RM',
  },
  {
    title: 'Generated end-of-day operations report',
    time: '26 min ago',
    tint: 'rgba(167, 139, 250, 0.14)',
    icon: 'RP',
  },
  {
    title: 'Escalated a pricing objection to your front desk',
    time: '53 min ago',
    tint: 'rgba(251, 191, 36, 0.14)',
    icon: 'ES',
  },
]

const cardBase = {
  background: 'rgba(8, 20, 40, 0.5)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.28)',
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) {
    return 'Good morning'
  }
  if (hour < 18) {
    return 'Good afternoon'
  }
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
  userEmail,
  activeChats,
  messageCount,
}: DashboardClientProps) {
  const reduceMotion = useReducedMotion()

  const stats = [
    {
      label: 'Revenue',
      value: '$0',
      trend: '+0.0%',
      trendColor: '#4ade80',
      bars: [20, 28, 24, 36, 42, 38, 48, 56],
    },
    {
      label: 'Bookings',
      value: '0',
      trend: '+0.0%',
      trendColor: '#4ade80',
      bars: [18, 16, 26, 20, 30, 34, 32, 40],
    },
    {
      label: 'Chats',
      value: String(activeChats),
      trend: activeChats > 0 ? '+8.2%' : '0.0%',
      trendColor: '#4ade80',
      bars: [14, 22, 30, 26, 34, 46, 40, 54],
    },
    {
      label: 'Satisfaction',
      value: '—',
      trend: '-2.0%',
      trendColor: '#f87171',
      bars: [36, 42, 38, 44, 40, 48, 46, 50],
    },
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
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(5, 20, 40, 0.5)',
                color: 'white',
                fontSize: 22,
                cursor: 'pointer',
              }}
            >
              ☰
            </motion.button>
          ) : null}

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
                    color: 'white',
                    fontSize: isMobile ? 28 : 32,
                    fontWeight: 700,
                    fontFamily: 'var(--font-playfair)',
                    letterSpacing: '-0.03em',
                  }}
                >
                  {getGreeting()}, {businessDisplayName}
                </h1>
                <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                  {formatLongDate()}
                </p>
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.82)',
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#4ade80',
                    boxShadow: '0 0 0 6px rgba(74, 222, 128, 0.16)',
                  }}
                />
                All systems operational
              </div>
            </div>
          </motion.section>

          <motion.section
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={oceanTransition(reduceMotion, { delay: 0.05 })}
            style={{
              ...cardBase,
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
                    color: '#38bdf8',
                    fontSize: 12,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}
                >
                  OceanCore Command
                </p>
                <h2
                  style={{
                    margin: '10px 0 0',
                    color: 'white',
                    fontSize: isMobile ? 24 : 30,
                    lineHeight: 1.1,
                    fontWeight: 700,
                  }}
                >
                  Your AI operator is live and ready for the next client wave.
                </h2>
                <p
                  style={{
                    margin: '12px 0 0',
                    maxWidth: 620,
                    color: 'rgba(255,255,255,0.72)',
                    fontSize: 14,
                    lineHeight: 1.7,
                  }}
                >
                  Monitor conversations, bookings, and customer activity from one calm command deck while
                  OceanCore keeps your front line moving.
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
                  { label: 'Active chats', value: String(activeChats) },
                  { label: 'Messages today', value: String(messageCount) },
                  { label: 'Operator email', value: userEmail || '—' },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      borderRadius: 16,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.04)',
                      padding: '14px 16px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.38)',
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        color: 'white',
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
                <motion.button
                  type="button"
                  whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                  style={{
                    border: 'none',
                    borderRadius: 14,
                    padding: '12px 18px',
                    background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    boxShadow: '0 12px 30px rgba(14,165,233,0.28)',
                    cursor: 'pointer',
                  }}
                >
                  Deploy Agent
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={reduceMotion ? undefined : { y: -2 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                  style={{
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.12)',
                    padding: '12px 18px',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.82)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  View Reports
                </motion.button>
              </div>
            </div>

            <div
              style={{
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.08)',
                background:
                  'linear-gradient(160deg, rgba(255,255,255,0.08) 0%, rgba(5,20,40,0.38) 42%, rgba(56,189,248,0.08) 100%)',
                padding: 18,
                display: 'grid',
                gap: 16,
                alignContent: 'start',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: 'white', fontSize: 18, fontWeight: 700 }}>AI Agent</div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#4ade80',
                        boxShadow: '0 0 0 6px rgba(74, 222, 128, 0.16)',
                      }}
                    />
                    <span style={{ color: 'rgba(255,255,255,0.74)', fontSize: 13 }}>Online</span>
                  </div>
                </div>
                <div
                  style={{
                    padding: '7px 10px',
                    borderRadius: 999,
                    background: 'rgba(56,189,248,0.08)',
                    border: '1px solid rgba(56,189,248,0.18)',
                    color: '#38bdf8',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                  }}
                >
                  Live
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
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
                      borderRadius: 14,
                      padding: '12px 14px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12 }}>{item.label}</span>
                    <span style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

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
                initial={{ opacity: 0, scale: 0.97, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={oceanTransition(reduceMotion, {
                  duration: 0.26,
                  delay: 0.08 + index * 0.08,
                  ease: [0.4, 0, 0.2, 1],
                })}
                whileHover={reduceMotion ? undefined : { y: -4 }}
                style={{
                  ...cardBase,
                  padding: 20,
                  display: 'grid',
                  gap: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div
                      style={{
                        color: 'rgba(255,255,255,0.4)',
                        fontSize: 11,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {stat.label}
                    </div>
                    <div style={{ marginTop: 12, color: 'white', fontSize: 40, fontWeight: 700, lineHeight: 1 }}>
                      {stat.value}
                    </div>
                  </div>
                  <span
                    style={{
                      borderRadius: 999,
                      padding: '6px 10px',
                      background:
                        stat.trendColor === '#f87171' ? 'rgba(248,113,113,0.12)' : 'rgba(74,222,128,0.12)',
                      color: stat.trendColor,
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
                        background:
                          barIndex > 4
                            ? 'linear-gradient(180deg, rgba(56,189,248,0.95), rgba(56,189,248,0.28))'
                            : 'rgba(255,255,255,0.12)',
                      }}
                    />
                  ))}
                </div>
              </motion.article>
            ))}
          </section>

          <motion.section
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={oceanTransition(reduceMotion, { delay: 0.22, duration: 0.28 })}
            style={{
              ...cardBase,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '20px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <h3 style={{ margin: 0, color: 'white', fontSize: 18, fontWeight: 700 }}>Recent AI Actions</h3>
              <span
                style={{
                  borderRadius: 999,
                  padding: '6px 10px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Today
              </span>
            </div>

            <div style={{ padding: '8px 16px 14px' }}>
              {actions.map((action, index) => (
                <motion.div
                  key={action.title}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={oceanTransition(reduceMotion, {
                    duration: 0.2,
                    delay: 0.28 + index * 0.08,
                  })}
                  whileHover={reduceMotion ? undefined : { backgroundColor: 'rgba(255,255,255,0.03)' }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 14,
                    alignItems: 'center',
                    padding: '14px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 14,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      background: action.tint,
                      color: 'white',
                      fontSize: 11,
                      fontWeight: 700,
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {action.icon}
                  </div>
                  <div style={{ color: 'white', fontSize: 14 }}>{action.title}</div>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>{action.time}</div>
                </motion.div>
              ))}
            </div>
          </motion.section>
        </main>
      )}
    </DashboardOceanNav>
  )
}

export default DashboardClient
