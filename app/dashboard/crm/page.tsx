'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type CustomerTag = 'VIP' | 'Regular' | 'New' | 'At Risk'

type Customer = {
  id: string
  name: string
  phone: string
  email: string
  lastVisit: string
  totalBookings: number
  totalSpent: number
  tags: CustomerTag[]
  joined: string
  preferredStaff: string
  visitHistory: { date: string; service: string; amount: number }[]
}

const navItems = ['Dashboard', 'Chats', 'Calendar', 'Bookings', 'CRM', 'Settings']
const navLinks: Record<string, string> = {
  Dashboard: '/dashboard',
  Chats: '/dashboard/chats',
  Calendar: '/dashboard/bookings',
  Bookings: '/dashboard/bookings',
  CRM: '/dashboard/crm',
  Settings: '/dashboard/settings',
}

const customers: Customer[] = [
  {
    id: 'c1',
    name: 'Emma Johnson',
    phone: '+1 (415) 555-0142',
    email: 'emma.j@example.com',
    lastVisit: 'Apr 18, 2026',
    totalBookings: 14,
    totalSpent: 1840,
    tags: ['VIP', 'Regular'],
    joined: 'Jan 12, 2025',
    preferredStaff: 'Alex Rivera',
    visitHistory: [
      { date: 'Apr 18, 2026', service: 'Balayage refresh', amount: 220 },
      { date: 'Mar 22, 2026', service: 'Toner + gloss', amount: 95 },
      { date: 'Feb 10, 2026', service: 'Cut + style', amount: 85 },
    ],
  },
  {
    id: 'c2',
    name: 'Olivia Martinez',
    phone: '+1 (646) 555-0198',
    email: 'olivia.m@example.com',
    lastVisit: 'Apr 20, 2026',
    totalBookings: 9,
    totalSpent: 1120,
    tags: ['Regular'],
    joined: 'Aug 3, 2025',
    preferredStaff: 'Priya Shah',
    visitHistory: [
      { date: 'Apr 20, 2026', service: 'Lash fill', amount: 120 },
      { date: 'Mar 30, 2026', service: 'Classic manicure', amount: 45 },
    ],
  },
  {
    id: 'c3',
    name: 'Sophia Lee',
    phone: '+1 (213) 555-0171',
    email: 'sophia.lee@example.com',
    lastVisit: 'Apr 12, 2026',
    totalBookings: 6,
    totalSpent: 780,
    tags: ['Regular'],
    joined: 'Nov 19, 2024',
    preferredStaff: 'Jordan Kim',
    visitHistory: [
      { date: 'Apr 12, 2026', service: 'Deep tissue massage', amount: 140 },
      { date: 'Jan 8, 2026', service: 'Hot stone add-on', amount: 35 },
    ],
  },
  {
    id: 'c4',
    name: 'Mia Wilson',
    phone: '+1 (512) 555-0133',
    email: 'mia.w@example.com',
    lastVisit: 'Mar 2, 2026',
    totalBookings: 3,
    totalSpent: 420,
    tags: ['At Risk'],
    joined: 'Sep 1, 2025',
    preferredStaff: 'Alex Rivera',
    visitHistory: [
      { date: 'Mar 2, 2026', service: 'Bridal consult', amount: 0 },
      { date: 'Dec 14, 2025', service: 'Blowout', amount: 65 },
    ],
  },
  {
    id: 'c5',
    name: 'Noah Chen',
    phone: '+1 (206) 555-0160',
    email: 'noah.chen@example.com',
    lastVisit: 'Apr 21, 2026',
    totalBookings: 11,
    totalSpent: 990,
    tags: ['VIP', 'Regular'],
    joined: 'Mar 5, 2025',
    preferredStaff: 'Sam Patel',
    visitHistory: [
      { date: 'Apr 21, 2026', service: 'Executive haircut', amount: 75 },
      { date: 'Mar 9, 2026', service: 'Beard trim', amount: 35 },
    ],
  },
  {
    id: 'c6',
    name: 'Ava Thompson',
    phone: '+1 (305) 555-0184',
    email: 'ava.t@example.com',
    lastVisit: 'Apr 19, 2026',
    totalBookings: 5,
    totalSpent: 640,
    tags: ['New'],
    joined: 'Mar 28, 2026',
    preferredStaff: 'Jordan Kim',
    visitHistory: [{ date: 'Apr 19, 2026', service: 'Hydrafacial', amount: 185 }],
  },
  {
    id: 'c7',
    name: 'Liam Brooks',
    phone: '+1 (617) 555-0129',
    email: 'liam.brooks@example.com',
    lastVisit: 'Apr 8, 2026',
    totalBookings: 7,
    totalSpent: 560,
    tags: ['Regular'],
    joined: 'Jun 2, 2025',
    preferredStaff: 'Sam Patel',
    visitHistory: [
      { date: 'Apr 8, 2026', service: 'Beard trim + hot towel', amount: 55 },
      { date: 'Feb 1, 2026', service: 'Haircut', amount: 60 },
    ],
  },
  {
    id: 'c8',
    name: 'Isabella Rossi',
    phone: '+1 (917) 555-0155',
    email: 'isabella.r@example.com',
    lastVisit: 'Apr 17, 2026',
    totalBookings: 4,
    totalSpent: 310,
    tags: ['New', 'Regular'],
    joined: 'Feb 14, 2026',
    preferredStaff: 'Priya Shah',
    visitHistory: [{ date: 'Apr 17, 2026', service: 'Gel extensions fill', amount: 85 }],
  },
  {
    id: 'c9',
    name: 'Ethan Park',
    phone: '+1 (408) 555-0107',
    email: 'ethan.park@example.com',
    lastVisit: 'Apr 5, 2026',
    totalBookings: 2,
    totalSpent: 180,
    tags: ['At Risk', 'New'],
    joined: 'Mar 10, 2026',
    preferredStaff: 'Alex Rivera',
    visitHistory: [{ date: 'Apr 5, 2026', service: 'Color consult', amount: 0 }],
  },
  {
    id: 'c10',
    name: 'Charlotte Davis',
    phone: '+1 (702) 555-0191',
    email: 'charlotte.d@example.com',
    lastVisit: 'Apr 22, 2026',
    totalBookings: 18,
    totalSpent: 2460,
    tags: ['VIP', 'Regular'],
    joined: 'Oct 2, 2024',
    preferredStaff: 'Alex Rivera',
    visitHistory: [
      { date: 'Apr 22, 2026', service: 'Blowout + style', amount: 95 },
      { date: 'Mar 30, 2026', service: 'Cut + treatment', amount: 140 },
    ],
  },
]

function tagStyle(tag: CustomerTag) {
  switch (tag) {
    case 'VIP':
      return { bg: '#fef3c7', border: '#fde68a', color: '#92400e' }
    case 'Regular':
      return { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' }
    case 'New':
      return { bg: '#ecfdf5', border: '#bbf7d0', color: '#166534' }
    case 'At Risk':
      return { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' }
    default:
      return { bg: '#f3f4f6', border: '#e5e7eb', color: '#374151' }
  }
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    amount
  )
}

export default function CrmPage() {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    setNotes('')
  }, [selectedId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    )
  }, [query])

  const selected = customers.find((c) => c.id === selectedId) ?? null

  const stats = useMemo(() => {
    const total = customers.length
    const now = new Date()
    const newThisMonth = customers.filter((c) => {
      const joined = new Date(c.joined)
      return joined.getFullYear() === now.getFullYear() && joined.getMonth() === now.getMonth()
    }).length
    const returning = customers.filter((c) => c.totalBookings >= 5).length
    const avgSpend = Math.round(customers.reduce((sum, c) => sum + c.totalSpent, 0) / Math.max(total, 1))
    return { total, newThisMonth, returning, avgSpend }
  }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f3f4f6',
        color: '#111827',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <aside
          style={{
            width: 258,
            background: '#ffffff',
            borderRight: '1px solid #e5e7eb',
            padding: '24px 14px 20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <p
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.24em',
              color: '#ef4444',
              margin: '0 12px 6px',
            }}
          >
            Salon AI
          </p>
          <h2 style={{ margin: '0 12px 24px', fontSize: 20, fontWeight: 700 }}>Operations</h2>
          <nav style={{ display: 'grid', gap: 6 }}>
            {navItems.map((item) => {
              const isActive = item === 'CRM'
              return (
                <Link
                  key={item}
                  href={navLinks[item] ?? '#'}
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
          <div style={{ marginTop: 'auto', padding: '0 8px' }}>
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

        <main style={{ flex: 1, padding: '30px 32px 36px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 30, letterSpacing: '-0.02em' }}>Customers</h1>
              <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 14 }}>Search, segment, and nurture your best clients.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, phone..."
                style={{
                  width: 320,
                  maxWidth: '42vw',
                  borderRadius: 10,
                  border: '1px solid #d1d5db',
                  padding: '10px 12px',
                  fontSize: 14,
                  outline: 'none',
                  background: '#fff',
                }}
              />
              <button
                type="button"
                style={{
                  border: 'none',
                  borderRadius: 10,
                  background: '#dc2626',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Add Customer
              </button>
            </div>
          </div>

          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 12,
              marginBottom: 14,
            }}
          >
            {[
              { label: 'Total Customers', value: stats.total.toString() },
              { label: 'New This Month', value: stats.newThisMonth.toString() },
              { label: 'Returning', value: stats.returning.toString() },
              { label: 'Average Spend', value: formatMoney(stats.avgSpend) },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{stat.label}</p>
                <p style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 700 }}>{stat.value}</p>
              </div>
            ))}
          </section>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: selected ? 'minmax(0, 1fr) 360px' : 'minmax(0, 1fr)',
              gap: 14,
              alignItems: 'start',
            }}
          >
            <section
              style={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                  <thead>
                    <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
                      {['Name', 'Phone', 'Email', 'Last Visit', 'Total Bookings', 'Total Spent', 'Tags', 'Actions'].map(
                        (col) => (
                          <th
                            key={col}
                            style={{
                              textAlign: 'left',
                              padding: '12px 14px',
                              fontSize: 12,
                              color: '#6b7280',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {col}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((customer) => {
                      const active = customer.id === selectedId
                      return (
                        <tr
                          key={customer.id}
                          onClick={() => {
                            setSelectedId(customer.id)
                            setNotes('')
                          }}
                          style={{
                            cursor: 'pointer',
                            background: active ? '#fff1f2' : '#ffffff',
                            borderBottom: '1px solid #f3f4f6',
                          }}
                        >
                          <td style={{ padding: '12px 14px', fontWeight: 600 }}>{customer.name}</td>
                          <td style={{ padding: '12px 14px', color: '#4b5563', fontSize: 14 }}>{customer.phone}</td>
                          <td style={{ padding: '12px 14px', color: '#4b5563', fontSize: 14 }}>{customer.email}</td>
                          <td style={{ padding: '12px 14px', color: '#6b7280', fontSize: 14 }}>{customer.lastVisit}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 600 }}>{customer.totalBookings}</td>
                          <td style={{ padding: '12px 14px', fontWeight: 600 }}>{formatMoney(customer.totalSpent)}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {customer.tags.map((tag) => {
                                const t = tagStyle(tag)
                                return (
                                  <span
                                    key={tag}
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      padding: '4px 8px',
                                      borderRadius: 999,
                                      border: `1px solid ${t.border}`,
                                      background: t.bg,
                                      color: t.color,
                                    }}
                                  >
                                    {tag}
                                  </span>
                                )
                              })}
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedId(customer.id)
                                setNotes('')
                              }}
                              style={{
                                borderRadius: 8,
                                border: '1px solid #d1d5db',
                                background: '#fff',
                                padding: '6px 10px',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {selected && (
              <aside
                style={{
                  position: 'sticky',
                  top: 24,
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 16,
                  padding: 16,
                  maxHeight: 'calc(100vh - 120px)',
                  overflow: 'auto',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{selected.name}</h2>
                    <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 13 }}>Customer profile</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    style={{
                      border: 'none',
                      background: '#f3f4f6',
                      color: '#6b7280',
                      borderRadius: 8,
                      width: 32,
                      height: 32,
                      cursor: 'pointer',
                      fontSize: 16,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selected.tags.map((tag) => {
                    const t = tagStyle(tag)
                    return (
                      <span
                        key={tag}
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '4px 8px',
                          borderRadius: 999,
                          border: `1px solid ${t.border}`,
                          background: t.bg,
                          color: t.color,
                        }}
                      >
                        {tag}
                      </span>
                    )
                  })}
                </div>

                <div
                  style={{
                    marginTop: 14,
                    display: 'grid',
                    gap: 10,
                    fontSize: 13,
                    color: '#4b5563',
                  }}
                >
                  <div>
                    <span style={{ color: '#9ca3af', fontWeight: 600 }}>EMAIL</span>
                    <div style={{ marginTop: 4, fontWeight: 600, color: '#111827' }}>{selected.email}</div>
                  </div>
                  <div>
                    <span style={{ color: '#9ca3af', fontWeight: 600 }}>PHONE</span>
                    <div style={{ marginTop: 4, fontWeight: 600, color: '#111827' }}>{selected.phone}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <span style={{ color: '#9ca3af', fontWeight: 600 }}>JOINED</span>
                      <div style={{ marginTop: 4, fontWeight: 600, color: '#111827' }}>{selected.joined}</div>
                    </div>
                    <div>
                      <span style={{ color: '#9ca3af', fontWeight: 600 }}>LAST VISIT</span>
                      <div style={{ marginTop: 4, fontWeight: 600, color: '#111827' }}>{selected.lastVisit}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <span style={{ color: '#9ca3af', fontWeight: 600 }}>BOOKINGS</span>
                      <div style={{ marginTop: 4, fontWeight: 700, color: '#111827' }}>{selected.totalBookings}</div>
                    </div>
                    <div>
                      <span style={{ color: '#9ca3af', fontWeight: 600 }}>SPENT</span>
                      <div style={{ marginTop: 4, fontWeight: 700, color: '#111827' }}>
                        {formatMoney(selected.totalSpent)}
                      </div>
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#9ca3af', fontWeight: 600 }}>PREFERRED STAFF</span>
                    <div style={{ marginTop: 4, fontWeight: 600, color: '#111827' }}>{selected.preferredStaff}</div>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#111827' }}>Visit history</h3>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {selected.visitHistory.map((visit) => (
                      <div
                        key={`${visit.date}-${visit.service}`}
                        style={{
                          border: '1px solid #f3f4f6',
                          borderRadius: 10,
                          padding: '8px 10px',
                          background: '#fafafa',
                        }}
                      >
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{visit.date}</div>
                        <div style={{ marginTop: 4, fontWeight: 600, fontSize: 13 }}>{visit.service}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
                          {visit.amount === 0 ? 'Complimentary' : formatMoney(visit.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>
                    NOTES
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add a note about preferences, objections, or follow-ups..."
                    rows={5}
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      borderRadius: 10,
                      border: '1px solid #d1d5db',
                      padding: '10px 12px',
                      fontSize: 13,
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </aside>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
