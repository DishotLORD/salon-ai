'use client'

import { motion } from 'framer-motion'

const navItems = [
  { label: 'Dashboard', active: true },
  { label: 'Chats', active: false },
  { label: 'Bookings', active: false },
  { label: 'CRM', active: false },
  { label: 'Settings', active: false },
]

const stats = [
  { label: 'Revenue', value: '$12.4K', trend: '+8.2%' },
  { label: 'Bookings', value: '184', trend: '+12.1%' },
  { label: 'Chats', value: '67', trend: '+4.5%' },
  { label: 'Satisfaction', value: '97%', trend: '+1.2%' },
]

const activities = [
  { title: 'Emma Johnson booked a Deluxe Facial', time: '2 min ago' },
  { title: 'AI Agent handled refund question', time: '9 min ago' },
  { title: 'Reminder sent for tomorrow appointments', time: '26 min ago' },
  { title: 'New lead added to CRM: David Park', time: '41 min ago' },
]

const glass = {
  background: 'rgba(255,255,255,0.05)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20,
} as const

export default function DashboardPreviewPage() {
  const date = 'Sunday, Apr 26'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(1200px 700px at 80% -10%, rgba(59,130,246,0.16), transparent 55%), #0a0a0a',
        color: '#ffffff',
        fontFamily: 'Inter, var(--font-geist-sans), system-ui, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '20px 24px 40px',
        }}
      >
        <header
          style={{
            ...glass,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 16,
            zIndex: 5,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff' }}>
            Ocean<span style={{ color: '#0ea5e9' }}>Core</span>
          </div>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                style={{
                  border: 'none',
                  borderRadius: 999,
                  padding: '8px 12px',
                  background: item.active ? 'rgba(14,165,233,0.18)' : 'transparent',
                  color: item.active ? '#bae6fd' : 'rgba(255,255,255,0.62)',
                  fontSize: 13,
                  fontWeight: item.active ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'background 0.18s ease, color 0.18s ease',
                }}
                onMouseEnter={(e) => {
                  if (!item.active) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                }}
                onMouseLeave={(e) => {
                  if (!item.active) e.currentTarget.style.background = 'transparent'
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.24)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 13,
            }}
          >
            AD
          </div>
        </header>

        <main style={{ paddingTop: 34 }}>
          <section style={{ marginBottom: 24 }}>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {date}
            </p>
            <h1
              style={{
                margin: '8px 0 0',
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                background: 'linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.6) 100%)',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
              }}
            >
              Good morning
            </h1>
          </section>

          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 14,
              marginBottom: 20,
            }}
          >
            {stats.map((s, idx) => (
              <motion.article
                key={s.label}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, delay: idx * 0.05 }}
                whileHover={{
                  scale: 1.02,
                  y: -4,
                  borderColor: 'rgba(255,255,255,0.15)',
                  boxShadow: '0 0 30px rgba(14,165,233,0.16)',
                }}
                style={{
                  ...glass,
                  padding: 18,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.4)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                  }}
                >
                  {s.label}
                </p>
                <p style={{ margin: '12px 0 8px', fontSize: 48, fontWeight: 700, lineHeight: 1, color: '#ffffff' }}>{s.value}</p>
                <p style={{ margin: 0, fontSize: 13, color: '#7dd3fc' }}>{s.trend}</p>
              </motion.article>
            ))}
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: '1.45fr 0.85fr', gap: 14 }}>
            <motion.article
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, delay: 0.2 }}
              whileHover={{
                scale: 1.02,
                y: -4,
                borderColor: 'rgba(255,255,255,0.15)',
                boxShadow: '0 0 30px rgba(14,165,233,0.14)',
              }}
              style={{ ...glass, padding: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em' }}>Recent activity</h2>
                <button
                  type="button"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#0ea5e9',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  View all
                </button>
              </div>
              <div style={{ display: 'grid' }}>
                {activities.map((a, idx) => (
                  <div
                    key={a.title}
                    style={{
                      padding: '13px 10px',
                      borderTop: idx === 0 ? '1px solid rgba(255,255,255,0.06)' : undefined,
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 10,
                      transition: 'background 0.18s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 14, color: '#ffffff' }}>{a.title}</p>
                    <p style={{ margin: '5px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{a.time}</p>
                  </div>
                ))}
              </div>
            </motion.article>

            <motion.article
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, delay: 0.25 }}
              whileHover={{
                scale: 1.02,
                y: -4,
                borderColor: 'rgba(255,255,255,0.15)',
                boxShadow: '0 0 38px rgba(96,165,250,0.22)',
              }}
              style={{
                ...glass,
                padding: 16,
                position: 'relative',
              }}
            >
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: -1,
                  borderRadius: 20,
                  pointerEvents: 'none',
                  background: 'linear-gradient(130deg, rgba(59,130,246,0.35), rgba(168,85,247,0.28), rgba(14,165,233,0.35))',
                  filter: 'blur(18px)',
                  opacity: 0.35,
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.4)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  position: 'relative',
                }}
              >
                AI Agent
              </p>
              <h3 style={{ margin: '10px 0 0', fontSize: 32, fontWeight: 600, position: 'relative' }}>Ocean Assistant</h3>
              <div
                style={{
                  marginTop: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 999,
                  background: 'rgba(34,197,94,0.12)',
                  color: '#86efac',
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#22c55e',
                    boxShadow: '0 0 12px #22c55e',
                  }}
                />
                Online
              </div>

              <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 14,
                    padding: 10,
                    position: 'relative',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Avg response time</p>
                  <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 620 }}>{'< 1 second'}</p>
                </div>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 14,
                    padding: 10,
                    position: 'relative',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Handled today</p>
                  <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 620 }}>142 conversations</p>
                </div>
              </div>

              <button
                type="button"
                style={{
                  marginTop: 14,
                  width: '100%',
                  border: '1px solid rgba(14,165,233,0.45)',
                  borderRadius: 12,
                  background: 'rgba(14,165,233,0.12)',
                  color: '#7dd3fc',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '10px 10px',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                Configure Agent
              </button>
            </motion.article>
          </section>
        </main>
      </div>
    </div>
  )
}
