'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { oceanTransition, slideInRight } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'

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

const glassCard = {
  background: 'rgba(8,20,40,0.5)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
}

function formatDisplayDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseTags(raw: unknown): CustomerTag[] {
  const valid: CustomerTag[] = ['VIP', 'Regular', 'New', 'At Risk']
  let values: unknown[] = []
  if (Array.isArray(raw)) {
    values = raw
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      values = Array.isArray(parsed) ? parsed : []
    } catch {
      values = []
    }
  }
  const out: CustomerTag[] = []
  for (const value of values) {
    const normalized = String(value).trim()
    const match = valid.find((item) => item.toLowerCase() === normalized.toLowerCase())
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
    const object = entry as Record<string, unknown>
    const dateRaw = object.date != null ? String(object.date) : ''
    const service = object.service != null ? String(object.service) : '—'
    const amount = Number(object.amount) || 0
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
        bg: 'rgba(232,220,200,0.18)',
        border: 'rgba(232,220,200,0.28)',
        color: '#f5e6c8',
      }
    case 'Regular':
      return {
        bg: 'rgba(56,189,248,0.12)',
        border: 'rgba(56,189,248,0.25)',
        color: '#38bdf8',
      }
    case 'New':
      return {
        bg: 'rgba(74,222,128,0.12)',
        border: 'rgba(74,222,128,0.25)',
        color: '#4ade80',
      }
    case 'At Risk':
      return {
        bg: 'rgba(248,113,113,0.12)',
        border: 'rgba(248,113,113,0.25)',
        color: '#f87171',
      }
    default:
      return {
        bg: 'rgba(255,255,255,0.06)',
        border: 'rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.55)',
      }
  }
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export default function CrmPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [crmLoading, setCrmLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const reduceMotion = useReducedMotion()

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
          setCustomers(rows.map((row) => mapDbCustomerRow(row as Record<string, unknown>)))
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

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) {
      return customers
    }
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(value) ||
        customer.email.toLowerCase().includes(value) ||
        customer.phone.toLowerCase().includes(value),
    )
  }, [customers, query])

  const selected = customers.find((customer) => customer.id === selectedId) ?? null

  const stats = useMemo(() => {
    const total = customers.length
    const now = new Date()
    const newThisMonth = customers.filter((customer) => {
      const joined = new Date(customer.joined)
      return (
        !Number.isNaN(joined.getTime()) &&
        joined.getFullYear() === now.getFullYear() &&
        joined.getMonth() === now.getMonth()
      )
    }).length
    const returning = customers.filter((customer) => customer.totalBookings >= 5).length
    const avgSpend = Math.round(
      customers.reduce((sum, customer) => sum + customer.totalSpent, 0) / Math.max(total, 1),
    )
    return { total, newThisMonth, returning, avgSpend }
  }, [customers])

  return (
    <DashboardOceanNav activeNav="CRM">
      {({ isMobile, openNav }) => (
        <main style={{ display: 'grid', gap: 20, position: 'relative' }}>
          {isMobile ? (
            <motion.button
              type="button"
              onClick={openNav}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(5,20,40,0.5)',
                color: 'white',
                fontSize: 22,
                cursor: 'pointer',
              }}
            >
              ☰
            </motion.button>
          ) : null}

          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={oceanTransition(reduceMotion, { duration: 0.24 })}
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
                  fontSize: 32,
                  fontWeight: 700,
                  fontFamily: 'var(--font-playfair)',
                  letterSpacing: '-0.03em',
                }}
              >
                Customers
              </h1>
              <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.42)', fontSize: 14 }}>
                Search, segment, and grow relationships with every visitor OceanCore meets.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, width: isMobile ? '100%' : 'auto', flexWrap: 'wrap' }}>
              <div
                style={{
                  ...glassCard,
                  borderRadius: 16,
                  padding: '0 14px',
                  display: 'flex',
                  alignItems: 'center',
                  minWidth: isMobile ? '100%' : 320,
                }}
              >
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, email, phone..."
                  style={{
                    width: '100%',
                    height: 48,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'white',
                    fontSize: 14,
                  }}
                />
              </div>
              <motion.button
                type="button"
                whileHover={reduceMotion ? undefined : { y: -2 }}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                style={{
                  border: 'none',
                  borderRadius: 16,
                  padding: '12px 16px',
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 13,
                  boxShadow: '0 10px 28px rgba(14,165,233,0.28)',
                  cursor: 'pointer',
                }}
              >
                Add Customer
              </motion.button>
            </div>
          </motion.section>

          <section
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            {[
              { label: 'Total', value: stats.total.toString() },
              { label: 'New', value: stats.newThisMonth.toString() },
              { label: 'Returning', value: stats.returning.toString() },
              { label: 'Avg Spend', value: formatMoney(stats.avgSpend) },
            ].map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.97, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={oceanTransition(reduceMotion, { delay: 0.05 + index * 0.06, duration: 0.2 })}
                style={{ ...glassCard, padding: 16 }}
              >
                <div
                  style={{
                    color: 'rgba(255,255,255,0.42)',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.16em',
                  }}
                >
                  {item.label}
                </div>
                <div style={{ marginTop: 10, color: 'white', fontSize: 28, fontWeight: 700 }}>{item.value}</div>
              </motion.div>
            ))}
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr)', gap: 16 }}>
            <motion.section
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={oceanTransition(reduceMotion, { delay: 0.08, duration: 0.24 })}
              style={{ ...glassCard, overflow: 'hidden' }}
            >
              {isMobile ? (
                <div style={{ padding: 12, display: 'grid', gap: 10 }}>
                  {crmLoading ? (
                    <div style={{ padding: 24, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
                      Loading customers...
                    </div>
                  ) : customers.length === 0 ? (
                    <div style={{ padding: 24, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 1.6 }}>
                      No customers yet. They’ll appear here when they chat with your AI.
                    </div>
                  ) : filtered.length === 0 ? (
                    <div style={{ padding: 24, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
                      No matching customers.
                    </div>
                  ) : (
                    filtered.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(customer.id)
                          setNotes('')
                        }}
                        style={{
                          width: '100%',
                          borderRadius: 18,
                          border: `1px solid ${
                            customer.id === selectedId ? 'rgba(56,189,248,0.24)' : 'rgba(255,255,255,0.08)'
                          }`,
                          background:
                            customer.id === selectedId ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.03)',
                          padding: 14,
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: '50%',
                              display: 'grid',
                              placeItems: 'center',
                              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                              color: 'white',
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {getInitials(customer.name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>{customer.name}</div>
                            <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.42)', fontSize: 12 }}>
                              {customer.email}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {['Customer', 'Email', 'Phone', 'Last Visit', 'Bookings', 'Spent', 'Tags'].map((column) => (
                          <th
                            key={column}
                            style={{
                              padding: '16px 18px',
                              textAlign: 'left',
                              color: 'rgba(255,255,255,0.35)',
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.16em',
                            }}
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {crmLoading ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.45)' }}>
                            Loading customers...
                          </td>
                        </tr>
                      ) : customers.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.45)' }}>
                            No customers yet. They’ll appear here when they chat with your AI.
                          </td>
                        </tr>
                      ) : filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.45)' }}>
                            No matching customers.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((customer) => (
                          <tr
                            key={customer.id}
                            onMouseEnter={(event) => {
                              if (customer.id !== selectedId) {
                                event.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                              }
                            }}
                            onMouseLeave={(event) => {
                              if (customer.id !== selectedId) {
                                event.currentTarget.style.background = 'transparent'
                              }
                            }}
                            onClick={() => {
                              setSelectedId(customer.id)
                              setNotes('')
                            }}
                            style={{
                              cursor: 'pointer',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              background:
                                customer.id === selectedId ? 'rgba(56,189,248,0.08)' : 'transparent',
                              transition: 'background-color 0.2s cubic-bezier(0.4,0,0.2,1)',
                            }}
                          >
                            <td style={{ padding: '16px 18px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div
                                  style={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: '50%',
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                                    color: 'white',
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  {getInitials(customer.name)}
                                </div>
                                <div>
                                  <div style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>{customer.name}</div>
                                  <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.38)', fontSize: 12 }}>
                                    Joined {customer.joined}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '16px 18px', color: 'rgba(255,255,255,0.68)', fontSize: 13 }}>
                              {customer.email}
                            </td>
                            <td style={{ padding: '16px 18px', color: 'rgba(255,255,255,0.68)', fontSize: 13 }}>
                              {customer.phone}
                            </td>
                            <td style={{ padding: '16px 18px', color: 'rgba(255,255,255,0.68)', fontSize: 13 }}>
                              {customer.lastVisit}
                            </td>
                            <td style={{ padding: '16px 18px', color: 'white', fontWeight: 700 }}>{customer.totalBookings}</td>
                            <td style={{ padding: '16px 18px', color: 'white', fontWeight: 700 }}>{formatMoney(customer.totalSpent)}</td>
                            <td style={{ padding: '16px 18px' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {customer.tags.map((tag) => {
                                  const tint = tagStyle(tag)
                                  return (
                                    <span
                                      key={tag}
                                      style={{
                                        padding: '5px 8px',
                                        borderRadius: 999,
                                        border: `1px solid ${tint.border}`,
                                        background: tint.bg,
                                        color: tint.color,
                                        fontSize: 10,
                                        fontWeight: 700,
                                      }}
                                    >
                                      {tag}
                                    </span>
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.section>
          </div>

          <AnimatePresence>
            {selected ? (
              <motion.aside
                key={selected.id}
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={slideInRight}
                transition={oceanTransition(reduceMotion, { duration: 0.22 })}
                style={{
                  ...glassCard,
                  position: isMobile ? 'relative' : 'fixed',
                  top: isMobile ? 'auto' : 32,
                  right: isMobile ? 'auto' : 32,
                  width: isMobile ? '100%' : 360,
                  maxHeight: isMobile ? 'none' : 'calc(100vh - 64px)',
                  overflowY: 'auto',
                  padding: 18,
                  zIndex: 30,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ color: 'white', fontSize: 20, fontWeight: 700 }}>{selected.name}</div>
                    <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.42)', fontSize: 13 }}>Customer profile</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.72)',
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selected.tags.map((tag) => {
                    const tint = tagStyle(tag)
                    return (
                      <span
                        key={tag}
                        style={{
                          padding: '5px 8px',
                          borderRadius: 999,
                          border: `1px solid ${tint.border}`,
                          background: tint.bg,
                          color: tint.color,
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {tag}
                      </span>
                    )
                  })}
                </div>

                <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
                  {[
                    { label: 'Email', value: selected.email || '—' },
                    { label: 'Phone', value: selected.phone },
                    { label: 'Joined', value: selected.joined },
                    { label: 'Last visit', value: selected.lastVisit },
                    { label: 'Preferred staff', value: selected.preferredStaff },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        borderRadius: 16,
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.04)',
                        padding: '12px 14px',
                      }}
                    >
                      <div
                        style={{
                          color: 'rgba(255,255,255,0.38)',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {item.label}
                      </div>
                      <div style={{ marginTop: 6, color: 'white', fontSize: 14, fontWeight: 600 }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div
                    style={{
                      borderRadius: 16,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.04)',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                      Bookings
                    </div>
                    <div style={{ marginTop: 6, color: 'white', fontSize: 22, fontWeight: 700 }}>{selected.totalBookings}</div>
                  </div>
                  <div
                    style={{
                      borderRadius: 16,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.04)',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                      Total spent
                    </div>
                    <div style={{ marginTop: 6, color: 'white', fontSize: 22, fontWeight: 700 }}>
                      {formatMoney(selected.totalSpent)}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 18 }}>
                  <div style={{ color: 'white', fontSize: 14, fontWeight: 700 }}>Visit history</div>
                  <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                    {selected.visitHistory.length === 0 ? (
                      <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: 13 }}>No visits recorded yet.</div>
                    ) : (
                      selected.visitHistory.map((visit) => (
                        <div
                          key={`${visit.date}-${visit.service}`}
                          style={{
                            borderRadius: 16,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.04)',
                            padding: '12px 14px',
                          }}
                        >
                          <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11 }}>{visit.date}</div>
                          <div style={{ marginTop: 6, color: 'white', fontSize: 13, fontWeight: 700 }}>{visit.service}</div>
                          <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
                            {visit.amount === 0 ? 'Complimentary' : formatMoney(visit.amount)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 18 }}>
                  <label
                    style={{
                      display: 'block',
                      color: 'rgba(255,255,255,0.42)',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Add a note about preferences, follow-ups, or objections..."
                    rows={5}
                    style={{
                      width: '100%',
                      marginTop: 10,
                      borderRadius: 16,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.04)',
                      color: 'white',
                      padding: '12px 14px',
                      resize: 'vertical',
                      outline: 'none',
                      fontFamily: 'inherit',
                      fontSize: 13,
                    }}
                  />
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </main>
      )}
    </DashboardOceanNav>
  )
}
