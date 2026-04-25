'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { DashboardLogoutButton } from '@/components/dashboard-logout-button'

const navItems = ['Dashboard', 'Chats', 'Calendar', 'Bookings', 'CRM', 'Settings']
const navLinks: Record<string, string> = {
  Dashboard: '/dashboard',
  Chats: '/dashboard/chats',
  Calendar: '/dashboard/bookings',
  Bookings: '/dashboard/bookings',
  CRM: '/dashboard/crm',
  Settings: '/dashboard/settings',
}

const revenueBarsZero = [6, 6, 6, 6, 6, 6, 6, 6]

const actions = [
  { icon: '🤖', text: 'Auto-confirmed booking for Emma Johnson', time: '2 min ago' },
  { icon: '📩', text: 'Sent reminder to 6 clients for tomorrow', time: '11 min ago' },
  { icon: '🧾', text: 'Generated daily booking summary report', time: '26 min ago' },
  { icon: '🧠', text: 'Resolved cancellation request with rebook option', time: '53 min ago' },
]

type DashboardClientProps = {
  businessDisplayName: string
  userEmail: string
  activeChats: number
  messageCount: number
}

export function DashboardClient({ businessDisplayName, userEmail, activeChats, messageCount }: DashboardClientProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  useEffect(() => {
    function syncViewport() {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) {
        setIsDrawerOpen(false)
      }
    }
    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])

  const revenueDisplay = '$0'
  const bookingsDisplay = '0'
  const satisfactionDisplay = '0%'

  const sidebar = (
    <aside
      style={{
        width: 258,
        background: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        padding: '24px 14px 20px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          margin: '0 12px 6px',
        }}
      >
        <img
          src="/logo.png"
          alt=""
          width={40}
          height={40}
          style={{ display: 'block', width: 40, height: 40 }}
        />
        <p
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.24em',
            color: '#ef4444',
            margin: 0,
          }}
        >
          Salon AI
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 12px 24px' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Operations</h2>
        {isMobile && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setIsDrawerOpen(false)}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 26,
              lineHeight: 1,
              color: '#374151',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        )}
      </div>
      <nav style={{ display: 'grid', gap: 6 }}>
        {navItems.map((item) => {
          const isActive = item === 'Dashboard'
          return (
            <Link
              key={item}
              href={navLinks[item] ?? '#'}
              onClick={() => setIsDrawerOpen(false)}
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
      <div style={{ marginTop: 'auto', padding: '0 8px', display: 'grid', gap: 10 }}>
        <DashboardLogoutButton />
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
  )

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f3f4f6',
        color: '#111827',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {!isMobile && sidebar}

        {isMobile && isDrawerOpen && (
          <div
            onClick={() => setIsDrawerOpen(false)}
            role="presentation"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(17, 24, 39, 0.45)',
              zIndex: 40,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              role="presentation"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 258,
                boxShadow: '0 12px 24px rgba(0, 0, 0, 0.2)',
              }}
            >
              {sidebar}
            </div>
          </div>
        )}

        <main style={{ flex: 1, padding: isMobile ? '16px 14px 24px' : '30px 32px 36px' }}>
          {isMobile && (
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setIsDrawerOpen(true)}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  background: '#fff',
                  color: '#374151',
                  width: 40,
                  height: 40,
                  fontSize: 23,
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                ☰
              </button>
            </div>
          )}

          <section
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: 18,
              padding: 24,
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1.2fr minmax(240px, 0.8fr)',
              gap: 20,
              marginBottom: 20,
            }}
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  background: '#ecfdf5',
                  color: '#166534',
                  border: '1px solid #bbf7d0',
                  padding: '6px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 14,
                }}
              >
                System Status: Healthy
              </div>
              <h1 style={{ margin: 0, fontSize: isMobile ? 34 : 42, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
                Welcome back, {businessDisplayName} — your AI is active.
              </h1>
              <p style={{ margin: '12px 0 0', fontSize: 15, color: '#4b5563', maxWidth: 620 }}>
                {activeChats} active chats · {messageCount} messages
              </p>
              <p style={{ margin: '7px 0 0', color: '#9ca3af', fontSize: 13 }}>Welcome back, {userEmail}</p>
              <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  style={{
                    border: 'none',
                    borderRadius: 10,
                    background: '#dc2626',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 14,
                    padding: '11px 16px',
                    cursor: 'pointer',
                  }}
                >
                  Deploy Agent
                </button>
                <button
                  type="button"
                  style={{
                    borderRadius: 10,
                    background: 'transparent',
                    color: '#374151',
                    fontWeight: 600,
                    fontSize: 14,
                    padding: '10px 15px',
                    border: '1px solid #d1d5db',
                    cursor: 'pointer',
                  }}
                >
                  View Reports
                </button>
              </div>
            </div>
            <div
              style={{
                borderRadius: 14,
                background:
                  'radial-gradient(circle at 20% 20%, rgba(248, 113, 113, 0.35), rgba(37, 99, 235, 0.2) 50%, rgba(15, 23, 42, 0.98) 100%)',
                minHeight: 220,
                position: 'relative',
                overflow: 'hidden',
                border: '1px solid #dbeafe',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <div style={{ textAlign: 'center', color: '#fff' }}>
                  <p style={{ margin: 0, fontSize: 66, lineHeight: 1 }}>🤖</p>
                  <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.86 }}>AI Concierge Image Placeholder</p>
                </div>
              </div>
            </div>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
            <article
              style={{
                borderRadius: 14,
                border: '1px solid #e5e7eb',
                background: '#ffffff',
                padding: 16,
              }}
            >
              <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>Estimated Revenue</p>
              <p style={{ margin: '8px 0 14px', fontSize: 30, fontWeight: 700 }}>{revenueDisplay}</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 74 }}>
                {revenueBarsZero.map((bar, idx) => (
                  <div
                    key={`bar-${bar}-${idx}`}
                    style={{
                      flex: 1,
                      borderRadius: 6,
                      height: `${bar}%`,
                      background: idx > 4 ? '#dc2626' : '#fca5a5',
                    }}
                  />
                ))}
              </div>
            </article>

            <article
              style={{
                borderRadius: 14,
                border: '1px solid #e5e7eb',
                background: '#ffffff',
                padding: 16,
              }}
            >
              <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>Total Bookings</p>
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
                      color: idx === 4 ? '#b91c1c' : '#1f2937',
                      background: idx === 4 ? '#fee2e2' : '#f3f4f6',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </article>

            <article
              style={{
                borderRadius: 14,
                border: '1px solid #e5e7eb',
                background: '#ffffff',
                padding: 16,
              }}
            >
              <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>Satisfaction Rate</p>
              <p style={{ margin: '8px 0 10px', fontSize: 30, fontWeight: 700 }}>{satisfactionDisplay}</p>
              <div
                style={{
                  width: '100%',
                  height: 10,
                  borderRadius: 999,
                  background: '#e5e7eb',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: '0%',
                    height: '100%',
                    borderRadius: 999,
                    background: 'linear-gradient(90deg, #f87171, #dc2626)',
                  }}
                />
              </div>
              <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 12 }}>No trend data yet</p>
            </article>
          </section>

          <section
            style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1.4fr minmax(240px, 0.8fr)',
              gap: 14,
            }}
          >
            <article
              style={{
                borderRadius: 14,
                border: '1px solid #e5e7eb',
                background: '#ffffff',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9' }}>
                <h3 style={{ margin: 0, fontSize: 18 }}>Recent AI Actions</h3>
              </div>
              <div style={{ padding: '4px 14px 14px' }}>
                {actions.map((action) => (
                  <div
                    key={`${action.text}-${action.time}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr auto',
                      gap: 10,
                      alignItems: 'center',
                      borderBottom: '1px solid #f3f4f6',
                      padding: '12px 4px',
                    }}
                  >
                    <span
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        display: 'grid',
                        placeItems: 'center',
                        background: '#f9fafb',
                        border: '1px solid #e5e7eb',
                      }}
                    >
                      {action.icon}
                    </span>
                    <p style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>{action.text}</p>
                    <span style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>{action.time}</span>
                  </div>
                ))}
              </div>
            </article>

            <article
              style={{
                borderRadius: 14,
                background: 'linear-gradient(165deg, #1e3a8a, #172554)',
                color: '#dbeafe',
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 220,
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.9 }}>Agent Model</p>
                <p style={{ margin: '8px 0 0', fontSize: 28, fontWeight: 700 }}>gpt-5.4-mini</p>
                <p style={{ margin: '10px 0 0', fontSize: 14, color: '#bfdbfe' }}>
                  Optimized for booking support and lead qualification.
                </p>
              </div>
              <div style={{ marginTop: 20 }}>
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    marginBottom: 8,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 12, color: '#bfdbfe' }}>Average Latency</p>
                  <p style={{ margin: '4px 0 0', fontWeight: 700, fontSize: 18 }}>620 ms</p>
                </div>
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 12, color: '#bfdbfe' }}>Throughput</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>46 req/min</span>
                </div>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  )
}
