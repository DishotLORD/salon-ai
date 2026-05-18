'use client'

import { useEffect, useMemo, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────
function formatDisplayDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseTags(raw: unknown): CustomerTag[] {
  const valid: CustomerTag[] = ['VIP', 'Regular', 'New', 'At Risk']
  let values: unknown[] = []
  if (Array.isArray(raw)) values = raw
  else if (typeof raw === 'string') {
    try { const p = JSON.parse(raw) as unknown; values = Array.isArray(p) ? p : [] } catch { values = [] }
  }
  const out: CustomerTag[] = []
  for (const v of values) {
    const m = valid.find(i => i.toLowerCase() === String(v).trim().toLowerCase())
    if (m) out.push(m)
  }
  return out.length ? Array.from(new Set(out)) : ['Regular']
}

function parseVisitHistory(raw: unknown): { date: string; service: string; amount: number }[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw.map(entry => {
    if (typeof entry !== 'object' || entry === null) return { date: '—', service: '—', amount: 0 }
    const o = entry as Record<string, unknown>
    return {
      date: o.date ? formatDisplayDate(String(o.date)) : '—',
      service: o.service ? String(o.service) : '—',
      amount: Number(o.amount) || 0,
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

function formatMoney(amount: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function getInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('')
}

// Hue from name for avatar gradient
function nameHue(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

const NOTES_PREFIX = 'oceancore.crm.notes.'

// ─── Tag styling ─────────────────────────────────────────────
type TierStyle = { bg: string; border: string; color: string; dot: string }
function tierStyle(tag: CustomerTag): TierStyle {
  switch (tag) {
    case 'VIP':      return { bg: 'rgba(250,204,21,0.10)', border: 'rgba(250,204,21,0.28)', color: '#fbbf24', dot: '#fbbf24' }
    case 'Regular':  return { bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.28)', color: '#38bdf8', dot: '#38bdf8' }
    case 'New':      return { bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.28)', color: '#4ade80', dot: '#4ade80' }
    case 'At Risk':  return { bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.28)', color: '#f87171', dot: '#f87171' }
    default:         return { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.12)', color: '#94a8c4', dot: '#94a8c4' }
  }
}

// ─── Small KV cell ───────────────────────────────────────────
function KvCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 10,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(125,211,252,0.10)',
    }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#6b7f9c', fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e8f1ff' }}>{value}</div>
    </div>
  )
}

// ─── Mini stat card ──────────────────────────────────────────
function MiniStat({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="glass" style={{ padding: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#6b7f9c', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
        <div style={{ fontSize: 24, fontWeight: 600, color: '#e8f1ff', letterSpacing: '-0.02em' }}>{value}</div>
        {delta && (
          <div style={{ fontSize: 11, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 2 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
            {delta}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Avatar ──────────────────────────────────────────────────
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const hue = nameHue(name)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, hsl(${hue} 60% 65%), hsl(${(hue + 35) % 360} 50% 42%))`,
      display: 'grid', placeItems: 'center',
      color: 'rgba(255,255,255,0.95)',
      fontSize: size * 0.38, fontWeight: 600,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 10px -4px rgba(0,0,0,0.45)`,
    }}>
      {getInitials(name)}
    </div>
  )
}

// ─── Signal bar row ──────────────────────────────────────────
function SignalRow({ label, value, pct }: { label: string; value: string; pct?: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 0', borderTop: '1px solid rgba(125,211,252,0.08)',
    }}>
      <span style={{ fontSize: 11.5, color: '#94a8c4', flex: 1 }}>{label}</span>
      {pct != null && (
        <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <div style={{
            width: `${Math.round(pct * 100)}%`, height: '100%',
            background: '#38bdf8', borderRadius: 3,
            boxShadow: '0 0 6px rgba(56,189,248,0.6)',
          }}/>
        </div>
      )}
      <span style={{ fontSize: 11.5, fontFamily: 'var(--font-geist-mono)', color: '#e8f1ff' }}>{value}</span>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────
export default function GuestsPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [filterTag, setFilterTag] = useState<'All' | CustomerTag>('All')

  // Notes persistence
  useEffect(() => {
    if (!selectedId) { setNotes(''); return }
    setNotes(window.localStorage.getItem(`${NOTES_PREFIX}${selectedId}`) ?? '')
  }, [selectedId])
  useEffect(() => {
    if (!selectedId) return
    const key = `${NOTES_PREFIX}${selectedId}`
    notes ? window.localStorage.setItem(key, notes) : window.localStorage.removeItem(key)
  }, [notes, selectedId])

  // Data fetch
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) { setCustomers([]); setLoading(false) }; return }
      const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).maybeSingle()
      if (!biz?.id) { if (!cancelled) { setCustomers([]); setLoading(false) }; return }
      const { data: rows, error: err } = await supabase.from('customers').select('*').eq('business_id', biz.id).order('name', { ascending: true })
      if (!cancelled) {
        if (err) { setError("We couldn't load your guest list."); setCustomers([]) }
        else setCustomers((rows ?? []).map(r => mapDbCustomerRow(r as Record<string, unknown>)))
        setLoading(false)
      }
    }
    void load()
    const { data: sub } = supabase.auth.onAuthStateChange(event => {
      if (['SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED'].includes(event) && !cancelled) void load()
    })
    return () => { cancelled = true; sub.subscription.unsubscribe() }
  }, [])

  const stats = useMemo(() => {
    const total = customers.length
    const now = new Date()
    const newThisMonth = customers.filter(c => {
      const d = new Date(c.joined)
      return !Number.isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }).length
    const returning = customers.filter(c => c.totalBookings >= 2).length
    const avgSpend = Math.round(customers.reduce((s, c) => s + c.totalSpent, 0) / Math.max(total, 1))
    return { total, newThisMonth, returning, avgSpend }
  }, [customers])

  const filtered = useMemo(() => {
    let list = customers
    if (filterTag !== 'All') list = list.filter(c => c.tags.includes(filterTag))
    const q = query.trim().toLowerCase()
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q))
    return list
  }, [customers, query, filterTag])

  const selected = customers.find(c => c.id === selectedId) ?? null

  return (
    <DashboardOceanNav activeNav="CRM">
      {({ isMobile, openNav }) => (
        <main style={{ display: 'grid', gap: 18, position: 'relative' }}>

          {isMobile && (
            <button type="button" onClick={openNav} style={{
              width: 44, height: 44, borderRadius: 12,
              border: '1px solid rgba(125,211,252,0.14)',
              background: 'rgba(14,26,50,0.58)',
              color: '#e8f1ff', fontSize: 20, cursor: 'pointer',
            }}>☰</button>
          )}

          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#6b7f9c', fontWeight: 600, marginBottom: 4 }}>
                Guest CRM
              </div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.025em', color: '#e8f1ff' }}>
                Guests
              </h1>
              <div style={{ marginTop: 4, fontSize: 13, color: '#6b7f9c' }}>
                {customers.length > 0
                  ? `${customers.length.toLocaleString()} contacts built from bot conversations`
                  : 'Contacts appear as your bot talks to guests'}
              </div>
            </div>

            {/* Search bar */}
            <div className="glass" style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 999, minWidth: 280,
              background: 'rgba(255,255,255,0.04)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7f9c" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search name, email, phone…"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: '#e8f1ff', fontSize: 13,
                }}
              />
            </div>
          </div>

          {/* ── Stats ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 14 }}>
            <MiniStat label="Total guests"  value={stats.total.toString()} />
            <MiniStat label="New this month" value={stats.newThisMonth.toString()} />
            <MiniStat label="Returning"     value={stats.returning.toString()} />
            <MiniStat label="Avg spend"     value={formatMoney(stats.avgSpend)} />
          </div>

          {/* ── Tier filter ── */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['All', 'VIP', 'Regular', 'New', 'At Risk'] as const).map(f => {
              const active = filterTag === f
              const style = f !== 'All' ? tierStyle(f) : null
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilterTag(f)}
                  style={{
                    padding: '6px 14px', borderRadius: 999, border: '1px solid',
                    borderColor: active && style ? style.border : active ? 'rgba(56,189,248,0.3)' : 'rgba(125,211,252,0.12)',
                    background: active && style ? style.bg : active ? 'rgba(56,189,248,0.1)' : 'rgba(255,255,255,0.03)',
                    color: active && style ? style.color : active ? '#38bdf8' : '#94a8c4',
                    fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 0.18s ease',
                  }}
                >
                  {f}
                </button>
              )
            })}
          </div>

          {/* ── Main grid: table + detail ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: selected && !isMobile ? 'minmax(0,1fr) 340px' : '1fr',
            gap: 14, alignItems: 'start',
          }}>

            {/* Table */}
            <div className="glass" style={{ overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 24, display: 'grid', gap: 8 }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ height: 52, borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}/>
                  ))}
                </div>
              ) : error ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#f87171', fontSize: 13 }}>{error}</div>
              ) : customers.length === 0 ? (
                <div style={{ padding: 48, textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>👤</div>
                  <div style={{ color: '#e8f1ff', fontSize: 15, fontWeight: 600 }}>No guests yet</div>
                  <div style={{ marginTop: 6, color: '#6b7f9c', fontSize: 13, lineHeight: 1.6 }}>
                    Once guests start chatting with your AI, their profiles will show up here.
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#6b7f9c', fontSize: 13 }}>
                  No guests match that search
                </div>
              ) : isMobile ? (
                /* Mobile: card list */
                <div style={{ padding: 12, display: 'grid', gap: 8 }}>
                  {filtered.map(c => {
                    const tag = c.tags[0] ?? 'Regular'
                    const ts = tierStyle(tag)
                    const isActive = c.id === selectedId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedId(isActive ? null : c.id)}
                        style={{
                          width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                          padding: '12px 14px', borderRadius: 12,
                          background: isActive ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isActive ? 'rgba(56,189,248,0.3)' : 'rgba(125,211,252,0.08)'}`,
                          display: 'flex', alignItems: 'center', gap: 12,
                          transition: 'all 0.18s ease',
                        }}
                      >
                        <Avatar name={c.name} size={38}/>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#e8f1ff' }}>{c.name}</div>
                          <div style={{ fontSize: 11.5, color: '#6b7f9c', marginTop: 2 }}>{c.email || c.phone}</div>
                        </div>
                        <span style={{
                          padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                          background: ts.bg, border: `1px solid ${ts.border}`, color: ts.color,
                        }}>{tag}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                /* Desktop: table */
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(125,211,252,0.10)' }}>
                        {['Guest', 'Contact', 'Last Visit', 'Visits', 'Spent', 'Tag'].map(col => (
                          <th key={col} style={{
                            padding: '13px 18px', textAlign: 'left',
                            fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase',
                            color: '#6b7f9c', fontWeight: 600,
                            background: 'rgba(255,255,255,0.02)',
                          }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c, i) => {
                        const tag = c.tags[0] ?? 'Regular'
                        const ts = tierStyle(tag)
                        const isActive = c.id === selectedId
                        return (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedId(isActive ? null : c.id)}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                            style={{
                              cursor: 'pointer',
                              borderBottom: i < filtered.length - 1 ? '1px solid rgba(125,211,252,0.07)' : 'none',
                              background: isActive ? 'rgba(56,189,248,0.07)' : 'transparent',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            {/* Guest */}
                            <td style={{ padding: '13px 18px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Avatar name={c.name} size={34}/>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e8f1ff' }}>{c.name}</div>
                                  <div style={{ fontSize: 11, color: '#6b7f9c', marginTop: 2 }}>Joined {c.joined}</div>
                                </div>
                              </div>
                            </td>
                            {/* Contact */}
                            <td style={{ padding: '13px 18px' }}>
                              <div style={{ fontSize: 12.5, color: '#94a8c4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                                {c.email || c.phone}
                              </div>
                              {c.email && c.phone && (
                                <div style={{ fontSize: 11, color: '#6b7f9c', marginTop: 2 }}>{c.phone}</div>
                              )}
                            </td>
                            {/* Last Visit */}
                            <td style={{ padding: '13px 18px', color: '#94a8c4', fontSize: 12.5 }}>{c.lastVisit}</td>
                            {/* Visits */}
                            <td style={{ padding: '13px 18px' }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#e8f1ff', fontFamily: 'var(--font-geist-mono)' }}>
                                {c.totalBookings}
                              </span>
                            </td>
                            {/* Spent */}
                            <td style={{ padding: '13px 18px' }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#e8f1ff', fontFamily: 'var(--font-geist-mono)' }}>
                                {formatMoney(c.totalSpent)}
                              </span>
                            </td>
                            {/* Tag */}
                            <td style={{ padding: '13px 18px' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '3px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 600,
                                background: ts.bg, border: `1px solid ${ts.border}`, color: ts.color,
                              }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: ts.dot, flexShrink: 0 }}/>
                                {tag}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Guest detail panel ── */}
            {selected && (
              <aside className="glass" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#6b7f9c', fontWeight: 600 }}>Guest</div>
                    <div style={{ marginTop: 3, fontSize: 10.5 }}>
                      {selected.tags.map(tag => {
                        const ts = tierStyle(tag)
                        return (
                          <span key={tag} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 5,
                            padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                            background: ts.bg, border: `1px solid ${ts.border}`, color: ts.color,
                          }}>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', background: ts.dot }}/>
                            {tag}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      border: '1px solid rgba(125,211,252,0.14)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#6b7f9c', cursor: 'pointer', fontSize: 14,
                    }}
                  >×</button>
                </div>

                {/* Avatar + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={selected.name} size={46}/>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#e8f1ff', letterSpacing: '-0.01em' }}>
                      {selected.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7f9c', fontFamily: 'var(--font-geist-mono)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                      {selected.phone}
                    </div>
                  </div>
                </div>

                {/* KV stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <KvCell label="Visits"    value={String(selected.totalBookings)}/>
                  <KvCell label="Spent"     value={formatMoney(selected.totalSpent)}/>
                  <KvCell label="Joined"    value={selected.joined}/>
                  <KvCell label="Last seen" value={selected.lastVisit}/>
                </div>

                {/* Signals */}
                <div style={{ padding: '4px 0' }}>
                  <div style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#6b7f9c', fontWeight: 600, marginBottom: 6 }}>
                    Guest signals
                  </div>
                  <SignalRow label="Loyalty"  value={selected.totalBookings >= 10 ? 'High' : selected.totalBookings >= 3 ? 'Medium' : 'New'} pct={Math.min(selected.totalBookings / 15, 1)}/>
                  <SignalRow label="Tier"     value={selected.tags[0] ?? 'Regular'}/>
                  <SignalRow label="Channel"  value="Web bot"/>
                  {selected.email && <SignalRow label="Email" value={selected.email}/>}
                </div>

                {/* Visit history */}
                {selected.visitHistory.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#6b7f9c', fontWeight: 600, marginBottom: 8 }}>
                      Reservation history
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {selected.visitHistory.slice(0, 4).map((v, i) => (
                        <div key={i} style={{
                          padding: '9px 12px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(125,211,252,0.08)',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 500, color: '#e8f1ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {v.service}
                            </div>
                            <div style={{ fontSize: 11, color: '#6b7f9c', marginTop: 2 }}>{v.date}</div>
                          </div>
                          <div style={{ fontSize: 12.5, fontFamily: 'var(--font-geist-mono)', color: '#94a8c4', flexShrink: 0 }}>
                            {v.amount === 0 ? 'Comp' : formatMoney(v.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label style={{
                    display: 'block', marginBottom: 8,
                    fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#6b7f9c', fontWeight: 600,
                  }}>
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Dietary restrictions, seating preferences, special occasions…"
                    rows={4}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      borderRadius: 10, border: '1px solid rgba(125,211,252,0.12)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#e8f1ff', padding: '10px 12px',
                      resize: 'vertical', outline: 'none',
                      fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5,
                    }}
                  />
                  <div style={{ marginTop: 5, fontSize: 10.5, color: '#6b7f9c' }}>Auto-saved on this device.</div>
                </div>
              </aside>
            )}
          </div>
        </main>
      )}
    </DashboardOceanNav>
  )
}
