'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { oceanTransition, slideInRight } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'
import { card, t } from '@/lib/dashboard-theme'

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

const glassCard = card

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
      return { bg: '#fef3c7', border: '#fde68a', color: '#a16207' }
    case 'Regular':
      return { bg: t.accentSoftBg, border: t.accentSoftBorder, color: t.accentText }
    case 'New':
      return { bg: t.successBg, border: t.successBorder, color: t.success }
    case 'At Risk':
      return { bg: t.dangerBg, border: t.dangerBorder, color: t.danger }
    default:
      return { bg: t.bgSurfaceMuted, border: t.border, color: t.textMuted }
  }
}

function tagLabel(tag: CustomerTag): string {
  return tag === 'New' ? 'First Visit' : tag
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

const NOTES_PREFIX = 'oceancore.crm.notes.'

export default function CrmPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [crmLoading, setCrmLoading] = useState(true)
  const [crmError, setCrmError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (typeof window === 'undefined' || !selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear notes when no row is selected
      setNotes('')
      return
    }
    setNotes(window.localStorage.getItem(`${NOTES_PREFIX}${selectedId}`) ?? '')
  }, [selectedId])

  useEffect(() => {
    if (typeof window === 'undefined' || !selectedId) return
    const key = `${NOTES_PREFIX}${selectedId}`
    if (notes) {
      window.localStorage.setItem(key, notes)
    } else {
      window.localStorage.removeItem(key)
    }
  }, [notes, selectedId])

  useEffect(() => {
    let cancelled = false

    async function loadCustomers() {
      setCrmLoading(true)
      setCrmError(null)

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

      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

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
        if (error) {
          setCustomers([])
          setCrmError("We couldn't load your guest list.")
        } else if (rows) {
          setCustomers(rows.map((row) => mapDbCustomerRow(row as Record<string, unknown>)))
        } else {
          setCustomers([])
        }
        setCrmLoading(false)
      }
    }

    void loadCustomers()

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (!cancelled) void loadCustomers()
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
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
                  color: t.text,
                  fontSize: 30,
                  fontWeight: 700,
                  fontFamily: 'var(--font-playfair)',
                  letterSpacing: '-0.03em',
                }}
              >
                Guests
              </h1>
              <p style={{ margin: '8px 0 0', color: t.textMuted, fontSize: 14 }}>
                Search, segment, and manage relationships with every guest your AI Concierge greets.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, width: isMobile ? '100%' : 'auto', flexWrap: 'wrap' }}>
              <div
                style={{
                  ...glassCard,
                  borderRadius: 10,
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
                  placeholder="Search name, email, phone…"
                  style={{
                    width: '100%',
                    height: 44,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: t.text,
                    fontSize: 14,
                  }}
                />
              </div>
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
              { label: 'Guests', value: stats.total.toString() },
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
                    color: t.textMuted,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.16em',
                    fontWeight: 600,
                  }}
                >
                  {item.label}
                </div>
                <div style={{ marginTop: 10, color: t.text, fontSize: 28, fontWeight: 700 }}>{item.value}</div>
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
                    Array.from({ length: 3 }).map((_, idx) => (
                      <div
                        key={idx}
                        style={{
                          height: 72,
                          borderRadius: 12,
                          background: t.bgSurfaceMuted,
                          border: `1px solid ${t.borderSoft}`,
                        }}
                      />
                    ))
                  ) : crmError ? (
                    <div style={{ padding: 24, color: t.danger, textAlign: 'center', lineHeight: 1.6 }}>
                      {crmError}
                    </div>
                  ) : customers.length === 0 ? (
                    <div style={{ padding: 24, color: t.textMuted, textAlign: 'center', lineHeight: 1.6 }}>
                      No guests yet. They&apos;ll appear here once your AI Concierge starts a conversation.
                    </div>
                  ) : filtered.length === 0 ? (
                    <div style={{ padding: 24, color: t.textMuted, textAlign: 'center' }}>
                      No matching guests.
                    </div>
                  ) : (
                    filtered.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => setSelectedId(customer.id)}
                        style={{
                          width: '100%',
                          borderRadius: 12,
                          border: `1px solid ${
                            customer.id === selectedId ? t.accentSoftBorder : t.border
                          }`,
                          background: customer.id === selectedId ? t.accentSoftBg : t.bgSurface,
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
                              background: t.accent,
                              color: '#ffffff',
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {getInitials(customer.name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>{customer.name}</div>
                            <div style={{ marginTop: 4, color: t.textMuted, fontSize: 12 }}>
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
                      <tr style={{ borderBottom: `1px solid ${t.border}`, background: t.bgSurfaceMuted }}>
                        {['Guest', 'Email', 'Phone', 'Last Visit', 'Visits', 'Spent', 'Tags'].map((column) => (
                          <th
                            key={column}
                            style={{
                              padding: '14px 18px',
                              textAlign: 'left',
                              color: t.textMuted,
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.12em',
                            }}
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {crmLoading ? (
                        Array.from({ length: 4 }).map((_, idx) => (
                          <tr key={idx} style={{ borderBottom: `1px solid ${t.borderSoft}` }}>
                            {Array.from({ length: 7 }).map((__, c) => (
                              <td key={c} style={{ padding: '18px' }}>
                                <div
                                  style={{
                                    height: 12,
                                    borderRadius: 6,
                                    background: t.bgSurfaceMuted,
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : crmError ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: t.danger }}>
                            {crmError}
                          </td>
                        </tr>
                      ) : customers.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: t.textMuted }}>
                            No guests yet. They&apos;ll appear here once your AI Concierge starts a conversation.
                          </td>
                        </tr>
                      ) : filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: t.textMuted }}>
                            No matching guests.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((customer) => (
                          <tr
                            key={customer.id}
                            onMouseEnter={(event) => {
                              if (customer.id !== selectedId) {
                                event.currentTarget.style.background = t.bgSurfaceMuted
                              }
                            }}
                            onMouseLeave={(event) => {
                              if (customer.id !== selectedId) {
                                event.currentTarget.style.background = 'transparent'
                              }
                            }}
                            onClick={() => setSelectedId(customer.id)}
                            style={{
                              cursor: 'pointer',
                              borderBottom: `1px solid ${t.borderSoft}`,
                              background:
                                customer.id === selectedId ? t.accentSoftBg : 'transparent',
                              transition: 'background-color 0.15s ease',
                            }}
                          >
                            <td style={{ padding: '14px 18px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div
                                  style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: t.accent,
                                    color: '#ffffff',
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  {getInitials(customer.name)}
                                </div>
                                <div>
                                  <div style={{ color: t.text, fontSize: 13, fontWeight: 700 }}>{customer.name}</div>
                                  <div style={{ marginTop: 3, color: t.textMuted, fontSize: 12 }}>
                                    Joined {customer.joined}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '14px 18px', color: t.textMuted, fontSize: 13 }}>
                              {customer.email}
                            </td>
                            <td style={{ padding: '14px 18px', color: t.textMuted, fontSize: 13 }}>
                              {customer.phone}
                            </td>
                            <td style={{ padding: '14px 18px', color: t.textMuted, fontSize: 13 }}>
                              {customer.lastVisit}
                            </td>
                            <td style={{ padding: '14px 18px', color: t.text, fontWeight: 700 }}>{customer.totalBookings}</td>
                            <td style={{ padding: '14px 18px', color: t.text, fontWeight: 700 }}>{formatMoney(customer.totalSpent)}</td>
                            <td style={{ padding: '14px 18px' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {customer.tags.map((tag) => {
                                  const tint = tagStyle(tag)
                                  return (
                                    <span
                                      key={tag}
                                      style={{
                                        padding: '4px 8px',
                                        borderRadius: 999,
                                        border: `1px solid ${tint.border}`,
                                        background: tint.bg,
                                        color: tint.color,
                                        fontSize: 10,
                                        fontWeight: 700,
                                      }}
                                    >
                                      {tagLabel(tag)}
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
                    <div style={{ color: t.text, fontSize: 20, fontWeight: 700 }}>{selected.name}</div>
                    <div style={{ marginTop: 6, color: t.textMuted, fontSize: 13 }}>Guest profile</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      border: `1px solid ${t.border}`,
                      background: t.bgSurface,
                      color: t.textMuted,
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
                          padding: '4px 8px',
                          borderRadius: 999,
                          border: `1px solid ${tint.border}`,
                          background: tint.bg,
                          color: tint.color,
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {tagLabel(tag)}
                      </span>
                    )
                  })}
                </div>

                <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
                  {[
                    { label: 'Email', value: selected.email || '—' },
                    { label: 'Phone', value: selected.phone },
                    { label: 'Joined', value: selected.joined },
                    { label: 'Last visit', value: selected.lastVisit },
                    { label: 'Preferred server', value: selected.preferredStaff },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        borderRadius: 10,
                        border: `1px solid ${t.borderSoft}`,
                        background: t.bgSurfaceMuted,
                        padding: '12px 14px',
                      }}
                    >
                      <div
                        style={{
                          color: t.textMuted,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {item.label}
                      </div>
                      <div style={{ marginTop: 6, color: t.text, fontSize: 14, fontWeight: 600 }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${t.borderSoft}`,
                      background: t.bgSurfaceMuted,
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ color: t.textMuted, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 600 }}>
                      Visits
                    </div>
                    <div style={{ marginTop: 6, color: t.text, fontSize: 22, fontWeight: 700 }}>{selected.totalBookings}</div>
                  </div>
                  <div
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${t.borderSoft}`,
                      background: t.bgSurfaceMuted,
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ color: t.textMuted, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 600 }}>
                      Total spent
                    </div>
                    <div style={{ marginTop: 6, color: t.text, fontSize: 22, fontWeight: 700 }}>
                      {formatMoney(selected.totalSpent)}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 18 }}>
                  <div style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>Reservation history</div>
                  <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                    {selected.visitHistory.length === 0 ? (
                      <div style={{ color: t.textMuted, fontSize: 13 }}>No reservations on record yet.</div>
                    ) : (
                      selected.visitHistory.map((visit) => (
                        <div
                          key={`${visit.date}-${visit.service}`}
                          style={{
                            borderRadius: 10,
                            border: `1px solid ${t.borderSoft}`,
                            background: t.bgSurfaceMuted,
                            padding: '12px 14px',
                          }}
                        >
                          <div style={{ color: t.textMuted, fontSize: 11 }}>{visit.date}</div>
                          <div style={{ marginTop: 6, color: t.text, fontSize: 13, fontWeight: 700 }}>{visit.service}</div>
                          <div style={{ marginTop: 4, color: t.textMuted, fontSize: 12 }}>
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
                      color: t.textMuted,
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
                    placeholder="Dietary restrictions, seating preferences, special occasions…"
                    rows={5}
                    style={{
                      width: '100%',
                      marginTop: 10,
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: t.bgSurface,
                      color: t.text,
                      padding: '12px 14px',
                      resize: 'vertical',
                      outline: 'none',
                      fontFamily: 'inherit',
                      fontSize: 13,
                    }}
                  />
                  <div style={{ marginTop: 6, color: t.textSubtle, fontSize: 11 }}>
                    Auto-saved on this device.
                  </div>
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </main>
      )}
    </DashboardOceanNav>
  )
}
