'use client'

import Link from 'next/link'

import { DashboardLogoutButton } from '@/components/dashboard-logout-button'
import { supabase } from '@/lib/supabase'
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

function formatDisplayDate(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    return value
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseTags(raw: unknown): CustomerTag[] {
  const valid: CustomerTag[] = ['VIP', 'Regular', 'New', 'At Risk']
  let arr: unknown[] = []
  if (Array.isArray(raw)) {
    arr = raw
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      arr = Array.isArray(parsed) ? parsed : []
    } catch {
      arr = []
    }
  }
  const out: CustomerTag[] = []
  for (const item of arr) {
    const s = String(item).trim()
    const match = valid.find((v) => v.toLowerCase() === s.toLowerCase())
    if (match) {
      out.push(match)
    }
  }
  return out.length ? Array.from(new Set(out)) : ['Regular']
}

function parseVisitHistory(raw: unknown): { date: string; service: string; amount: number }[] {
  if (!raw || !Array.isArray(raw)) {
    return []
  }
  return raw.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return { date: '—', service: '—', amount: 0 }
    }
    const o = entry as Record<string, unknown>
    const dateRaw = o.date != null ? String(o.date) : ''
    const service = o.service != null ? String(o.service) : '—'
    const amount = Number(o.amount) || 0
    return {
      date: dateRaw ? formatDisplayDate(dateRaw) : '—',
      service,
      amount,
    }
  })
}

function mapDbCustomerRow(row: Record<string, unknown>): Customer {
  const lastSource = row.last_visit ?? row.lastVisit
  const joinedSource = row.joined ?? row.created_at ?? row.createdAt
  return {
    id: String(row.id),
    name: String(row.name ?? 'Unknown'),
    phone: row.phone != null ? String(row.phone) : '—',
    email: row.email != null ? String(row.email) : '',
    lastVisit: lastSource != null ? formatDisplayDate(String(lastSource)) : '—',
    totalBookings: Number(row.total_bookings ?? row.totalBookings ?? 0) || 0,
    totalSpent: Number(row.total_spent ?? row.totalSpent ?? 0) || 0,
    tags: parseTags(row.tags),
    joined: joinedSource != null ? formatDisplayDate(String(joinedSource)) : '—',
    preferredStaff: String(row.preferred_staff ?? row.preferredStaff ?? '—'),
    visitHistory: parseVisitHistory(row.visit_history ?? row.visitHistory),
  }
}

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
  const [customers, setCustomers] = useState<Customer[]>([])
  const [crmLoading, setCrmLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadCustomers() {
      setCrmLoading(true)

      const {
        data: { user: userFromGet },
      } = await supabase.auth.getUser()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const user = userFromGet ?? session?.user ?? null

      if (!user) {
        if (!cancelled) {
          setCustomers([])
          setCrmLoading(false)
        }
        return
      }

      const { data: business } = await supabase.from('businesses').select('id').eq('user_id', user.id).maybeSingle()

      if (!business?.id) {
        if (!cancelled) {
          setCustomers([])
          setCrmLoading(false)
        }
        return
      }

      const { data: rows, error } = await supabase
        .from('customers')
        .select('*')
        .eq('business_id', business.id)
        .order('name', { ascending: true })

      if (!cancelled) {
        if (!error && rows) {
          setCustomers(rows.map((r) => mapDbCustomerRow(r as Record<string, unknown>)))
        } else {
          setCustomers([])
        }
        setCrmLoading(false)
      }
    }

    void loadCustomers()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setNotes('')
  }, [selectedId])

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

  useEffect(() => {
    if (selectedId && !customers.some((c) => c.id === selectedId)) {
      setSelectedId(null)
    }
  }, [customers, selectedId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return customers
    }
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    )
  }, [customers, query])

  const selected = customers.find((c) => c.id === selectedId) ?? null

  const stats = useMemo(() => {
    const total = customers.length
    const now = new Date()
    const newThisMonth = customers.filter((c) => {
      const joined = new Date(c.joined)
      return !Number.isNaN(joined.getTime()) && joined.getFullYear() === now.getFullYear() && joined.getMonth() === now.getMonth()
    }).length
    const returning = customers.filter((c) => c.totalBookings >= 5).length
    const avgSpend = Math.round(customers.reduce((sum, c) => sum + c.totalSpent, 0) / Math.max(total, 1))
    return { total, newThisMonth, returning, avgSpend }
  }, [customers])

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
          style={{ borderRadius: 10, flexShrink: 0, display: 'block' }}
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
      <div style={{ margin: '0 12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Operations</h2>
        {isMobile && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setIsDrawerOpen(false)}
            style={{ border: 'none', background: 'transparent', fontSize: 26, lineHeight: 1, color: '#374151', cursor: 'pointer' }}
          >
            ×
          </button>
        )}
      </div>
      <nav style={{ display: 'grid', gap: 6 }}>
        {navItems.map((item) => {
          const isActive = item === 'CRM'
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
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {!isMobile && sidebar}
        {isMobile && isDrawerOpen && (
          <div role="presentation" onClick={() => setIsDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(17, 24, 39, 0.45)', zIndex: 40 }}>
            <div role="presentation" onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 258, boxShadow: '0 12px 24px rgba(0, 0, 0, 0.2)' }}>
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
                style={{ border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', color: '#374151', width: 40, height: 40, fontSize: 23, lineHeight: 1, cursor: 'pointer' }}
              >
                ☰
              </button>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 30, letterSpacing: '-0.02em' }}>Customers</h1>
              <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 14 }}>Search, segment, and nurture your best clients.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, phone..."
                style={{
                  width: isMobile ? '100%' : 320,
                  maxWidth: isMobile ? '100%' : '42vw',
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
              gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
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
              gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : selected ? 'minmax(0, 1fr) 360px' : 'minmax(0, 1fr)',
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
              {isMobile ? (
                <div style={{ padding: 12, display: 'grid', gap: 10 }}>
                  {crmLoading ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>Loading customers...</div>
                  ) : customers.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 14, lineHeight: 1.55 }}>
                      No customers yet. They will appear here when they chat with your AI.
                    </div>
                  ) : filtered.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>No matching customers.</div>
                  ) : (
                    filtered.map((customer) => {
                      const active = customer.id === selectedId
                      return (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(customer.id)
                            setNotes('')
                          }}
                          style={{
                            border: `1px solid ${active ? '#fecaca' : '#f3f4f6'}`,
                            background: active ? '#fff1f2' : '#ffffff',
                            borderRadius: 12,
                            padding: 12,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontWeight: 700, color: '#111827' }}>{customer.name}</div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>{customer.lastVisit}</div>
                          </div>
                          <div style={{ marginTop: 6, color: '#4b5563', fontSize: 13 }}>{customer.email}</div>
                          <div style={{ marginTop: 3, color: '#4b5563', fontSize: 13 }}>{customer.phone}</div>
                          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {customer.tags.map((tag) => {
                              const t = tagStyle(tag)
                              return (
                                <span key={tag} style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 999, border: `1px solid ${t.border}`, background: t.bg, color: t.color }}>
                                  {tag}
                                </span>
                              )
                            })}
                          </div>
                          <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                            {customer.totalBookings} bookings · {formatMoney(customer.totalSpent)}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              ) : (
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
                    {crmLoading ? (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            padding: '36px 14px',
                            textAlign: 'center',
                            color: '#6b7280',
                            fontSize: 14,
                          }}
                        >
                          Loading customers...
                        </td>
                      </tr>
                    ) : customers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            padding: '36px 14px',
                            textAlign: 'center',
                            color: '#6b7280',
                            fontSize: 14,
                            lineHeight: 1.55,
                          }}
                        >
                          No customers yet. They will appear here when they chat with your AI.
                        </td>
                      </tr>
                    ) : filtered.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          style={{
                            padding: '36px 14px',
                            textAlign: 'center',
                            color: '#6b7280',
                            fontSize: 14,
                          }}
                        >
                          No matching customers.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((customer) => {
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
                      })
                    )}
                  </tbody>
                </table>
              </div>
              )}
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
