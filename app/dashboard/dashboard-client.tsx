'use client'

import { motion } from 'framer-motion'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { fadeUp, staggerChildren } from '@/lib/ocean-motion'

const revenueBarsZero = [6, 6, 6, 6, 6, 6, 6, 6]

const actions = [
  { icon: '🤖', text: 'Auto-confirmed booking for Emma Johnson', time: '2 min ago' },
  { icon: '📩', text: 'Sent reminder to 6 clients for tomorrow', time: '11 min ago' },
  { icon: '🧾', text: 'Generated daily booking summary report', time: '26 min ago' },
  { icon: '🧠', text: 'Resolved cancellation request with rebook option', time: '53 min ago' },
]

const card = {
  borderRadius: 'var(--ocean-radius-lg)' as const,
  border: '1px solid var(--ocean-border)',
  background: 'var(--ocean-card)',
  boxShadow: 'var(--ocean-shadow-md)',
}

type DashboardClientProps = {
  businessDisplayName: string
  userEmail: string
  activeChats: number
  messageCount: number
}

export function DashboardClient({ businessDisplayName, userEmail, activeChats, messageCount }: DashboardClientProps) {
  const revenueDisplay = '$0'
  const bookingsDisplay = '0'
  const satisfactionDisplay = '0%'

  return (
    <DashboardOceanNav activeNav="Dashboard">
      {({ isMobile, openNav }) => (
        <main style={{ flex: 1, padding: isMobile ? '16px 14px 24px' : '30px 32px 36px', overflow: 'auto' }}>
          {isMobile && (
            <div style={{ marginBottom: 12 }}>
              <motion.button
                type="button"
                aria-label="Open menu"
                onClick={openNav}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                style={{
                  border: '1px solid var(--ocean-border)',
                  borderRadius: 'var(--ocean-radius-md)',
                  background: 'var(--ocean-surface)',
                  color: 'var(--ocean-text)',
                  width: 44,
                  height: 44,
                  fontSize: 22,
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                ☰
              </motion.button>
            </div>
          )}

          <motion.section
            variants={staggerChildren}
            initial="hidden"
            animate="visible"
            style={{
              ...card,
              padding: 24,
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1.2fr minmax(240px, 0.8fr)',
              gap: 20,
              marginBottom: 20,
            }}
          >
            <motion.div variants={fadeUp}>
              <div
                style={{
                  display: 'inline-flex',
                  background: 'rgba(74, 222, 128, 0.12)',
                  color: 'var(--ocean-success)',
                  border: '1px solid rgba(74, 222, 128, 0.35)',
                  padding: '6px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 14,
                }}
              >
                System Status: Healthy
              </div>
              <h1 style={{ margin: 0, fontSize: isMobile ? 30 : 40, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
                Welcome back, {businessDisplayName} — your AI is active.
              </h1>
              <p style={{ margin: '12px 0 0', fontSize: 15, color: 'var(--ocean-text-muted)', maxWidth: 620 }}>
                {activeChats} active chats · {messageCount} messages
              </p>
              <p style={{ margin: '7px 0 0', color: 'var(--ocean-text-subtle)', fontSize: 13 }}>{userEmail}</p>
              <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    border: 'none',
                    borderRadius: 'var(--ocean-radius-md)',
                    background: 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)',
                    color: 'var(--ocean-black)',
                    fontWeight: 700,
                    fontSize: 14,
                    padding: '11px 16px',
                    cursor: 'pointer',
                    boxShadow: 'var(--ocean-shadow-glow)',
                  }}
                >
                  Deploy Agent
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    borderRadius: 'var(--ocean-radius-md)',
                    background: 'transparent',
                    color: 'var(--ocean-text)',
                    fontWeight: 600,
                    fontSize: 14,
                    padding: '10px 15px',
                    border: '1px solid var(--ocean-border-strong)',
                    cursor: 'pointer',
                  }}
                >
                  View Reports
                </motion.button>
              </div>
            </motion.div>
            <motion.div
              variants={fadeUp}
              style={{
                borderRadius: 'var(--ocean-radius-lg)',
                background:
                  'linear-gradient(145deg, var(--ocean-ink) 0%, var(--ocean-surface) 45%, rgba(56, 189, 248, 0.15) 100%)',
                minHeight: 220,
                position: 'relative',
                overflow: 'hidden',
                border: '1px solid var(--ocean-border)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage:
                    'linear-gradient(rgba(125,211,252,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,0.06) 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                  opacity: 0.35,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  width: 160,
                  height: 160,
                  borderRadius: 999,
                  background: 'radial-gradient(circle, rgba(232,220,200,0.25) 0%, transparent 70%)',
                  filter: 'blur(8px)',
                  top: -40,
                  right: -20,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  width: 180,
                  height: 180,
                  borderRadius: 999,
                  background: 'radial-gradient(circle, rgba(56,189,248,0.35) 0%, transparent 72%)',
                  filter: 'blur(12px)',
                  bottom: -50,
                  left: -40,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  padding: 20,
                  display: 'flex',
                  alignItems: 'flex-end',
                }}
              >
                <div
                  style={{
                    borderRadius: 'var(--ocean-radius-md)',
                    padding: '12px 14px',
                    border: '1px solid var(--ocean-border-strong)',
                    background: 'rgba(6, 16, 24, 0.55)',
                    backdropFilter: 'blur(8px)',
                    color: 'var(--ocean-text)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>AI Agent Active</p>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 6,
                      color: 'var(--ocean-sky-bright)',
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 999,
                        background: 'var(--ocean-success)',
                        boxShadow: '0 0 0 6px rgba(74, 222, 128, 0.2)',
                      }}
                    />
                    Live monitoring enabled
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.section>

          <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
            <motion.article
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2 }}
              style={{ ...card, padding: 16 }}
            >
              <p style={{ margin: 0, color: 'var(--ocean-text-muted)', fontSize: 13 }}>Estimated Revenue</p>
              <p style={{ margin: '8px 0 14px', fontSize: 30, fontWeight: 700 }}>{revenueDisplay}</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 74 }}>
                {revenueBarsZero.map((bar, idx) => (
                  <div
                    key={`bar-${bar}-${idx}`}
                    style={{
                      flex: 1,
                      borderRadius: 6,
                      height: `${bar}%`,
                      background:
                        idx > 4
                          ? 'linear-gradient(180deg, var(--ocean-sky-bright), var(--ocean-sky))'
                          : 'rgba(56, 189, 248, 0.35)',
                    }}
                  />
                ))}
              </div>
            </motion.article>

            <motion.article
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2 }}
              style={{ ...card, padding: 16 }}
            >
              <p style={{ margin: 0, color: 'var(--ocean-text-muted)', fontSize: 13 }}>Total Bookings</p>
              <p style={{ margin: '8px 0 16px', fontSize: 30, fontWeight: 700 }}>{bookingsDisplay}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {['A', 'M', 'J', 'S', '+12'].map((item, idx) => (
                  <span
                    key={`avatar-${item}`}
                    style={{
                      width: 31,
                      height: 31,
                      borderRadius: 999,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      color: idx === 4 ? 'var(--ocean-sand-deep)' : 'var(--ocean-text)',
                      background: idx === 4 ? 'rgba(232, 220, 200, 0.2)' : 'var(--ocean-surface)',
                      border: '1px solid var(--ocean-border)',
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </motion.article>

            <motion.article
              whileHover={{ y: -2 }}
              transition={{ duration: 0.2 }}
              style={{ ...card, padding: 16 }}
            >
              <p style={{ margin: 0, color: 'var(--ocean-text-muted)', fontSize: 13 }}>Satisfaction Rate</p>
              <p style={{ margin: '8px 0 10px', fontSize: 30, fontWeight: 700 }}>{satisfactionDisplay}</p>
              <div
                style={{
                  width: '100%',
                  height: 10,
                  borderRadius: 999,
                  background: 'var(--ocean-surface)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: '0%',
                    height: '100%',
                    borderRadius: 999,
                    background: 'linear-gradient(90deg, var(--ocean-sky), var(--ocean-sand-deep))',
                  }}
                />
              </div>
              <p style={{ margin: '8px 0 0', color: 'var(--ocean-text-muted)', fontSize: 12 }}>No trend data yet</p>
            </motion.article>
          </section>

          <section
            style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1.4fr minmax(240px, 0.8fr)',
              gap: 14,
            }}
          >
            <article style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--ocean-border)' }}>
                <h3 style={{ margin: 0, fontSize: 18 }}>Recent AI Actions</h3>
              </div>
              <div style={{ padding: '4px 14px 14px' }}>
                {actions.map((action) => (
                  <motion.div
                    key={`${action.text}-${action.time}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                    whileHover={{ backgroundColor: 'rgba(56, 189, 248, 0.06)' }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr auto',
                      gap: 10,
                      alignItems: 'center',
                      borderBottom: '1px solid var(--ocean-border)',
                      padding: '12px 8px',
                      borderRadius: 'var(--ocean-radius-sm)',
                    }}
                  >
                    <motion.span
                      whileHover={{ rotate: [0, -8, 8, 0], scale: 1.05 }}
                      transition={{ duration: 0.45 }}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        display: 'grid',
                        placeItems: 'center',
                        background: 'var(--ocean-surface)',
                        border: '1px solid var(--ocean-border)',
                      }}
                    >
                      {action.icon}
                    </motion.span>
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--ocean-text)' }}>{action.text}</p>
                    <span style={{ margin: 0, fontSize: 12, color: 'var(--ocean-text-subtle)' }}>{action.time}</span>
                  </motion.div>
                ))}
              </div>
            </article>

            <article
              style={{
                borderRadius: 'var(--ocean-radius-lg)',
                background: 'linear-gradient(165deg, var(--ocean-surface) 0%, var(--ocean-ink) 70%, var(--ocean-black) 100%)',
                color: 'var(--ocean-text)',
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 220,
                border: '1px solid var(--ocean-border)',
                boxShadow: 'var(--ocean-shadow-md)',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>AI Agent</p>
                <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ocean-success)', fontWeight: 600 }}>● Online</p>
              </div>
              <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
                {[
                  ['Messages today', String(messageCount)],
                  ['Response time', '< 1s'],
                  ['Conversations handled', String(activeChats)],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    style={{
                      background: 'rgba(56, 189, 248, 0.08)',
                      borderRadius: 'var(--ocean-radius-md)',
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: '1px solid var(--ocean-border)',
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--ocean-text-muted)' }}>{label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ocean-sky-bright)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </main>
      )}
    </DashboardOceanNav>
  )
}
