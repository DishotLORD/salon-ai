'use client'

import { useState, useEffect } from 'react'
import type { CSSProperties } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import AuroraBackground from '@/components/aurora-background'

// ─── CountUp ─────────────────────────────────────────────────────────────────
function CountUp({
  target,
  prefix = '',
  suffix = '',
  formatted = false,
}: {
  target: number
  prefix?: string
  suffix?: string
  formatted?: boolean
}) {
  const [value, setValue] = useState(0)
  const prefersReduced = useReducedMotion()

  useEffect(() => {
    if (prefersReduced) {
      setValue(target)
      return
    }
    const duration = 1800
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, prefersReduced])

  const display = formatted ? value.toLocaleString() : String(value)
  return (
    <span>
      {prefix}
      {display}
      {suffix}
    </span>
  )
}

// ─── Static data ─────────────────────────────────────────────────────────────
const navItems = [
  { label: 'Dashboard', active: true },
  { label: 'Chats', active: false },
  { label: 'Bookings', active: false },
  { label: 'CRM', active: false },
  { label: 'Settings', active: false },
]

const stats = [
  {
    label: 'Revenue',
    target: 14800,
    prefix: '$',
    suffix: '',
    formatted: true,
    trend: '+12.5%',
    trendColor: '#4ade80',
    bars: [20, 28, 24, 36, 42, 38, 48, 56],
  },
  {
    label: 'Bookings',
    target: 47,
    prefix: '',
    suffix: '',
    formatted: false,
    trend: '+8.3%',
    trendColor: '#4ade80',
    bars: [18, 16, 26, 20, 30, 34, 32, 40],
  },
  {
    label: 'Chats',
    target: 18,
    prefix: '',
    suffix: '',
    formatted: false,
    trend: '+8.2%',
    trendColor: '#4ade80',
    bars: [14, 22, 30, 26, 34, 46, 40, 54],
  },
  {
    label: 'Satisfaction',
    target: 96,
    prefix: '',
    suffix: '%',
    formatted: false,
    trend: '+2.0%',
    trendColor: '#4ade80',
    bars: [36, 42, 38, 44, 40, 48, 46, 50],
  },
]

const actions = [
  {
    title: 'Auto-confirmed booking for Emma Johnson',
    time: '2 min ago',
    tint: 'rgba(56,189,248,0.14)',
    icon: 'AI',
  },
  {
    title: "Sent follow-up reminders to tomorrow's VIP clients",
    time: '11 min ago',
    tint: 'rgba(74,222,128,0.14)',
    icon: 'RM',
  },
  {
    title: 'Generated end-of-day operations report',
    time: '26 min ago',
    tint: 'rgba(167,139,250,0.14)',
    icon: 'RP',
  },
  {
    title: 'Escalated a pricing objection to your front desk',
    time: '53 min ago',
    tint: 'rgba(251,191,36,0.14)',
    icon: 'ES',
  },
]

// Separate border into individual properties so Framer Motion can
// animate borderColor independently in whileHover
const cardBase: CSSProperties = {
  background: 'rgba(8,20,40,0.5)',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'rgba(255,255,255,0.07)',
  borderRadius: 16,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
}

const ease = [0.22, 1, 0.36, 1] as const

function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function formatDate() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PreviewPage() {
  const prefersReduced = useReducedMotion()

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#050d1a',
        color: 'white',
        fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)',
        position: 'relative',
      }}
    >
      <AuroraBackground />

      {/* ── SIDEBAR ── */}
      <motion.aside
        initial={prefersReduced ? false : { x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease }}
        style={{
          width: 220,
          flexShrink: 0,
          background: '#0f172a',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 20,
          overflow: 'hidden',
        }}
      >
        {/* Logo — "Ocean" bobs on loop */}
        <div style={{ padding: '32px 0 24px', textAlign: 'center' }}>
          <motion.span
            animate={prefersReduced ? {} : { y: [0, -5, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            style={{
              fontFamily: 'var(--font-playfair)',
              fontSize: 30,
              fontWeight: 700,
              color: '#38bdf8',
              display: 'inline-block',
            }}
          >
            Ocean
          </motion.span>
          <span
            style={{
              fontFamily: 'var(--font-playfair)',
              fontSize: 18,
              fontWeight: 300,
              color: '#475569',
              display: 'block',
              marginTop: 2,
            }}
          >
            Core
          </span>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1 }}>
          {navItems.map((item) => (
            <motion.div
              key={item.label}
              whileHover={prefersReduced ? undefined : { x: 4 }}
              whileTap={prefersReduced ? undefined : { scale: 0.97 }}
              transition={{ duration: 0.15 }}
              style={{
                padding: '10px 20px',
                color: item.active ? '#38bdf8' : '#64748b',
                fontSize: 14,
                cursor: 'pointer',
                background: item.active ? 'rgba(56,189,248,0.08)' : 'transparent',
                borderLeft: `3px solid ${item.active ? '#38bdf8' : 'transparent'}`,
                userSelect: 'none',
              }}
            >
              {item.label}
            </motion.div>
          ))}
        </nav>

        {/* Bottom buttons */}
        <div style={{ padding: '16px 20px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <motion.button
            type="button"
            whileHover={prefersReduced ? undefined : { scale: 1.03, boxShadow: '0 8px 24px rgba(56,189,248,0.3)' }}
            whileTap={prefersReduced ? undefined : { scale: 0.97 }}
            style={{
              width: '100%',
              background: '#0ea5e9',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '10px 0',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Deploy Agent
          </motion.button>
          <button
            type="button"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: '#475569',
              fontSize: 13,
              cursor: 'pointer',
              padding: '6px 0',
              textAlign: 'center',
            }}
          >
            Log out
          </button>
        </div>
      </motion.aside>

      {/* ── MAIN CONTENT ── */}
      <main
        style={{
          flex: 1,
          padding: '32px 40px',
          display: 'grid',
          gap: 24,
          alignContent: 'start',
          position: 'relative',
          zIndex: 10,
          minWidth: 0,
        }}
      >
        {/* ① Hero ── greeting fades up, date 0.15s later */}
        <section style={{ display: 'grid', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div>
              <motion.h1
                initial={prefersReduced ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease }}
                style={{
                  margin: 0,
                  color: 'white',
                  fontSize: 32,
                  fontWeight: 700,
                  fontFamily: 'var(--font-playfair)',
                  letterSpacing: '-0.03em',
                }}
              >
                {getGreeting()}, Marea Restaurant
              </motion.h1>

              <motion.p
                initial={prefersReduced ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.15, ease }}
                style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}
              >
                {formatDate()}
              </motion.p>
            </div>

            <motion.div
              initial={prefersReduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease }}
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
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#4ade80',
                  boxShadow: '0 0 0 6px rgba(74,222,128,0.16)',
                  flexShrink: 0,
                }}
              />
              All systems operational
            </motion.div>
          </div>
        </section>

        {/* ② AI Command card */}
        <motion.section
          initial={prefersReduced ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease }}
          style={{
            ...cardBase,
            padding: '28px 32px',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.3fr) minmax(260px, 0.7fr)',
            gap: 20,
          }}
        >
          {/* Left */}
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
                  fontSize: 30,
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
                Monitor conversations, bookings, and customer activity from one calm command deck
                while OceanCore keeps your front line moving.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              {[
                { label: 'Active chats', value: '18' },
                { label: 'Messages today', value: '47' },
                { label: 'Operator email', value: 'marco@marea.com' },
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
                whileHover={
                  prefersReduced
                    ? undefined
                    : { scale: 1.03, boxShadow: '0 8px 24px rgba(56,189,248,0.3)' }
                }
                whileTap={prefersReduced ? undefined : { scale: 0.97 }}
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
                whileHover={
                  prefersReduced
                    ? undefined
                    : { scale: 1.03, boxShadow: '0 8px 24px rgba(56,189,248,0.3)' }
                }
                whileTap={prefersReduced ? undefined : { scale: 0.97 }}
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

          {/* Right — AI Agent panel */}
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
                      boxShadow: '0 0 0 6px rgba(74,222,128,0.16)',
                      flexShrink: 0,
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
                { label: 'Messages today', value: '47' },
                { label: 'Response time', value: '< 2s' },
                { label: 'Conversations', value: '18' },
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

        {/* ③ Stat cards — CountUp + glow on hover */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 16,
          }}
        >
          {stats.map((stat, i) => (
            <motion.article
              key={stat.label}
              initial={prefersReduced ? false : { opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.26, delay: 0.3 + i * 0.08, ease: [0.4, 0, 0.2, 1] }}
              whileHover={
                prefersReduced
                  ? undefined
                  : {
                      y: -4,
                      boxShadow: '0 20px 40px rgba(56,189,248,0.15)',
                      borderColor: 'rgba(56,189,248,0.25)',
                    }
              }
              style={{
                ...cardBase,
                padding: 20,
                display: 'grid',
                gap: 14,
                cursor: 'default',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
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
                  <div
                    style={{ marginTop: 12, color: 'white', fontSize: 40, fontWeight: 700, lineHeight: 1 }}
                  >
                    <CountUp
                      target={stat.target}
                      prefix={stat.prefix}
                      suffix={stat.suffix}
                      formatted={stat.formatted}
                    />
                  </div>
                </div>
                <span
                  style={{
                    borderRadius: 999,
                    padding: '6px 10px',
                    flexShrink: 0,
                    background: 'rgba(74,222,128,0.12)',
                    color: stat.trendColor,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {stat.trend}
                </span>
              </div>

              {/* Mini bar chart */}
              <div style={{ display: 'flex', alignItems: 'end', gap: 6, height: 56 }}>
                {stat.bars.map((bar, bi) => (
                  <span
                    key={bi}
                    style={{
                      flex: 1,
                      height: `${bar}%`,
                      borderRadius: 999,
                      background:
                        bi > 4
                          ? 'linear-gradient(180deg, rgba(56,189,248,0.95), rgba(56,189,248,0.28))'
                          : 'rgba(255,255,255,0.12)',
                    }}
                  />
                ))}
              </div>
            </motion.article>
          ))}
        </section>

        {/* ④ Recent AI Actions — stagger entrance + hover slide */}
        <motion.section
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, delay: 0.4, ease }}
          style={{ ...cardBase, overflow: 'hidden' }}
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
            <h3 style={{ margin: 0, color: 'white', fontSize: 18, fontWeight: 700 }}>
              Recent AI Actions
            </h3>
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
            {actions.map((action, i) => (
              <motion.div
                key={action.title}
                initial={prefersReduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.45 + i * 0.05, ease }}
                whileHover={
                  prefersReduced
                    ? undefined
                    : { x: 4, backgroundColor: 'rgba(56,189,248,0.04)' }
                }
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 14,
                  alignItems: 'center',
                  padding: '14px 10px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 14,
                  cursor: 'default',
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
                    flexShrink: 0,
                  }}
                >
                  {action.icon}
                </div>
                <div style={{ color: 'white', fontSize: 14 }}>{action.title}</div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {action.time}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>
      </main>
    </div>
  )
}
