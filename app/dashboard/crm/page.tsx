'use client'

import { motion } from 'framer-motion'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
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
      return {
        bg: 'rgba(232, 220, 200, 0.2)',
        border: 'rgba(232, 220, 200, 0.45)',
        color: 'var(--ocean-sand)',
      }
    case 'Regular':
      return {
        bg: 'rgba(56, 189, 248, 0.1)',
        border: 'var(--ocean-border-strong)',
        color: 'var(--ocean-sky-bright)',
      }
    case 'New':
      return {
        bg: 'rgba(74, 222, 128, 0.12)',
        border: 'rgba(74, 222, 128, 0.35)',
        color: 'var(--ocean-success)',
      }
    case 'At Risk':
      return {
        bg: 'rgba(248, 113, 113, 0.12)',
        border: 'rgba(248, 113, 113, 0.35)',
        color: 'var(--ocean-danger)',
      }
    default:
      return {
        bg: 'var(--ocean-surface)',
        border: 'var(--ocean-border)',
        color: 'var(--ocean-text-muted)',
      }
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear draft notes when switching customer
    setNotes('')
  }, [selectedId])

  useEffect(() => {
    if (selectedId && !customers.some((c) => c.id === selectedId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- drop stale selection after data refresh
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

  return (
    <DashboardOceanNav activeNav="CRM">
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
              <h1 style={{ margin: 0, fontSize: 30, letterSpacing: '-0.02em', color: 'var(--ocean-text)' }}>Customers</h1>
              <p style={{ margin: '8px 0 0', color: 'var(--ocean-text-muted)', fontSize: 14 }}>
                Search, segment, and nurture your best clients.
              </p>
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
                  border: '1px solid var(--ocean-border)',
                  padding: '10px 12px',
                  fontSize: 14,
                  outline: 'none',
                  background: 'var(--ocean-surface)',
                }}
              />
              <button
                type="button"
                style={{
                  border: 'none',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)',
                  color: 'var(--ocean-black)',
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
background: 'var(--ocean-card)',
              border: '1px solid var(--ocean-border)',
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <p style={{ margin: 0, color: 'var(--ocean-text-muted)', fontSize: 13 }}>{stat.label}</p>
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
background: 'var(--ocean-card)',
              border: '1px solid var(--ocean-border)',
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              {isMobile ? (
                <div style={{ padding: 12, display: 'grid', gap: 10 }}>
                  {crmLoading ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--ocean-text-muted)', fontSize: 14 }}>Loading customers...</div>
                  ) : customers.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--ocean-text-muted)', fontSize: 14, lineHeight: 1.55 }}>
                      No customers yet. They will appear here when they chat with your AI.
                    </div>
                  ) : filtered.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--ocean-text-muted)', fontSize: 14 }}>No matching customers.</div>
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
                            border: `1px solid ${active ? 'var(--ocean-border-strong)' : 'var(--ocean-border)'}`,
                            background: active ? 'rgba(56, 189, 248, 0.1)' : 'var(--ocean-ink)',
                            borderRadius: 12,
                            padding: 12,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontWeight: 700, color: 'var(--ocean-text)' }}>{customer.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--ocean-text-muted)' }}>{customer.lastVisit}</div>
                          </div>
                          <div style={{ marginTop: 6, color: 'var(--ocean-text-muted)', fontSize: 13 }}>{customer.email}</div>
                          <div style={{ marginTop: 3, color: 'var(--ocean-text-muted)', fontSize: 13 }}>{customer.phone}</div>
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
                          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ocean-text-muted)' }}>
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
                    <tr style={{ background: 'var(--ocean-surface)', borderBottom: '1px solid var(--ocean-border)' }}>
                      {['Name', 'Phone', 'Email', 'Last Visit', 'Total Bookings', 'Total Spent', 'Tags', 'Actions'].map(
                        (col) => (
                          <th
                            key={col}
                            style={{
                              textAlign: 'left',
                              padding: '12px 14px',
                              fontSize: 12,
                              color: 'var(--ocean-text-muted)',
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
                            color: 'var(--ocean-text-muted)',
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
                            color: 'var(--ocean-text-muted)',
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
                            color: 'var(--ocean-text-muted)',
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
                              background: active ? 'rgba(56, 189, 248, 0.08)' : 'var(--ocean-ink)',
                              borderBottom: '1px solid var(--ocean-border)',
                            }}
                          >
                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{customer.name}</td>
                            <td style={{ padding: '12px 14px', color: 'var(--ocean-text-muted)', fontSize: 14 }}>{customer.phone}</td>
                            <td style={{ padding: '12px 14px', color: 'var(--ocean-text-muted)', fontSize: 14 }}>{customer.email}</td>
                            <td style={{ padding: '12px 14px', color: 'var(--ocean-text-muted)', fontSize: 14 }}>{customer.lastVisit}</td>
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
                                  border: '1px solid var(--ocean-border)',
                                  background: 'var(--ocean-surface)',
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

            {selected ? (
              <aside
                key={selected.id}
                style={{
                  position: 'sticky',
                  top: 24,
                  background: 'var(--ocean-card)',
                  border: '1px solid var(--ocean-border)',
                  borderRadius: 16,
                  padding: 16,
                  maxHeight: 'calc(100vh - 120px)',
                  overflow: 'auto',
                  boxShadow: 'var(--ocean-shadow-md)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, color: 'var(--ocean-text)' }}>{selected.name}</h2>
                    <p style={{ margin: '6px 0 0', color: 'var(--ocean-text-muted)', fontSize: 13 }}>Customer profile</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    style={{
                      border: 'none',
                      background: 'var(--ocean-surface)',
                      color: 'var(--ocean-text-muted)',
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
                    color: 'var(--ocean-text-muted)',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--ocean-text-subtle)', fontWeight: 600 }}>EMAIL</span>
                    <div style={{ marginTop: 4, fontWeight: 600, color: 'var(--ocean-text)' }}>{selected.email}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ocean-text-subtle)', fontWeight: 600 }}>PHONE</span>
                    <div style={{ marginTop: 4, fontWeight: 600, color: 'var(--ocean-text)' }}>{selected.phone}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <span style={{ color: 'var(--ocean-text-subtle)', fontWeight: 600 }}>JOINED</span>
                      <div style={{ marginTop: 4, fontWeight: 600, color: 'var(--ocean-text)' }}>{selected.joined}</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ocean-text-subtle)', fontWeight: 600 }}>LAST VISIT</span>
                      <div style={{ marginTop: 4, fontWeight: 600, color: 'var(--ocean-text)' }}>{selected.lastVisit}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <span style={{ color: 'var(--ocean-text-subtle)', fontWeight: 600 }}>BOOKINGS</span>
                      <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--ocean-text)' }}>{selected.totalBookings}</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ocean-text-subtle)', fontWeight: 600 }}>SPENT</span>
                      <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--ocean-text)' }}>
                        {formatMoney(selected.totalSpent)}
                      </div>
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ocean-text-subtle)', fontWeight: 600 }}>PREFERRED STAFF</span>
                    <div style={{ marginTop: 4, fontWeight: 600, color: 'var(--ocean-text)' }}>{selected.preferredStaff}</div>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ocean-text)' }}>Visit history</h3>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {selected.visitHistory.map((visit) => (
                      <div
                        key={`${visit.date}-${visit.service}`}
                        style={{
                          border: '1px solid var(--ocean-border)',
                          borderRadius: 10,
                          padding: '8px 10px',
                          background: 'var(--ocean-surface)',
                        }}
                      >
                        <div style={{ fontSize: 12, color: 'var(--ocean-text-muted)' }}>{visit.date}</div>
                        <div style={{ marginTop: 4, fontWeight: 600, fontSize: 13 }}>{visit.service}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ocean-text-subtle)' }}>
                          {visit.amount === 0 ? 'Complimentary' : formatMoney(visit.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ocean-text-muted)', marginBottom: 6 }}>
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
                      border: '1px solid var(--ocean-border)',
                      padding: '10px 12px',
                      fontSize: 13,
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              </aside>
            ) : null}
          </div>
        </main>
      )}
    </DashboardOceanNav>
  )
}
