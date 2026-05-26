'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { CrmGuestDetail } from '@/components/crm-guest-detail'
import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { bk, bkCard } from '@/lib/bookings-compact-ui'
import type { CrmCustomer } from '@/lib/crm-customer'
import { mapDbCustomerBase } from '@/lib/crm-customer'
import { enrichCrmCustomers, type CrmAppointmentRow } from '@/lib/crm-guest-metrics'
import {
  crmTagChipStyle,
  displayGuestName,
  formatAvgPartySize,
  getGuestInitials,
  GUEST_TAG_FILTERS,
  guestMatchesFilter,
  guestNameHue,
  type CrmGuestTag,
  type GuestTagFilter,
  unknownGuestAvatarStyle,
} from '@/lib/guest-display'
import { supabase } from '@/lib/supabase'

function GuestAvatar({ name, isUnknown, size = 34 }: { name: string; isUnknown: boolean; size?: number }) {
  const hue = guestNameHue(name)
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: isUnknown
          ? unknownGuestAvatarStyle.background
          : `linear-gradient(135deg, hsl(${hue} 60% 65%), hsl(${(hue + 35) % 360} 50% 42%))`,
        display: 'grid',
        placeItems: 'center',
        color: isUnknown ? unknownGuestAvatarStyle.color : '#fff',
        fontSize: size * 0.38,
        fontWeight: 600,
      }}
    >
      {getGuestInitials(name)}
    </div>
  )
}

function CrmTagChips({ tags, compact }: { tags: CrmGuestTag[]; compact?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 4 : 6 }}>
      {tags.map((tag) => {
        const ts = crmTagChipStyle(tag)
        return (
          <span
            key={tag}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: compact ? '2px 6px' : '2px 8px',
              borderRadius: 999,
              fontSize: compact ? 8 : 9,
              fontWeight: 700,
              background: ts.bg,
              border: `1px solid ${ts.border}`,
              color: ts.color,
              whiteSpace: 'nowrap',
            }}
          >
            {tag === 'Loyal' ? (
              <span style={{ fontSize: compact ? 7 : 8, lineHeight: 1 }} aria-hidden>
                ★
              </span>
            ) : (
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: ts.dot, flexShrink: 0 }} />
            )}
            {tag}
          </span>
        )
      })}
    </div>
  )
}

const FILTERS = GUEST_TAG_FILTERS

function CrmGuestFilterBar({
  value,
  onChange,
}: {
  value: GuestTagFilter
  onChange: (next: GuestTagFilter) => void
}) {
  const reduceMotion = useReducedMotion()
  const trackRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Partial<Record<GuestTagFilter, HTMLButtonElement>>>({})
  const [indicator, setIndicator] = useState({ x: 0, width: 0, height: 0 })

  const measureIndicator = useCallback(() => {
    const track = trackRef.current
    const button = buttonRefs.current[value]
    if (!track || !button) return
    const trackRect = track.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    setIndicator({
      x: buttonRect.left - trackRect.left,
      width: buttonRect.width,
      height: buttonRect.height,
    })
  }, [value])

  useLayoutEffect(() => {
    measureIndicator()
    const frame = requestAnimationFrame(measureIndicator)
    return () => cancelAnimationFrame(frame)
  }, [measureIndicator])

  useEffect(() => {
    window.addEventListener('resize', measureIndicator)
    return () => window.removeEventListener('resize', measureIndicator)
  }, [measureIndicator])

  return (
    <div style={{ width: 'fit-content', maxWidth: '100%', justifySelf: 'start' }}>
      <motion.div
        ref={trackRef}
        layout={false}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <motion.div
          aria-hidden
          initial={false}
          animate={{
            x: indicator.x,
            width: indicator.width,
            height: indicator.height,
          }}
          transition={
            reduceMotion
              ? { duration: 0.01 }
              : { type: 'spring', stiffness: 520, damping: 38, mass: 0.72 }
          }
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            borderRadius: 999,
            background: '#0f172a',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.12)',
            pointerEvents: 'none',
            willChange: 'transform, width, height',
          }}
        />
        {FILTERS.map((f) => {
          const active = value === f
          return (
            <button
              key={f}
              ref={(el) => {
                if (el) buttonRefs.current[f] = el
              }}
              type="button"
              onClick={() => onChange(f)}
              aria-pressed={active}
              style={{
                position: 'relative',
                zIndex: 1,
                padding: '5px 12px',
                borderRadius: 999,
                border: active ? '1px solid transparent' : bk.border,
                background: active ? 'transparent' : '#ffffff',
                color: active ? '#ffffff' : '#64748b',
                fontSize: bk.caption,
                fontWeight: active ? 600 : 500,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                fontFamily: bk.font,
                outline: 'none',
                transition: 'color 0.15s ease',
              }}
            >
              {f}
            </button>
          )
        })}
      </motion.div>
    </div>
  )
}

type CrmGuestsClientProps = {
  initialCustomers: CrmCustomer[]
  initialBusinessId: string | null
}

export function CrmGuestsClient({ initialCustomers, initialBusinessId }: CrmGuestsClientProps) {
  const [customers, setCustomers] = useState(initialCustomers)
  const [loading, setLoading] = useState(initialCustomers.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterTag, setFilterTag] = useState<GuestTagFilter>('All')
  const [businessId, setBusinessId] = useState<string | null>(initialBusinessId)
  const customersRef = useRef(initialCustomers)
  customersRef.current = customers

  const loadCustomers = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? customersRef.current.length > 0
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setCustomers([])
      setBusinessId(null)
      if (!silent) setLoading(false)
      return
    }
    const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).maybeSingle()
    if (!biz?.id) {
      setCustomers([])
      setBusinessId(null)
      if (!silent) setLoading(false)
      return
    }
    setBusinessId((prev) => (prev === biz.id ? prev : biz.id))
    const [customersRes, appointmentsRes] = await Promise.all([
      supabase
        .from('customers')
        .select('*')
        .eq('business_id', biz.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('appointments')
        .select('customer_id, scheduled_at, status, service_name')
        .eq('business_id', biz.id),
    ])
    if (customersRes.error) {
      setError("We couldn't load your guest list.")
      if (!silent) setCustomers([])
    } else {
      const bases = (customersRes.data ?? []).map((r) =>
        mapDbCustomerBase(r as Record<string, unknown>),
      )
      const appointments = (appointmentsRes.data ?? []) as CrmAppointmentRow[]
      const next = enrichCrmCustomers(bases, appointments)
      setCustomers((prev) => {
        if (
          prev.length === next.length &&
          prev.every(
            (p, i) =>
              p.id === next[i]?.id &&
              p.name === next[i]?.name &&
              p.bookingCount === next[i]?.bookingCount &&
              p.notes === next[i]?.notes &&
              p.phone === next[i]?.phone &&
              p.email === next[i]?.email &&
              p.tags.join(',') === next[i]?.tags.join(','),
          )
        ) {
          return prev
        }
        return next
      })
    }
    if (!silent) setLoading(false)
  }, [])

  const loadCustomersRef = useRef(loadCustomers)
  loadCustomersRef.current = loadCustomers

  useEffect(() => {
    void loadCustomersRef.current({ silent: true })
  }, [])

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setSelectedId(null)
        void loadCustomersRef.current()
        return
      }
      void loadCustomersRef.current({ silent: true })
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const stats = useMemo(() => {
    const total = customers.length
    const now = new Date()
    const newThisMonth = customers.filter((c) => {
      const d = c.joinedRaw ? new Date(c.joinedRaw) : new Date(c.joined)
      return (
        !Number.isNaN(d.getTime()) &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      )
    }).length
    const returningCount = customers.filter((c) => c.bookingCount >= 2).length
    const repeatRate = total > 0 ? Math.round((returningCount / total) * 100) : 0
    return { total, newThisMonth, repeatRate, returningCount }
  }, [customers])

  const enriched = useMemo(
    () =>
      customers.map((c) => ({
        ...c,
        displayLabel: displayGuestName(c.name),
        contact: c.email || (c.phone !== '—' ? c.phone : ''),
        lastBookingLabel: c.lastBooking === '—' ? 'Never' : c.lastBooking,
        avgPartyLabel: formatAvgPartySize(c.avgPartySize),
      })),
    [customers],
  )

  const filtered = useMemo(() => {
    let list = enriched
    if (filterTag !== 'All') {
      list = list.filter((c) => guestMatchesFilter(c.tags, filterTag))
    }
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (c) =>
          c.displayLabel.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q),
      )
    }
    return list
  }, [enriched, query, filterTag])

  const selected = customers.find((c) => c.id === selectedId) ?? null

  function handleNotesSaved(id: string, notes: string) {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, notes } : c)))
  }

  function handleDelete(id: string) {
    setCustomers((prev) => prev.filter((c) => c.id !== id))
    setSelectedId(null)
  }

  const showInitialSkeleton = loading && customers.length === 0

  return (
    <DashboardOceanNav activeNav="CRM" flatBackground="#f8fafc">
      {({ isMobile, openNav }) => (
        <main
          style={{
            background: '#f8fafc',
            minHeight: '100vh',
            margin: isMobile ? '-20px -16px' : '-36px',
            padding: isMobile ? bk.pagePadMobile : bk.pagePad,
            display: 'grid',
            gap: 12,
            fontFamily: bk.font,
          }}
        >
          {isMobile && (
            <button
              type="button"
              onClick={openNav}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                border: bk.border,
                background: '#fff',
                fontSize: 18,
                cursor: 'pointer',
                justifySelf: 'start',
              }}
            >
              ☰
            </button>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ fontSize: bk.micro, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Guest CRM
              </div>
              <h1 style={{ margin: '4px 0 0', fontSize: bk.h1, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.03em' }}>
                Guests
              </h1>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: bk.body,
                  color: '#64748b',
                  minHeight: 18,
                }}
              >
                {showInitialSkeleton
                  ? 'Loading guest list…'
                  : `${stats.total} guest${stats.total === 1 ? '' : 's'} from AI chats`}
              </p>
            </div>
            <div style={{ position: 'relative', flex: isMobile ? '1 1 100%' : '0 1 280px', minWidth: isMobile ? undefined : 200 }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.8"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, phone…"
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 30px',
                  borderRadius: bk.radiusSm,
                  border: bk.border,
                  background: '#fff',
                  fontSize: bk.body,
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: bk.gapMd }}>
            {[
              { label: 'Total guests', value: showInitialSkeleton ? '—' : String(stats.total), sub: undefined },
              {
                label: 'New this month',
                value: showInitialSkeleton ? '—' : String(stats.newThisMonth),
                sub: undefined,
              },
              {
                label: 'Repeat rate',
                value: showInitialSkeleton ? '—' : `${stats.repeatRate}%`,
                sub: showInitialSkeleton
                  ? ' '
                  : stats.total > 0
                    ? `${stats.returningCount} returning`
                    : 'No repeat guests yet',
              },
            ].map(({ label, value, sub }) => (
              <div key={label} style={{ ...bkCard, padding: bk.cardPad, minHeight: 88 }}>
                <div style={{ fontSize: bk.micro, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {label}
                </div>
                <div
                  style={{
                    fontSize: bk.statValue,
                    fontWeight: 700,
                    color: '#0f172a',
                    marginTop: 4,
                    lineHeight: 1,
                    minHeight: 28,
                  }}
                >
                  {value}
                </div>
                <div style={{ fontSize: bk.micro, color: '#64748b', marginTop: 4, minHeight: 14 }}>
                  {sub ?? '\u00a0'}
                </div>
              </div>
            ))}
          </div>

          <CrmGuestFilterBar value={filterTag} onChange={setFilterTag} />

          {error && (
            <div style={{ padding: 12, borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: bk.body }}>
              {error}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : selected ? 'minmax(0, 1fr) 320px' : '1fr',
              gap: bk.gapMd,
              alignItems: 'start',
            }}
          >
            <div style={{ ...bkCard, overflow: 'hidden', minHeight: showInitialSkeleton ? 320 : undefined }}>
              {showInitialSkeleton ? (
                <div style={{ padding: 16, display: 'grid', gap: 8 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        height: 48,
                        borderRadius: 8,
                        background: 'linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)',
                      }}
                    />
                  ))}
                </div>
              ) : customers.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>No guests yet</div>
                  <p style={{ marginTop: 6, fontSize: bk.body, color: '#64748b', lineHeight: 1.5 }}>
                    When guests chat with your AI, their profiles appear here.
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: bk.body }}>
                  No guests match this filter
                </div>
              ) : isMobile ? (
                <div style={{ padding: 10, display: 'grid', gap: 6 }}>
                  {filtered.map((c) => {
                    const active = c.id === selectedId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedId(active ? null : c.id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: active ? '1px solid #bfdbfe' : bk.border,
                          background: active ? '#eff6ff' : '#fff',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          gap: 8,
                          fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <GuestAvatar name={c.name} isUnknown={c.isUnknownGuest} size={36} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: bk.body,
                                fontWeight: 600,
                                color: c.isUnknownGuest ? '#94a3b8' : '#0f172a',
                              }}
                            >
                              {c.displayLabel}
                            </div>
                            <div
                              style={{
                                fontSize: bk.micro,
                                color: '#94a3b8',
                                marginTop: 2,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {c.contact || 'No contact'}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: bk.micro, color: '#64748b' }}>
                          {c.bookingCount} booking{c.bookingCount === 1 ? '' : 's'} · Last {c.lastBookingLabel}
                        </div>
                        <CrmTagChips tags={c.tags} compact />
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      minWidth: 920,
                      borderCollapse: 'collapse',
                      tableLayout: 'fixed',
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
                        {[
                          { col: 'Guest', w: '26%' },
                          { col: 'Joined', w: '12%' },
                          { col: 'Bookings', w: '9%' },
                          { col: 'Last booking', w: '14%' },
                          { col: 'Avg party', w: '9%' },
                          { col: 'Tags', w: '30%' },
                        ].map(({ col, w }) => (
                          <th
                            key={col}
                            style={{
                              padding: '8px 12px',
                              textAlign: 'left',
                              fontSize: 9,
                              fontWeight: 700,
                              color: '#94a3b8',
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              width: w,
                            }}
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c, i) => {
                        const active = c.id === selectedId
                        return (
                          <tr
                            key={c.id}
                            onClick={() => setSelectedId(c.id)}
                            style={{
                              cursor: 'pointer',
                              background: active ? '#eff6ff' : 'transparent',
                              borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
                            }}
                          >
                            <td style={{ padding: '9px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                <GuestAvatar name={c.name} isUnknown={c.isUnknownGuest} />
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontSize: bk.body,
                                      fontWeight: 600,
                                      color: c.isUnknownGuest ? '#94a3b8' : '#0f172a',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {c.displayLabel}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: bk.micro,
                                      color: '#94a3b8',
                                      marginTop: 2,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {c.contact || 'No contact'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '9px 12px', fontSize: bk.body, color: '#64748b' }}>{c.joined}</td>
                            <td style={{ padding: '9px 12px', fontSize: bk.body, fontWeight: 700, color: '#0f172a' }}>
                              {c.bookingCount}
                            </td>
                            <td style={{ padding: '9px 12px', fontSize: bk.body, color: '#64748b' }}>
                              {c.lastBookingLabel}
                            </td>
                            <td style={{ padding: '9px 12px', fontSize: bk.body, color: '#64748b' }}>
                              {c.avgPartyLabel}
                            </td>
                            <td style={{ padding: '9px 12px' }}>
                              <CrmTagChips tags={c.tags} compact />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selected && (
              <CrmGuestDetail
                customer={selected}
                businessId={businessId}
                onClose={() => setSelectedId(null)}
                onNotesSaved={handleNotesSaved}
                onDelete={handleDelete}
              />
            )}
          </div>
        </main>
      )}
    </DashboardOceanNav>
  )
}
