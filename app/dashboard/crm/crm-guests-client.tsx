'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CrmGuestDetail } from '@/components/crm-guest-detail'
import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { resolveBusinessAccess } from '@/lib/business-access'
import { bk, bkCard } from '@/lib/bookings-compact-ui'
import type { CrmCustomer } from '@/lib/crm-customer'
import { mapDbCustomerBase } from '@/lib/crm-customer'
import {
  enrichCrmCustomers,
  filterVisibleCrmCustomers,
  type CrmAppointmentRow,
} from '@/lib/crm-guest-metrics'
import { guestCsvFilename, guestsToCsv } from '@/lib/guest-csv'
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
        boxShadow: size >= 44 ? 'var(--bk-shadow-md)' : 'none',
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
              padding: compact ? '2px 6px' : '3px 9px',
              borderRadius: 999,
              fontSize: compact ? 8.5 : 10,
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

function CrmGuestFilterBar({
  value,
  onChange,
  counts,
}: {
  value: GuestTagFilter
  onChange: (next: GuestTagFilter) => void
  counts: Record<string, number>
}) {
  const [hover, setHover] = useState<GuestTagFilter | null>(null)
  return (
    // Six filters with counts and labels as long as "Large party" would be
    // squeezed into a fixed segmented track, so these stay chips that can wrap.
    // What they borrow from the chats filters is the quiet language: the active
    // one is a raised surface at full contrast rather than a solid dark block,
    // which was the loudest thing on a page whose point is the guest list.
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {GUEST_TAG_FILTERS.map((f) => {
        const active = value === f
        const hot = hover === f && !active
        return (
          <button
            key={f}
            type="button"
            onClick={() => onChange(f)}
            aria-pressed={active}
            onMouseEnter={() => setHover(f)}
            onMouseLeave={() => setHover(null)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: `1px solid ${active ? 'var(--bk-border-strong)' : 'var(--bk-border)'}`,
              background: active ? 'var(--bk-card)' : hot ? 'var(--bk-surface)' : 'transparent',
              color: active ? 'var(--bk-head)' : 'var(--bk-body)',
              fontSize: bk.caption,
              fontWeight: active ? 700 : 500,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              fontFamily: bk.font,
              outline: 'none',
              boxShadow: active ? 'var(--bk-shadow-md)' : 'none',
              transition: 'background 0.16s ease, color 0.16s ease, border-color 0.16s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {f}
            {counts[f] != null && counts[f] > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1,
                  padding: '2px 6px',
                  borderRadius: 999,
                  background: 'var(--bk-surface)',
                  color: active ? 'var(--bk-head)' : 'var(--bk-muted)',
                  minWidth: 18,
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {counts[f]}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Downloads whatever the table is currently showing, not the whole list — the
 * filters and the search box are how someone narrows to "the VIPs" or "everyone
 * with an allergy", and an export that ignored them would be the wrong file.
 */
function ExportGuestsButton({
  guests,
  disabled,
}: {
  guests: CrmCustomer[]
  disabled: boolean
}) {
  const [hover, setHover] = useState(false)

  const download = useCallback(() => {
    const blob = new Blob([guestsToCsv(guests)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = guestCsvFilename()
    link.click()
    // Revoking immediately can cancel the download in Safari; one tick is enough.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [guests])

  return (
    <button
      type="button"
      onClick={download}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={
        disabled
          ? 'No guests to export'
          : `Download ${guests.length} ${guests.length === 1 ? 'guest' : 'guests'} as a CSV`
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '6px 12px',
        borderRadius: 999,
        border: `1px solid ${hover && !disabled ? 'var(--bk-border-strong)' : 'var(--bk-border)'}`,
        background: hover && !disabled ? 'var(--bk-surface)' : 'transparent',
        color: disabled ? 'var(--bk-muted)' : 'var(--bk-body)',
        fontSize: bk.caption,
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: bk.font,
        transition: 'background 0.16s ease, border-color 0.16s ease',
      }}
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </svg>
      Export CSV
    </button>
  )
}

type SortKey = 'guest' | 'joined' | 'bookings' | 'lastBooking' | 'avgParty' | 'tags'
type SortDir = 'asc' | 'desc'

type GuestColumn = {
  key: SortKey
  label: string
  width: string
  /** Direction a column opens in — the one that answers the question people
   *  ask of it. Names read A→Z; counts and dates are interesting at the top. */
  initialDir: SortDir
  align?: 'right'
}

const GUEST_COLUMNS: GuestColumn[] = [
  { key: 'guest', label: 'Guest', width: '26%', initialDir: 'asc' },
  { key: 'joined', label: 'Joined', width: '12%', initialDir: 'desc' },
  { key: 'bookings', label: 'Bookings', width: '9%', initialDir: 'desc' },
  { key: 'lastBooking', label: 'Last booking', width: '14%', initialDir: 'desc' },
  { key: 'avgParty', label: 'Avg party', width: '11%', initialDir: 'desc' },
  { key: 'tags', label: 'Tags', width: '28%', initialDir: 'desc' },
]

type SortableGuest = {
  displayLabel: string
  joinedRaw: string | null
  bookingCount: number
  lastBookingRaw: string | null
  avgPartySize: number | null
  tags: CrmGuestTag[]
}

/**
 * Value a column sorts on. Deliberately the raw field rather than the text in
 * the cell: "Mar 3" and "Never" sort as calendar dates and as nothing at all,
 * which sorting their labels alphabetically would not give.
 *
 * null means the guest has no value for that column.
 */
function guestSortValue(guest: SortableGuest, key: SortKey): string | number | null {
  const time = (raw: string | null) => {
    if (!raw) return null
    const ms = Date.parse(raw)
    return Number.isFinite(ms) ? ms : null
  }
  switch (key) {
    case 'guest':
      return guest.displayLabel.toLowerCase()
    case 'joined':
      return time(guest.joinedRaw)
    case 'bookings':
      return guest.bookingCount
    case 'lastBooking':
      return time(guest.lastBookingRaw)
    case 'avgParty':
      return guest.avgPartySize
    case 'tags':
      return guest.tags.length
  }
}

function compareGuests(a: SortableGuest, b: SortableGuest, key: SortKey, dir: SortDir): number {
  const av = guestSortValue(a, key)
  const bv = guestSortValue(b, key)
  // Guests missing the value sink to the bottom whichever way the column is
  // pointed. Reversing a sort should reorder the data, not float a wall of
  // "Never" and "—" to the top.
  if (av === null && bv === null) return 0
  if (av === null) return 1
  if (bv === null) return -1
  const sign = dir === 'asc' ? 1 : -1
  if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * sign
  return ((av as number) - (bv as number)) * sign
}

function SortArrow({ dir }: { dir: SortDir | null }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        lineHeight: 0.7,
        fontSize: 7,
        marginLeft: 1,
        color: dir ? 'var(--bk-accent)' : 'var(--bk-border-strong)',
      }}
    >
      <span style={{ opacity: dir === 'desc' ? 0.25 : 1 }}>▲</span>
      <span style={{ opacity: dir === 'asc' ? 0.25 : 1 }}>▼</span>
    </span>
  )
}

type CrmGuestsClientProps = {
  initialCustomers: CrmCustomer[]
  initialBusinessId: string | null
}

export function CrmGuestsClient({ initialCustomers, initialBusinessId }: CrmGuestsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const guestParam = searchParams.get('guest')
  const [customers, setCustomers] = useState(initialCustomers)
  const [loading, setLoading] = useState(initialCustomers.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(guestParam)
  const [filterTag, setFilterTag] = useState<GuestTagFilter>('All')
  // Newest first, which is the order the rows already arrived in, so the table
  // looks unchanged until a column is actually clicked.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'joined', dir: 'desc' })
  const [businessId, setBusinessId] = useState<string | null>(initialBusinessId)
  const customersRef = useRef(initialCustomers)
  // eslint-disable-next-line react-hooks/refs -- latest-ref pattern for silent refetch decisions
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
    const access = await resolveBusinessAccess()
    if (!access) {
      setCustomers([])
      setBusinessId(null)
      if (!silent) setLoading(false)
      return
    }
    const biz = { id: access.businessId }
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
      const next = filterVisibleCrmCustomers(enrichCrmCustomers(bases, appointments))
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
  // eslint-disable-next-line react-hooks/refs -- latest-ref pattern so effects call the current loader
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

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: customers.length }
    for (const f of ['New', 'Regular', 'Loyal', 'No-show', 'Large party'] as GuestTagFilter[]) {
      c[f] = customers.filter((g) => guestMatchesFilter(g.tags, f)).length
    }
    return c
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
    return [...list].sort((a, b) => compareGuests(a, b, sort.key, sort.dir))
  }, [enriched, query, filterTag, sort])

  const toggleSort = useCallback((column: GuestColumn) => {
    setSort((prev) =>
      prev.key === column.key
        ? { key: prev.key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, dir: column.initialDir },
    )
  }, [])

  const selected = customers.find((c) => c.id === selectedId) ?? null

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync selected guest with URL deep link
    if (guestParam) setSelectedId(guestParam)
  }, [guestParam])

  function handleNotesSaved(id: string, notes: string) {
    setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, notes } : c)))
  }

  function handleDelete(id: string) {
    setCustomers((prev) => prev.filter((c) => c.id !== id))
    setSelectedId(null)
  }

  const showInitialSkeleton = loading && customers.length === 0

  return (
    <DashboardOceanNav activeNav="CRM" flatBackground="var(--bk-bg)">
      {({ isMobile, openNav }) => (
        <main
          style={{
            background: 'var(--bk-bg)',
            minHeight: '100vh',
            margin: isMobile ? '-20px -16px' : '-36px',
            padding: isMobile ? bk.pagePadMobile : bk.pagePad,
            display: 'grid',
            gap: 14,
            alignContent: 'start',
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
                background: 'var(--bk-card)',
                fontSize: 18,
                cursor: 'pointer',
                justifySelf: 'start',
              }}
            >
              ☰
            </button>
          )}

          {/* header */}
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
              <div
                style={{
                  fontSize: bk.micro,
                  fontWeight: 700,
                  color: 'var(--bk-muted)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                Guest CRM
              </div>
              <h1
                style={{
                  margin: '5px 0 0',
                  fontSize: 26,
                  fontWeight: 700,
                  color: 'var(--bk-head)',
                  letterSpacing: '-0.03em',
                }}
              >
                Guests
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: bk.body, color: 'var(--bk-body)' }}>
                {showInitialSkeleton
                  ? 'Loading guest list…'
                  : `${stats.total} guests from AI chats & bookings`}
              </p>
            </div>
            <div
              style={{
                position: 'relative',
                flex: isMobile ? '1 1 100%' : '0 1 290px',
                minWidth: isMobile ? undefined : 220,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--bk-muted)"
                strokeWidth="1.8"
                style={{
                  position: 'absolute',
                  left: 11,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
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
                  padding: '8px 12px 8px 32px',
                  borderRadius: bk.radiusSm,
                  border: bk.border,
                  background: 'var(--bk-card)',
                  fontSize: bk.body,
                  color: 'var(--bk-head)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: bk.font,
                }}
              />
            </div>
          </div>

          {/* stats — one strip with hairline dividers, matching Analytics.
              Three floating cards for three numbers read as three separate
              things to compare rather than one summary of the guest book. */}
          <div
            style={{
              ...bkCard,
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
              overflow: 'hidden',
            }}
          >
            {[
              { label: 'Total guests', value: showInitialSkeleton ? '—' : String(stats.total), sub: 'in the guest book' },
              {
                label: 'New this month',
                value: showInitialSkeleton ? '—' : String(stats.newThisMonth),
                sub: 'first visit this month',
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
            ].map(({ label, value, sub }, i) => (
              <div
                key={label}
                style={{
                  padding: '16px 18px',
                  display: 'grid',
                  gap: 7,
                  alignContent: 'start',
                  ...(isMobile
                    ? {
                        borderLeft: i % 2 === 1 ? '1px solid var(--bk-border)' : undefined,
                        borderTop: i >= 2 ? '1px solid var(--bk-border)' : undefined,
                      }
                    : { borderLeft: i > 0 ? '1px solid var(--bk-border)' : undefined }),
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: 'var(--bk-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.09em',
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    color: 'var(--bk-head)',
                    letterSpacing: '-0.035em',
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {value}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--bk-body)', minHeight: 16 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* filter bar + export */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <CrmGuestFilterBar value={filterTag} onChange={setFilterTag} counts={counts} />
            <ExportGuestsButton guests={filtered} disabled={filtered.length === 0} />
          </div>

          {error && (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'var(--bk-danger-bg)',
                color: 'var(--bk-danger)',
                fontSize: bk.body,
              }}
            >
              {error}
            </div>
          )}

          {/* guest list */}
          <div style={{ ...bkCard, overflow: 'hidden', minHeight: showInitialSkeleton ? 320 : undefined }}>
            {showInitialSkeleton ? (
              <div style={{ padding: 16, display: 'grid', gap: 8 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: 48,
                      borderRadius: 8,
                      background: 'linear-gradient(90deg, var(--bk-surface) 0%, var(--bk-border) 50%, var(--bk-surface) 100%)',
                    }}
                  />
                ))}
              </div>
            ) : customers.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--bk-head)' }}>No guests yet</div>
                <p style={{ marginTop: 6, fontSize: bk.body, color: 'var(--bk-body)', lineHeight: 1.5 }}>
                  When guests chat with your AI, their profiles appear here.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 36, textAlign: 'center', color: 'var(--bk-muted)', fontSize: bk.body }}>
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
                        border: active ? '1px solid var(--bk-blue-border)' : bk.border,
                        background: active ? 'var(--bk-blue-bg)' : 'var(--bk-card)',
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
                              color: c.isUnknownGuest ? 'var(--bk-muted)' : 'var(--bk-head)',
                            }}
                          >
                            {c.displayLabel}
                          </div>
                          <div
                            style={{
                              fontSize: bk.micro,
                              color: 'var(--bk-muted)',
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
                      <div style={{ fontSize: bk.micro, color: 'var(--bk-body)' }}>
                        {c.bookingCount} booking{c.bookingCount === 1 ? '' : 's'} · Last{' '}
                        {c.lastBookingLabel}
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
                    minWidth: 880,
                    borderCollapse: 'collapse',
                    tableLayout: 'fixed',
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bk-border)', background: 'var(--bk-surface)' }}>
                      {GUEST_COLUMNS.map((column) => {
                        const active = sort.key === column.key
                        const dir = active ? sort.dir : null
                        return (
                          <th
                            key={column.key}
                            // aria-sort is what tells a screen reader the table
                            // is ordered and which way, which the arrows only
                            // convey visually.
                            aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                            style={{ padding: 0, width: column.width, textAlign: 'left' }}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(column)}
                              title={`Sort by ${column.label.toLowerCase()}`}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '10px 12px',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                whiteSpace: 'nowrap',
                                fontSize: 9,
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: active ? 'var(--bk-head)' : 'var(--bk-muted)',
                                textAlign: 'left',
                                transition: 'color 0.15s',
                              }}
                            >
                              {column.label}
                              <SortArrow dir={dir} />
                            </button>
                          </th>
                        )
                      })}
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
                            background: active ? 'var(--bk-blue-bg)' : 'transparent',
                            borderBottom: i < filtered.length - 1 ? '1px solid var(--bk-surface)' : 'none',
                            boxShadow: active ? 'inset 3px 0 0 var(--bk-accent)' : 'none',
                          }}
                        >
                          <td style={{ padding: '10px 14px' }}>
                            <div
                              style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}
                            >
                              <GuestAvatar name={c.name} isUnknown={c.isUnknownGuest} />
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontSize: bk.body,
                                    fontWeight: 600,
                                    color: c.isUnknownGuest ? 'var(--bk-muted)' : 'var(--bk-head)',
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
                                    color: 'var(--bk-muted)',
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
                          <td style={{ padding: '10px 14px', fontSize: bk.body, color: 'var(--bk-body)' }}>
                            {c.joined}
                          </td>
                          <td
                            style={{
                              padding: '10px 14px',
                              fontSize: bk.body,
                              fontWeight: 700,
                              color: 'var(--bk-head)',
                            }}
                          >
                            {c.bookingCount}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: bk.body, color: 'var(--bk-body)' }}>
                            {c.lastBookingLabel}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: bk.body, color: 'var(--bk-body)' }}>
                            {c.avgPartyLabel}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
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

          <div style={{ fontSize: bk.micro, color: 'var(--bk-muted)', textAlign: 'right' }}>
            Showing {filtered.length} of {customers.length} guests
          </div>

          {selected && (
            <CrmGuestDetail
              customer={selected}
              businessId={businessId}
              onClose={() => {
                setSelectedId(null)
                if (guestParam) router.replace('/dashboard/crm')
              }}
              onNotesSaved={handleNotesSaved}
              onDelete={handleDelete}
            />
          )}
        </main>
      )}
    </DashboardOceanNav>
  )
}
