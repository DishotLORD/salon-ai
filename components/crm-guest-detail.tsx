'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { formatCalgaryTime } from '@/lib/booking-wall-clock'
import { parsePartySizeFromServiceName } from '@/lib/appointment-service-name'
import { appointmentInstantFromRaw } from '@/lib/reservation-schedule'
import { bk } from '@/lib/bookings-compact-ui'
import { parseGuestNotes, serializeGuestNotes } from '@/lib/guest-preferences'
import type { CrmCustomer } from '@/lib/crm-customer'
import {
  crmTagChipStyle,
  displayGuestName,
  formatAvgPartySize,
  getGuestInitials,
  guestNameHue,
  type CrmGuestTag,
  unknownGuestAvatarStyle,
} from '@/lib/guest-display'
import { supabase } from '@/lib/supabase'

export type { CrmCustomer } from '@/lib/crm-customer'

type AppointmentRow = {
  id: string
  scheduled_at: string
  status: string | null
  service_name: string | null
  party_size?: number | null
  zone_id?: string | null
  notes?: string | null
}

function statusLabel(raw: string | null): string {
  const s = (raw ?? 'pending').toLowerCase()
  if (s === 'confirmed') return 'Confirmed'
  if (s === 'cancelled' || s === 'canceled') return 'Cancelled'
  if (s === 'seated' || s === 'completed') return 'Seated'
  if (s === 'no-show' || s === 'noshow') return 'No-show'
  return 'Pending'
}

function statusColors(raw: string | null): { bg: string; color: string } {
  const s = (raw ?? 'pending').toLowerCase()
  if (s === 'confirmed') return { bg: 'var(--bk-green-bg)', color: 'var(--bk-green)' }
  if (s === 'cancelled' || s === 'canceled') return { bg: 'var(--bk-danger-bg)', color: 'var(--bk-danger)' }
  if (s === 'seated' || s === 'completed') return { bg: 'var(--bk-blue-bg)', color: 'var(--bk-blue)' }
  if (s === 'no-show' || s === 'noshow') return { bg: 'var(--bk-surface)', color: 'var(--bk-body)' }
  return { bg: 'var(--bk-amber-bg)', color: 'var(--bk-amber)' }
}

function TagChips({ tags }: { tags: CrmGuestTag[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {tags.map((tag) => {
        const ts = crmTagChipStyle(tag)
        return (
          <span
            key={tag}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 9px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              background: ts.bg,
              border: `1px solid ${ts.border}`,
              color: ts.color,
            }}
          >
            {tag === 'Loyal' ? (
              <span style={{ fontSize: 8, lineHeight: 1 }} aria-hidden>
                ★
              </span>
            ) : (
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: ts.dot }} />
            )}
            {tag}
          </span>
        )
      })}
    </div>
  )
}

function GuestAvatar({
  name,
  isUnknown,
  size = 50,
}: {
  name: string
  isUnknown: boolean
  size?: number
}) {
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
        color: isUnknown ? unknownGuestAvatarStyle.color : '#ffffff',
        fontSize: size * 0.38,
        fontWeight: 600,
        boxShadow: 'var(--bk-shadow-md)',
      }}
    >
      {getGuestInitials(name)}
    </div>
  )
}

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: string[]
  active: string
  onChange: (t: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: bk.border, padding: '0 2px' }}>
      {tabs.map((tt) => {
        const on = tt === active
        return (
          <button
            key={tt}
            type="button"
            onClick={() => onChange(tt)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '11px 12px',
              fontFamily: bk.font,
              fontSize: 12.5,
              fontWeight: on ? 700 : 500,
              color: on ? 'var(--bk-head)' : 'var(--bk-body)',
              boxShadow: on ? 'inset 0 -2px 0 var(--bk-head)' : 'none',
              transition: 'color 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {tt}
          </button>
        )
      })}
    </div>
  )
}

function StatTrio({ customer }: { customer: CrmCustomer }) {
  const items = [
    { label: 'Bookings', value: String(customer.bookingCount) },
    { label: 'Last booking', value: customer.lastBooking === '—' ? 'Never' : customer.lastBooking },
    { label: 'Avg party', value: formatAvgPartySize(customer.avgPartySize) },
  ]
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        padding: 12,
        borderRadius: bk.radiusSm,
        background: 'var(--bk-surface)',
        border: bk.border,
      }}
    >
      {items.map(({ label, value }) => (
        <div key={label} style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--bk-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--bk-head)', marginTop: 5 }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function VisitSparkline({ appointments }: { appointments: AppointmentRow[] }) {
  const months = useMemo(() => {
    const now = new Date()
    const result: { key: string; label: string; count: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      result.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString(undefined, { month: 'short' }),
        count: 0,
      })
    }
    for (const a of appointments) {
      const d = appointmentInstantFromRaw(a.scheduled_at)
      const k = `${d.getFullYear()}-${d.getMonth()}`
      const m = result.find((x) => x.key === k)
      if (m) m.count += 1
    }
    return result
  }, [appointments])

  const max = Math.max(1, ...months.map((m) => m.count))

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 64, padding: '0 2px' }}>
      {months.map((m) => (
        <div
          key={m.key}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
        >
          <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 44 }}>
            <div
              style={{
                width: '100%',
                borderRadius: 4,
                height: `${Math.max(6, (m.count / max) * 44)}px`,
                background:
                  m.count > 0
                    ? 'linear-gradient(180deg, #93c5fd, #3b82f6)'
                    : 'var(--bk-grid-soft)',
              }}
            />
          </div>
          <span style={{ fontSize: 9, color: 'var(--bk-muted)', fontWeight: 600 }}>{m.label}</span>
        </div>
      ))}
    </div>
  )
}

function OverviewTab({
  customer,
  appointments,
  notes,
  setNotes,
  saving,
  conversationId,
}: {
  customer: CrmCustomer
  appointments: AppointmentRow[]
  notes: string
  setNotes: (v: string) => void
  saving: boolean
  conversationId: string | null
}) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <StatTrio customer={customer} />

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 7,
          }}
        >
          <span style={sectionLabel}>Staff notes</span>
          <span
            style={{
              fontSize: 10,
              color: saving ? 'var(--bk-muted)' : 'var(--bk-green)',
              fontWeight: 600,
            }}
          >
            {saving ? 'Saving…' : 'Saved'}
          </span>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Dietary restrictions, seating preferences, special occasions…"
          rows={4}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: 8,
            border: bk.border,
            background: 'var(--bk-surface)',
            color: 'var(--bk-head)',
            padding: '10px 12px',
            resize: 'vertical',
            outline: 'none',
            fontFamily: bk.font,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        />
      </div>

      <div>
        <div style={{ ...sectionLabel, marginBottom: 8 }}>Visit rhythm</div>
        <VisitSparkline appointments={appointments} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {conversationId ? (
          <Link
            href={`/dashboard/chats?conversation=${conversationId}`}
            style={{
              flex: 1,
              padding: '9px 12px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--bk-inverse)',
              color: 'var(--bk-inverse-text)',
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            Open chat
          </Link>
        ) : (
          <Link
            href="/dashboard/chats"
            style={{
              flex: 1,
              padding: '9px 12px',
              borderRadius: 8,
              border: bk.border,
              background: 'var(--bk-card)',
              color: 'var(--bk-body)',
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            Chats
          </Link>
        )}
      </div>
    </div>
  )
}

function HistoryTab({
  appointments,
  appointmentsLoading,
  zoneNameById,
}: {
  appointments: AppointmentRow[]
  appointmentsLoading: boolean
  zoneNameById: Map<string, string>
}) {
  const counts = appointments.reduce<Record<string, number>>((acc, a) => {
    const s = a.status ?? 'pending'
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  const summary = [
    { k: 'seated', label: 'Seated' },
    { k: 'completed', label: 'Completed' },
    { k: 'confirmed', label: 'Upcoming' },
    { k: 'cancelled', label: 'Cancelled' },
    { k: 'no-show', label: 'No-show' },
  ].filter((s) => counts[s.k])

  if (appointmentsLoading) {
    return <div style={{ fontSize: 12, color: 'var(--bk-muted)', padding: '8px 0' }}>Loading…</div>
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {summary.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {summary.map((s) => {
            const sc = statusColors(s.k)
            return (
              <span
                key={s.k}
                style={{
                  fontSize: 11,
                  color: sc.color,
                  background: sc.bg,
                  borderRadius: 999,
                  padding: '4px 10px',
                  fontWeight: 600,
                }}
              >
                {counts[s.k]} {s.label}
              </span>
            )
          })}
        </div>
      )}

      {appointments.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--bk-muted)', padding: '8px 0' }}>No bookings yet</div>
      ) : (
        <div style={{ display: 'grid', gap: 0 }}>
          {appointments.map((a, i) => {
            const d = appointmentInstantFromRaw(a.scheduled_at)
            const party =
              a.party_size != null && a.party_size > 0
                ? a.party_size
                : parsePartySizeFromServiceName(a.service_name)
            const zoneLabel = a.zone_id ? zoneNameById.get(a.zone_id) : null
            const sc = statusColors(a.status)
            const last = i === appointments.length - 1
            return (
              <div key={a.id} style={{ display: 'flex', gap: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    width: 12,
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: sc.color,
                      marginTop: 14,
                      flexShrink: 0,
                      boxShadow: `0 0 0 3px ${sc.bg}`,
                    }}
                  />
                  {!last && (
                    <span
                      style={{ flex: 1, width: 2, background: 'var(--bk-surface)', marginTop: 2 }}
                    />
                  )}
                </div>
                <div style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: bk.border,
                      background: 'var(--bk-card)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--bk-head)' }}>
                        {d.toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}{' '}
                        · {formatCalgaryTime(d)}
                      </div>
                      {(party != null || zoneLabel) && (
                        <div style={{ fontSize: 11, color: 'var(--bk-body)', marginTop: 3 }}>
                          {party != null ? `Party of ${party}` : null}
                          {party != null && zoneLabel ? ' · ' : null}
                          {zoneLabel ?? null}
                        </div>
                      )}
                      {a.notes?.trim() && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--bk-muted)',
                            marginTop: 4,
                            fontStyle: 'italic',
                            lineHeight: 1.4,
                          }}
                        >
                          {a.notes.trim()}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 999,
                        background: sc.bg,
                        color: sc.color,
                        flexShrink: 0,
                      }}
                    >
                      {statusLabel(a.status)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PreferencesTab({ guestPrefs }: { guestPrefs: ReturnType<typeof parseGuestNotes> }) {
  const has = guestPrefs.allergies || guestPrefs.preferences || guestPrefs.occasions
  if (!has) {
    return (
      <div style={{ textAlign: 'center', padding: '28px 16px' }}>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            background: 'var(--bk-surface)',
            border: bk.border,
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 12px',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--bk-muted)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2 2 7l10 5 10-5-10-5Z" />
            <path d="m2 17 10 5 10-5" />
            <path d="m2 12 10 5 10-5" />
          </svg>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bk-head)' }}>No preferences yet</div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--bk-muted)',
            marginTop: 6,
            lineHeight: 1.5,
            maxWidth: 260,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          As this guest chats with your AI concierge, allergies, seating preferences and special
          occasions are captured automatically.
        </p>
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 7 }}>
        {guestPrefs.allergies && (
          <PrefRow label="Allergies / dietary" value={guestPrefs.allergies} accent="var(--bk-danger)" />
        )}
        {guestPrefs.preferences && (
          <PrefRow label="Preferences" value={guestPrefs.preferences} accent="var(--bk-blue)" />
        )}
        {guestPrefs.occasions && (
          <PrefRow label="Occasions" value={guestPrefs.occasions} accent="var(--bk-amber)" />
        )}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: 10.5,
          color: 'var(--bk-muted)',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--bk-accent)',
            flexShrink: 0,
          }}
        />
        Captured automatically from guest conversations.
      </div>
    </div>
  )
}

function PrefRow({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 8,
        border: bk.border,
        background: 'var(--bk-surface)',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--bk-body)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          flexShrink: 0,
          minWidth: 96,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--bk-head)', lineHeight: 1.45 }}>{value}</span>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--bk-body)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

export type CrmGuestDetailProps = {
  customer: CrmCustomer
  businessId: string | null
  onClose: () => void
  onNotesSaved: (id: string, notes: string) => void
  onDelete: (id: string) => void
}

export function CrmGuestDetail({
  customer,
  businessId,
  onClose,
  onNotesSaved,
  onDelete,
}: CrmGuestDetailProps) {
  const guestPrefs = useMemo(() => parseGuestNotes(customer.notes), [customer.notes])
  const ownerNotesBaseline = guestPrefs.ownerNotes ?? ''
  const [tab, setTab] = useState('Overview')
  const [notes, setNotes] = useState(ownerNotesBaseline)
  const [notesSaving, setNotesSaving] = useState(false)
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [appointmentsLoading, setAppointmentsLoading] = useState(true)
  const [zoneNameById, setZoneNameById] = useState<Map<string, string>>(new Map())
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [animate, setAnimate] = useState(true)
  const [closing, setClosing] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const curIdRef = useRef<string | null>(null)

  const displayName = displayGuestName(customer.name)

  // reset panel state when the selected guest changes
  useEffect(() => {
    if (curIdRef.current !== customer.id) {
      curIdRef.current = customer.id
      setTab('Overview')
      setNotes(ownerNotesBaseline)
      setConfirmDelete(false)
      setDeleteError(null)
      setClosing(false)
    }
  }, [customer.id, ownerNotesBaseline])

  // slide-in with rAF-freeze fallback (headless / invisible frames)
  useEffect(() => {
    let painted = false
    const raf = requestAnimationFrame(() => {
      painted = true
    })
    const start = setTimeout(() => setMounted(true), 20)
    const fallback = setTimeout(() => {
      if (!painted) {
        setAnimate(false)
        setMounted(true)
      }
    }, 140)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(start)
      clearTimeout(fallback)
    }
  }, [])

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show spinner before async history fetch
    setAppointmentsLoading(true)
    void (async () => {
      const { data } = await supabase
        .from('appointments')
        .select('id, scheduled_at, status, service_name, party_size, zone_id, notes')
        .eq('customer_id', customer.id)
        .order('scheduled_at', { ascending: false })
      if (!cancelled) {
        setAppointments((data as AppointmentRow[]) ?? [])
        setAppointmentsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [customer.id])

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('dining_zones')
        .select('id, name')
        .eq('business_id', businessId)
      if (!cancelled) {
        const m = new Map<string, string>()
        for (const row of data ?? []) m.set(String(row.id), String(row.name))
        setZoneNameById(m)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [businessId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('conversations')
        .select('id')
        .eq('customer_id', customer.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!cancelled) setConversationId(data?.id ? String(data.id) : null)
    })()
    return () => {
      cancelled = true
    }
  }, [customer.id])

  const persistNotes = useCallback(
    async (value: string) => {
      if (!businessId) return
      setNotesSaving(true)
      const serialized = serializeGuestNotes({ ...guestPrefs, ownerNotes: value })
      const { error } = await supabase
        .from('customers')
        .update({ notes: serialized })
        .eq('id', customer.id)
        .eq('business_id', businessId)
      setNotesSaving(false)
      if (!error) onNotesSaved(customer.id, serialized ?? '')
    },
    [businessId, customer.id, guestPrefs, onNotesSaved],
  )

  function handleNotesChange(value: string) {
    setNotes(value)
    setNotesSaving(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void persistNotes(value)
    }, 450)
  }

  function handleClose() {
    setClosing(true)
    setTimeout(onClose, 280)
  }

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    await supabase.from('conversations').update({ customer_id: null }).eq('customer_id', customer.id)
    await supabase.from('appointments').update({ customer_id: null }).eq('customer_id', customer.id)
    const query = businessId
      ? supabase.from('customers').delete().eq('id', customer.id).eq('business_id', businessId)
      : supabase.from('customers').delete().eq('id', customer.id)
    const { error } = await query
    setDeleting(false)
    if (error) {
      setDeleteError(error.message)
      return
    }
    onDelete(customer.id)
  }

  const contactHasPhone = customer.phone && customer.phone !== '—'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      {/* backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,0.32)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          opacity: closing ? 0 : mounted ? 1 : 0,
          transition: animate ? 'opacity 0.26s ease' : 'none',
        }}
      />

      {/* panel */}
      <aside
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100vh',
          width: 'min(440px, 92vw)',
          background: 'var(--bk-card)',
          borderLeft: bk.border,
          boxShadow: '-12px 0 40px rgba(15,23,42,0.16)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: bk.font,
          transform: closing || !mounted ? 'translateX(100%)' : 'translateX(0)',
          transition: animate ? 'transform 0.34s cubic-bezier(0.22,1,0.36,1)' : 'none',
        }}
      >
        {/* header */}
        <div style={{ padding: '16px 18px 0', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <TagChips tags={customer.tags} />
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                border: bk.border,
                background: 'var(--bk-surface)',
                color: 'var(--bk-body)',
                cursor: 'pointer',
                fontSize: 16,
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 14 }}>
            <GuestAvatar name={customer.name} isUnknown={customer.isUnknownGuest} size={50} />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: customer.isUnknownGuest ? 'var(--bk-muted)' : 'var(--bk-head)',
                  letterSpacing: '-0.02em',
                }}
              >
                {displayName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--bk-muted)', marginTop: 3 }}>
                {customer.isUnknownGuest ? 'From AI chat · ' : ''}Joined {customer.joined}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 14 }}>
            {contactHasPhone && (
              <a
                href={`tel:${customer.phone.replace(/\s/g, '')}`}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: bk.border,
                  background: 'var(--bk-surface)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--bk-head)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {customer.phone}
              </a>
            )}
            {customer.email && (
              <a
                href={`mailto:${customer.email}`}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: bk.border,
                  background: 'var(--bk-surface)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--bk-head)',
                  textDecoration: 'none',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {customer.email}
              </a>
            )}
            {!contactHasPhone && !customer.email && (
              <span style={{ fontSize: 12, color: 'var(--bk-muted)' }}>No contact yet</span>
            )}
          </div>

          <TabBar
            tabs={['Overview', 'Booking History', 'Preferences']}
            active={tab}
            onChange={setTab}
          />
        </div>

        {/* tab body */}
        <div
          key={tab}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 18px 18px',
            animation: 'oc-tab-fade 0.22s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          {tab === 'Overview' && (
            <OverviewTab
              customer={customer}
              appointments={appointments}
              notes={notes}
              setNotes={handleNotesChange}
              saving={notesSaving}
              conversationId={conversationId}
            />
          )}
          {tab === 'Booking History' && (
            <HistoryTab
              appointments={appointments}
              appointmentsLoading={appointmentsLoading}
              zoneNameById={zoneNameById}
            />
          )}
          {tab === 'Preferences' && <PreferencesTab guestPrefs={guestPrefs} />}
        </div>

        {/* footer */}
        <div style={{ flexShrink: 0, borderTop: bk.border, padding: '12px 18px' }}>
          {deleteError && (
            <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--bk-danger)' }}>{deleteError}</div>
          )}
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  borderRadius: 8,
                  border: bk.border,
                  background: 'var(--bk-card)',
                  color: 'var(--bk-body)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: bk.font,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDelete()}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  borderRadius: 8,
                  border: '1px solid rgba(239,68,68,0.4)',
                  background: 'rgba(239,68,68,0.1)',
                  color: 'var(--bk-danger)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontFamily: bk.font,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              style={{
                width: '100%',
                padding: '9px 0',
                borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.35)',
                background: 'transparent',
                color: 'var(--bk-danger)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: bk.font,
              }}
            >
              Delete guest
            </button>
          )}
        </div>
      </aside>

      <style>{`
        @keyframes oc-tab-fade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
