'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { formatCalgaryTime } from '@/lib/booking-wall-clock'
import { parsePartySizeFromServiceName } from '@/lib/appointment-service-name'
import { appointmentInstantFromRaw } from '@/lib/reservation-schedule'
import { parseDiningZoneRow } from '@/lib/dining-zones'
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
import { slideInRight, oceanTransition } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'
import { t } from '@/lib/dashboard-theme'

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
  if (s === 'confirmed') return { bg: '#dcfce7', color: '#16a34a' }
  if (s === 'cancelled' || s === 'canceled') return { bg: '#fee2e2', color: '#dc2626' }
  if (s === 'seated' || s === 'completed') return { bg: '#dbeafe', color: '#2563eb' }
  if (s === 'no-show' || s === 'noshow') return { bg: '#f1f5f9', color: '#64748b' }
  return { bg: '#fef3c7', color: '#d97706' }
}

function TagChip({ tag }: { tag: CrmGuestTag }) {
  const ts = crmTagChipStyle(tag)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        background: ts.bg,
        border: `1px solid ${ts.border}`,
        color: ts.color,
      }}
    >
      {tag === 'Loyal' ? (
        <span style={{ fontSize: 9 }} aria-hidden>
          ★
        </span>
      ) : (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: ts.dot }} />
      )}
      {tag}
    </span>
  )
}

function GuestAvatar({ name, isUnknown, size = 46 }: { name: string; isUnknown: boolean; size?: number }) {
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
        boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
      }}
    >
      {getGuestInitials(name)}
    </div>
  )
}

function PreferenceRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        border: bk.border,
        background: '#fafafa',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          flexShrink: 0,
          minWidth: 96,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 12.5, color: '#0f172a', lineHeight: 1.45 }}>{value}</span>
    </div>
  )
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
  const reduceMotion = useReducedMotion()
  const guestPrefs = useMemo(() => parseGuestNotes(customer.notes), [customer.notes])
  const ownerNotesBaseline = guestPrefs.ownerNotes ?? ''
  const [notes, setNotes] = useState(ownerNotesBaseline)
  const [notesSaving, setNotesSaving] = useState(false)
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [appointmentsLoading, setAppointmentsLoading] = useState(true)
  const [zoneNameById, setZoneNameById] = useState<Map<string, string>>(new Map())
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const displayName = displayGuestName(customer.name)
  const lastBookingLabel = customer.lastBooking === '—' ? 'Never' : customer.lastBooking

  useEffect(() => {
    setNotes(ownerNotesBaseline)
    setConfirmDelete(false)
    setDeleteError(null)
  }, [customer.id, ownerNotesBaseline])

  useEffect(() => {
    let cancelled = false
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
        for (const row of data ?? []) {
          m.set(String(row.id), String(row.name))
        }
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
      // Preserve any structured preferences captured by the AI concierge; only
      // the owner's free-text portion is edited here.
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

  useEffect(() => {
    if (notes === ownerNotesBaseline) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void persistNotes(notes)
    }, 450)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [notes, ownerNotesBaseline, persistNotes])

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

  const contactLine =
    customer.phone && customer.phone !== '—'
      ? customer.phone
      : customer.email || 'No contact yet'

  return (
    <motion.aside
      initial="hidden"
      animate="visible"
      variants={slideInRight}
      transition={oceanTransition(reduceMotion)}
      style={{
        background: '#ffffff',
        borderRadius: bk.radius,
        border: bk.border,
        boxShadow: bk.shadow,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        fontFamily: bk.font,
        maxHeight: 'calc(100vh - 72px)',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
          {customer.tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            border: bk.border,
            background: '#f8fafc',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <GuestAvatar name={customer.name} isUnknown={customer.isUnknownGuest} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: customer.isUnknownGuest ? '#94a3b8' : '#0f172a',
              letterSpacing: '-0.02em',
            }}
          >
            {displayName}
          </div>
          {customer.isUnknownGuest && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>From AI chat</div>
          )}
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Joined {customer.joined}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {customer.phone && customer.phone !== '—' && (
          <a
            href={`tel:${customer.phone.replace(/\s/g, '')}`}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: bk.border,
              background: '#f8fafc',
              fontSize: 12,
              fontWeight: 500,
              color: '#0f172a',
              textDecoration: 'none',
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
              background: '#f8fafc',
              fontSize: 12,
              fontWeight: 500,
              color: '#0f172a',
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
        {contactLine === 'No contact yet' && (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{contactLine}</span>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          padding: 10,
          borderRadius: bk.radiusSm,
          background: '#f8fafc',
          border: bk.border,
        }}
      >
        {[
          { label: 'Bookings', value: String(customer.bookingCount) },
          { label: 'Last booking', value: lastBookingLabel },
          { label: 'Avg party', value: formatAvgPartySize(customer.avgPartySize) },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 8,
          }}
        >
          Booking history
        </div>
        {appointmentsLoading ? (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Loading…</div>
        ) : appointments.length === 0 ? (
          <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>No bookings yet</div>
        ) : (
          <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {appointments.map((a) => {
              const d = appointmentInstantFromRaw(a.scheduled_at)
              const party =
                a.party_size != null && a.party_size > 0
                  ? a.party_size
                  : parsePartySizeFromServiceName(a.service_name)
              const zoneLabel = a.zone_id ? zoneNameById.get(a.zone_id) : null
              const sc = statusColors(a.status)
              return (
                <div
                  key={a.id}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 8,
                    border: bk.border,
                    background: '#fafafa',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                      {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · '}
                      {formatCalgaryTime(d)}
                    </div>
                    {(party != null || zoneLabel) && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        {party != null ? `Party of ${party}` : null}
                        {party != null && zoneLabel ? ' · ' : null}
                        {zoneLabel ? zoneLabel : null}
                      </div>
                    )}
                    {a.notes?.trim() && (
                      <div
                        style={{
                          fontSize: 11,
                          color: '#94a3b8',
                          marginTop: 3,
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
                      padding: '2px 6px',
                      borderRadius: 999,
                      background: sc.bg,
                      color: sc.color,
                      flexShrink: 0,
                    }}
                  >
                    {statusLabel(a.status)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {(guestPrefs.allergies || guestPrefs.preferences || guestPrefs.occasions) && (
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 8,
            }}
          >
            Guest preferences
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {guestPrefs.allergies && (
              <PreferenceRow label="Allergies / dietary" value={guestPrefs.allergies} accent="#dc2626" />
            )}
            {guestPrefs.preferences && (
              <PreferenceRow label="Preferences" value={guestPrefs.preferences} accent="#2563eb" />
            )}
            {guestPrefs.occasions && (
              <PreferenceRow label="Occasions" value={guestPrefs.occasions} accent="#d97706" />
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: '#94a3b8' }}>
            Captured automatically from guest conversations.
          </div>
        </div>
      )}

      <div>
        <label
          style={{
            display: 'block',
            marginBottom: 6,
            fontSize: 10,
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Notes
        </label>
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
            background: '#f8fafc',
            color: '#0f172a',
            padding: '10px 12px',
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'inherit',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        />
        <div style={{ marginTop: 4, fontSize: 10, color: '#94a3b8' }}>
          {notesSaving ? 'Saving…' : 'Saved to your account'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {conversationId ? (
          <Link
            href={`/dashboard/chats?conversation=${conversationId}`}
            style={{
              flex: 1,
              minWidth: 120,
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: '#0f172a',
              color: '#fff',
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
              minWidth: 120,
              padding: '8px 12px',
              borderRadius: 8,
              border: bk.border,
              background: '#fff',
              color: '#64748b',
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

      <div style={{ borderTop: `1px solid ${t.borderSoft}`, paddingTop: 12 }}>
        {deleteError && (
          <div style={{ marginBottom: 8, fontSize: 11, color: t.danger }}>{deleteError}</div>
        )}
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 8,
                border: bk.border,
                background: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
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
                padding: '8px 0',
                borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.4)',
                background: 'rgba(239,68,68,0.1)',
                color: '#dc2626',
                fontSize: 12,
                fontWeight: 700,
                cursor: deleting ? 'not-allowed' : 'pointer',
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
              padding: '8px 0',
              borderRadius: 8,
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'transparent',
              color: '#dc2626',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Delete guest
          </button>
        )}
      </div>
    </motion.aside>
  )
}
