'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { ReservationCard, type Reservation, type ResStatus } from '@/components/reservation-card'
import { oceanTransition } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'
import { card, t } from '@/lib/dashboard-theme'

type DbRow = {
  id: string
  service_name: string | null
  scheduled_at: string
  status: string | null
  customer_id: string | null
}

type ListFilter = 'today' | 'week' | 'all'
type ModalMode = 'add' | 'edit'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeStatus(raw: string | null | undefined): ResStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'confirmed') return 'confirmed'
  if (s === 'seated') return 'seated'
  if (s === 'no-show' || s === 'noshow') return 'no-show'
  if (s === 'completed') return 'seated'
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  return 'pending'
}

// service_name encoding: "Guest Name · Party of N · Table T · Notes: special text"
// All segments after the first two are optional extras packed in for now (until schema updated).
function parseReservation(row: DbRow, customerName?: string): Reservation {
  const parts = (row.service_name ?? '').split(' \u00b7 ') // split on " · "
  const guestName = customerName?.trim() || parts[0]?.trim() || 'Guest'
  const partySize = parseInt((parts[1] ?? '').replace(/\D/g, ''), 10) || 1

  const tablePart = parts.find((p) => /^Table /i.test(p.trim()))
  const tableNumber = tablePart ? tablePart.replace(/^Table /i, '').trim() : '—'

  const notesPart = parts.find((p) => /^Notes:/i.test(p.trim()))
  const specialRequests = notesPart ? notesPart.replace(/^Notes:\s*/i, '').trim() : ''

  return {
    id: row.id,
    guestName,
    partySize,
    tableNumber,
    scheduledAt: new Date(row.scheduled_at),
    status: normalizeStatus(row.status),
    specialRequests,
  }
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function startOfWeekMon(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - diff)
  return date
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function statusColor(s: ResStatus) {
  const map: Record<ResStatus, { bg: string; border: string; text: string }> = {
    confirmed: { bg: t.accentSoftBg, border: t.accentSoftBorder, text: t.accentText },
    seated:    { bg: t.successBg,    border: t.successBorder,    text: t.success },
    pending:   { bg: t.warningBg,    border: t.warningBorder,    text: t.warning },
    cancelled: { bg: t.dangerBg,     border: t.dangerBorder,     text: t.danger },
    'no-show': { bg: t.bgSurfaceMuted, border: t.border,         text: t.textMuted },
  }
  return map[s]
}

const glass = card

// ─── MonthCalendar ────────────────────────────────────────────────────────────
function MonthCalendar({
  displayMonth,
  reservations,
  selectedDay,
  onSelectDay,
  today,
}: {
  displayMonth: Date
  reservations: Reservation[]
  selectedDay: Date | null
  onSelectDay: (d: Date) => void
  today: Date
}) {
  const year = displayMonth.getFullYear()
  const month = displayMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDate = new Date(year, month + 1, 0).getDate()
  const startPad = (firstDay.getDay() + 6) % 7

  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = startPad - 1; i >= 0; i--)
    cells.push({ date: new Date(year, month, -i), inMonth: false })
  for (let d = 1; d <= lastDate; d++)
    cells.push({ date: new Date(year, month, d), inMonth: true })
  const tail = cells.length % 7
  if (tail !== 0) {
    for (let d = 1; d <= 7 - tail; d++)
      cells.push({ date: new Date(year, month + 1, d), inMonth: false })
  }

  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div style={{ ...glass, overflow: 'hidden' }}>
      {/* DOW headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: `1px solid ${t.border}`,
          background: t.bgSurfaceMuted,
        }}
      >
        {DOW.map((d) => (
          <div
            key={d}
            style={{
              padding: '12px 0',
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: t.textMuted,
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map(({ date, inMonth }, idx) => {
          const dayRes = reservations.filter(
            (r) => isSameDay(r.scheduledAt, date) && r.status !== 'cancelled' && r.status !== 'no-show',
          )
          const covers = dayRes.reduce((s, r) => s + r.partySize, 0)
          const isToday = isSameDay(date, today)
          const isSelected = selectedDay ? isSameDay(date, selectedDay) : false

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectDay(date)}
              style={{
                minHeight: 80,
                padding: '10px 8px 8px',
                background: isSelected ? t.accentSoftBg : t.bgSurface,
                border: 'none',
                borderTop: idx >= 7 ? `1px solid ${t.borderSoft}` : 'none',
                borderRight: (idx + 1) % 7 !== 0 ? `1px solid ${t.borderSoft}` : 'none',
                outline: isToday
                  ? `2px solid ${t.accent}`
                  : isSelected
                  ? `2px solid ${t.accentSoftBorder}`
                  : 'none',
                outlineOffset: -2,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                transition: 'background 0.12s',
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: !inMonth
                    ? t.textSubtle
                    : isToday
                    ? t.accent
                    : t.text,
                  alignSelf: 'flex-end',
                  paddingRight: 2,
                }}
              >
                {date.getDate()}
              </span>
              {dayRes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignSelf: 'flex-start' }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: t.accentText,
                      background: t.accentSoftBg,
                      border: `1px solid ${t.accentSoftBorder}`,
                      borderRadius: 6,
                      padding: '2px 6px',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.4,
                    }}
                  >
                    {dayRes.length} {dayRes.length === 1 ? 'booking' : 'bookings'}
                  </span>
                  <span style={{ fontSize: 9, color: t.textMuted, paddingLeft: 2, lineHeight: 1.2 }}>
                    {covers} {covers === 1 ? 'guest' : 'guests'}
                  </span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── DayPanel ─────────────────────────────────────────────────────────────────
function DayPanel({
  day,
  reservations,
  onClose,
  onConfirm,
  onCancel,
  onDelete,
  onEdit,
  onAddForDay,
}: {
  day: Date
  reservations: Reservation[]
  onClose: () => void
  onConfirm: (id: string) => void
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (r: Reservation) => void
  onAddForDay: () => void
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={oceanTransition(reduceMotion, { duration: 0.2 })}
      style={{
        ...glass,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '16px 20px 14px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ color: t.text, fontSize: 15, fontWeight: 700 }}>
            {day.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div style={{ marginTop: 4, color: t.textMuted, fontSize: 12 }}>
            {reservations.length} reservation{reservations.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: `1px solid ${t.border}`,
            background: t.bgSurface,
            color: t.textMuted,
            cursor: 'pointer',
            fontSize: 16,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          ×
        </button>
      </div>

      {/* Add reservation for this day */}
      <div style={{ padding: '12px 16px 4px' }}>
        <button
          type="button"
          onClick={onAddForDay}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 10,
            border: `1px solid ${t.accent}`,
            background: t.accent,
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'center',
            letterSpacing: '0.02em',
          }}
        >
          Book a table for {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </button>
      </div>

      <div
        style={{
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin',
          maxHeight: 'calc(100vh - 300px)',
          position: 'relative',
          zIndex: 200,
          padding: '12px 16px',
        }}
      >
        {reservations.length === 0 ? (
          <div
            style={{
              padding: 28,
              textAlign: 'center',
              color: t.textMuted,
              fontSize: 13,
            }}
          >
            All clear — nothing booked yet
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {reservations.map((r) => (
              <ReservationCard
                key={r.id}
                reservation={r}
                variant="panel"
                onConfirm={onConfirm}
                onCancel={onCancel}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────
function ReservationListView({
  reservations,
  filter,
  onFilterChange,
  loading,
  onConfirm,
  onCancel,
  onDelete,
  onEdit,
  isMobile,
}: {
  reservations: Reservation[]
  filter: ListFilter
  onFilterChange: (f: ListFilter) => void
  loading: boolean
  onConfirm: (id: string) => void
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (r: Reservation) => void
  isMobile: boolean
}) {
  const FILTERS: { key: ListFilter; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'all', label: 'All' },
  ]

  const emptyMsg = 'No reservations — open availability'

  return (
    <div style={{ ...glass, overflow: 'hidden' }}>
      {/* Filter tabs */}
      <div
        style={{
          padding: '14px 18px 0',
          display: 'flex',
          gap: 4,
          borderBottom: `1px solid ${t.border}`,
          paddingBottom: 0,
        }}
      >
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => onFilterChange(key)}
            style={{
              padding: '9px 16px',
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: filter === key ? t.accentSoftBg : 'transparent',
              color: filter === key ? t.accent : t.textMuted,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              borderBottom: filter === key ? `2px solid ${t.accent}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {isMobile ? (
        /* ── Mobile card list ── */
        <div style={{ padding: 12, display: 'grid', gap: 10 }}>
          {loading ? (
            Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  height: 86,
                  borderRadius: 10,
                  background: t.bgSurfaceMuted,
                  border: `1px solid ${t.borderSoft}`,
                }}
              />
            ))
          ) : reservations.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: t.textMuted }}>
              {emptyMsg}
            </div>
          ) : (
            reservations.map((r) => (
              <ReservationCard
                key={r.id}
                reservation={r}
                variant="panel"
                onConfirm={onConfirm}
                onCancel={onCancel}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            ))
          )}
        </div>
      ) : (
        /* ── Desktop table ── */
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.border}`, background: t.bgSurfaceMuted }}>
                {['Time', 'Guest', 'Party Size', 'Table', 'Status', 'Actions'].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: '13px 18px',
                      textAlign: 'left',
                      color: t.textMuted,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${t.borderSoft}` }}>
                    {Array.from({ length: 6 }).map((__, c) => (
                      <td key={c} style={{ padding: '16px 18px' }}>
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
              ) : reservations.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: 32,
                      textAlign: 'center',
                      color: t.textMuted,
                    }}
                  >
                    {emptyMsg}
                  </td>
                </tr>
              ) : (
                reservations.map((r) => {
                  const c = statusColor(r.status)
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: `1px solid ${t.borderSoft}`,
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = t.bgSurfaceMuted
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <td
                        style={{
                          padding: '14px 18px',
                          color: t.textMuted,
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {fmtTime(r.scheduledAt)}
                      </td>
                      <td
                        style={{
                          padding: '14px 18px',
                          color: t.text,
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {r.guestName}
                      </td>
                      <td
                        style={{
                          padding: '14px 18px',
                          color: t.textMuted,
                          fontSize: 13,
                          textAlign: 'center',
                        }}
                      >
                        {r.partySize}
                      </td>
                      <td
                        style={{
                          padding: '14px 18px',
                          color: t.textMuted,
                          fontSize: 13,
                        }}
                      >
                        {r.tableNumber}
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: c.bg,
                            border: `1px solid ${c.border}`,
                            color: c.text,
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {r.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => onConfirm(r.id)}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: 6,
                                  border: `1px solid ${t.accent}`,
                                  background: t.accent,
                                  color: '#ffffff',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => onCancel(r.id)}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: 6,
                                  border: `1px solid ${t.dangerBorder}`,
                                  background: t.dangerBg,
                                  color: t.danger,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {(r.status === 'cancelled' || r.status === 'no-show') ? (
                            <button
                              type="button"
                              onClick={() => onDelete(r.id)}
                              style={{
                                padding: '5px 12px',
                                borderRadius: 6,
                                border: `1px solid ${t.dangerBorder}`,
                                background: t.dangerBg,
                                color: t.danger,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onEdit(r)}
                              style={{
                                padding: '5px 12px',
                                borderRadius: 6,
                                border: `1px solid ${t.border}`,
                                background: t.bgSurface,
                                color: t.text,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Reservation Modal (Add + Edit) ───────────────────────────────────────────
const STATUS_OPTIONS: ResStatus[] = ['pending', 'confirmed', 'seated', 'cancelled', 'no-show']

function ReservationModal({
  mode,
  editReservation,
  onClose,
  businessId,
  onAdded,
  onUpdated,
  initialDate,
}: {
  mode: ModalMode
  editReservation: Reservation | null
  onClose: () => void
  businessId: string | null
  onAdded: (r: Reservation) => void
  onUpdated: (r: Reservation) => void
  initialDate?: string
}) {
  const reduceMotion = useReducedMotion()
  const isEdit = mode === 'edit' && editReservation !== null

  const nowDefault = new Date()
  const defaultDate = initialDate ?? nowDefault.toISOString().split('T')[0]
  const defaultTime = `${String(nowDefault.getHours() + 1).padStart(2, '0')}:00`

  const [guestName, setGuestName] = useState(
    isEdit ? editReservation!.guestName : '',
  )
  const [partySize, setPartySize] = useState(isEdit ? editReservation!.partySize : 2)
  const [partySizeInput, setPartySizeInput] = useState(String(isEdit ? editReservation!.partySize : 2))
  const [date, setDate] = useState(() => {
    if (isEdit) {
      const d = editReservation!.scheduledAt
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return defaultDate
  })
  const [time, setTime] = useState(() => {
    if (isEdit) {
      const h = String(editReservation!.scheduledAt.getHours()).padStart(2, '0')
      const m = String(editReservation!.scheduledAt.getMinutes()).padStart(2, '0')
      return `${h}:${m}`
    }
    return defaultTime
  })
  const [tableNumber, setTableNumber] = useState(
    isEdit && editReservation!.tableNumber !== '—' ? editReservation!.tableNumber : '',
  )
  const [specialRequests, setSpecialRequests] = useState(
    isEdit ? editReservation!.specialRequests : '',
  )
  const [editStatus, setEditStatus] = useState<ResStatus>(
    isEdit ? editReservation!.status : 'pending',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async () => {
    if (!guestName.trim()) {
      setError('Guest name is required.')
      return
    }
    if (!date || !time) {
      setError('Date and time are required.')
      return
    }
    if (!businessId && !isEdit) {
      setError('Business not found — please reload.')
      return
    }

    setError('')
    setSaving(true)

    const wallClock = `${date}T${time}:00`
    const scheduledAt = new Date(wallClock)

    const svcParts = [
      guestName.trim().replace(/\u00b7/g, '-'),
      `Party of ${partySize}`,
      tableNumber.trim() ? `Table ${tableNumber.trim()}` : null,
      specialRequests.trim() ? `Notes: ${specialRequests.trim()}` : null,
    ].filter(Boolean)
    const serviceName = svcParts.join(' \u00b7 ')

    if (isEdit) {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          service_name: serviceName,
          scheduled_at: wallClock,
          status: editStatus,
        })
        .eq('id', editReservation!.id)

      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }

      onUpdated({
        ...editReservation!,
        guestName: guestName.trim(),
        partySize,
        tableNumber: tableNumber.trim() || '—',
        scheduledAt,
        status: editStatus,
        specialRequests: specialRequests.trim(),
      })
      return
    }

    const { data, error: insertError } = await supabase
      .from('appointments')
      .insert({
        business_id: businessId,
        service_name: serviceName,
        scheduled_at: wallClock,
        status: 'confirmed',
      })
      .select('id, service_name, scheduled_at, status, customer_id')
      .single()

    setSaving(false)
    if (insertError || !data) {
      setError(insertError?.message ?? 'Failed to add reservation.')
      return
    }

    onAdded(parseReservation(data as DbRow))
  }

  // ── UI helpers ───────────────────────────────────────────────────────────────
  const TIME_SLOTS = Array.from({ length: 22 }, (_, i) => {
    const totalMins = 12 * 60 + i * 30
    const h = Math.floor(totalMins / 60)
    const m = totalMins % 60
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const period = h < 12 ? 'AM' : 'PM'
    const dh = h > 12 ? h - 12 : h
    return { value, label: `${dh}:${String(m).padStart(2, '0')} ${period}` }
  })

  const displayDate = date
    ? new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : 'Select date'

  const guestFloating = focusedField === 'guest' || guestName.length > 0

  // Luxury palette — these are intentional hardcoded brand values for this modal
  const NAVY = '#050d1a'
  const SURFACE = '#091525'
  const SKY = '#38bdf8'
  const SKY_GLOW = 'rgba(56,189,248,0.18)'
  const BORDER_REST = 'rgba(56,189,248,0.14)'
  const TXT = '#deeeff'
  const TXT_MUTED = '#7096b8'
  const TXT_SUBTLE = '#3a5a78'

  const inp: React.CSSProperties = {
    width: '100%',
    borderRadius: 12,
    background: SURFACE,
    color: TXT,
    paddingLeft: 16,
    paddingRight: 16,
    fontSize: 15,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'border-color 0.18s, box-shadow 0.18s',
  }

  const iField = (field: string): React.CSSProperties =>
    focusedField === field
      ? { border: `1px solid ${SKY}`, boxShadow: `0 0 0 3px ${SKY_GLOW}` }
      : { border: `1px solid ${BORDER_REST}` }

  const secLabel: React.CSSProperties = {
    display: 'block',
    color: SKY,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    marginBottom: 10,
  }

  const stepBtn: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: `1px solid ${BORDER_REST}`,
    background: NAVY,
    color: SKY,
    fontSize: 22,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        background: 'rgba(2,8,20,0.88)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={
          reduceMotion
            ? { duration: 0.15 }
            : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }
        }
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 520,
          maxWidth: '95vw',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: NAVY,
          borderRadius: 20,
          border: '1px solid rgba(56,189,248,0.18)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.72), 0 0 0 1px rgba(56,189,248,0.06)',
        }}
      >
        {/* Sky-blue top cap */}
        <div style={{ height: 3, background: SKY, borderRadius: '20px 20px 0 0' }} />

        <div style={{ padding: '28px 32px 32px' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <h2
                style={{
                  margin: 0,
                  color: '#f0f8ff',
                  fontSize: 28,
                  fontWeight: 700,
                  fontFamily: 'var(--font-playfair)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                }}
              >
                {isEdit ? 'Edit booking' : 'New booking'}
              </h2>
              <p style={{ margin: '6px 0 0', color: TXT_MUTED, fontSize: 13 }}>
                {isEdit ? 'Update reservation details' : date ? displayDate : 'Add reservation details'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                flexShrink: 0,
                marginLeft: 16,
                width: 34,
                height: 34,
                borderRadius: '50%',
                border: `1px solid ${BORDER_REST}`,
                background: 'transparent',
                color: TXT_MUTED,
                cursor: 'pointer',
                fontSize: 20,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ height: 1, background: 'rgba(56,189,248,0.1)', marginBottom: 28 }} />

          <div style={{ display: 'grid', gap: 22 }}>

            {/* Guest name — floating label */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onFocus={() => setFocusedField('guest')}
                onBlur={() => setFocusedField(null)}
                placeholder=""
                style={{
                  ...inp,
                  ...iField('guest'),
                  paddingTop: guestFloating ? 24 : 18,
                  paddingBottom: guestFloating ? 10 : 18,
                  fontSize: 16,
                  fontWeight: 500,
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: 16,
                  top: guestFloating ? 8 : 17,
                  fontSize: guestFloating ? 10 : 16,
                  fontWeight: guestFloating ? 700 : 400,
                  letterSpacing: guestFloating ? '0.18em' : 0,
                  textTransform: guestFloating ? 'uppercase' : 'none',
                  color: focusedField === 'guest' ? SKY : guestFloating ? TXT_MUTED : TXT_SUBTLE,
                  pointerEvents: 'none',
                  transition: 'all 0.18s ease',
                  userSelect: 'none',
                }}
              >
                Guest name
              </span>
            </div>

            {/* Party size — quick-select grid + stepper overflow */}
            <div>
              <span style={secLabel}>Party size</span>
              {/* Quick-select 1–8 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 6, marginBottom: 8 }}>
                {[1,2,3,4,5,6,7,8].map((n) => (
                  <motion.button
                    key={n}
                    type="button"
                    onClick={() => { setPartySize(n); setPartySizeInput(String(n)) }}
                    whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                    style={{
                      height: 44,
                      borderRadius: 10,
                      border: partySize === n ? `1px solid ${SKY}` : `1px solid ${BORDER_REST}`,
                      background: partySize === n ? `rgba(56,189,248,0.14)` : SURFACE,
                      color: partySize === n ? SKY : TXT_MUTED,
                      fontSize: 15,
                      fontWeight: partySize === n ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      boxShadow: partySize === n ? `0 0 0 2px rgba(56,189,248,0.18)` : 'none',
                    }}
                  >
                    {n}
                  </motion.button>
                ))}
              </div>
              {/* Stepper for 9+ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <motion.button
                  type="button"
                  onClick={() => { const n = Math.max(1, partySize - 1); setPartySize(n); setPartySizeInput(String(n)) }}
                  whileTap={reduceMotion ? undefined : { scale: 0.88 }}
                  style={{ ...stepBtn, width: 38, height: 38, fontSize: 18, opacity: partySize <= 1 ? 0.35 : 1 }}
                >
                  −
                </motion.button>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={partySizeInput}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '')
                      setPartySizeInput(raw)
                      const v = parseInt(raw, 10)
                      if (!isNaN(v) && v >= 1) setPartySize(Math.min(50, v))
                    }}
                    onFocus={() => setFocusedField('partySize')}
                    onBlur={() => {
                      setFocusedField(null)
                      // restore valid value if field left empty
                      const v = parseInt(partySizeInput, 10)
                      const safe = isNaN(v) || v < 1 ? 1 : Math.min(50, v)
                      setPartySize(safe)
                      setPartySizeInput(String(safe))
                    }}
                    style={{
                      width: 48,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: TXT,
                      fontSize: 20,
                      fontWeight: 700,
                      textAlign: 'center',
                      fontFamily: 'inherit',
                    }}
                  />
                  <span style={{ color: TXT_MUTED, fontSize: 13, userSelect: 'none' }}>
                    {partySize === 1 ? 'guest' : 'guests'}
                  </span>
                </div>
                <motion.button
                  type="button"
                  onClick={() => { const n = Math.min(50, partySize + 1); setPartySize(n); setPartySizeInput(String(n)) }}
                  whileTap={reduceMotion ? undefined : { scale: 0.88 }}
                  style={{ ...stepBtn, width: 38, height: 38, fontSize: 18, opacity: partySize >= 50 ? 0.35 : 1 }}
                >
                  +
                </motion.button>
              </div>
            </div>

            {/* Date + Time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <span style={secLabel}>Date</span>
                <div
                  style={{
                    position: 'relative',
                    background: SURFACE,
                    border: `1px solid ${BORDER_REST}`,
                    borderRadius: 12,
                    height: 50,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 14px',
                    gap: 10,
                    overflow: 'hidden',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <rect x="1.5" y="3" width="13" height="11" rx="2" stroke={SKY} strokeWidth="1.2"/>
                    <path d="M1.5 6.5h13" stroke={SKY} strokeWidth="1.2"/>
                    <path d="M5 1.5V4M11 1.5V4" stroke={SKY} strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  <span
                    style={{
                      color: date ? TXT : TXT_SUBTLE,
                      fontSize: 13,
                      fontWeight: 500,
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {displayDate}
                  </span>
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={date}
                    min={isEdit ? undefined : new Date().toISOString().split('T')[0]}
                    onChange={(e) => setDate(e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
                  />
                </div>
              </div>

              <div>
                <span style={secLabel}>Time</span>
                <div style={{ position: 'relative' }}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 1 }}
                  >
                    <circle cx="8" cy="8" r="6.25" stroke={SKY} strokeWidth="1.2"/>
                    <path d="M8 5v3l2 1.5" stroke={SKY} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <select
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    onFocus={() => setFocusedField('time')}
                    onBlur={() => setFocusedField(null)}
                    style={{
                      ...inp,
                      ...iField('time'),
                      paddingLeft: 42,
                      paddingTop: 0,
                      paddingBottom: 0,
                      height: 50,
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {TIME_SLOTS.map(({ value, label }) => (
                      <option key={value} value={value} style={{ color: '#ffffff', background: '#091525' }}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Table */}
            <div>
              <span style={secLabel}>Table</span>
              <input
                type="text"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                onFocus={() => setFocusedField('table')}
                onBlur={() => setFocusedField(null)}
                placeholder="Optional"
                style={{
                  ...inp,
                  ...iField('table'),
                  paddingTop: 16,
                  paddingBottom: 16,
                }}
              />
            </div>

            {/* Status (edit only) */}
            {isEdit && (
              <div>
                <span style={secLabel}>Status</span>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ResStatus)}
                  onFocus={() => setFocusedField('status')}
                  onBlur={() => setFocusedField(null)}
                  style={{
                    ...inp,
                    ...iField('status'),
                    paddingTop: 0,
                    paddingBottom: 0,
                    height: 50,
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s} style={{ color: '#ffffff', background: '#091525' }}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Notes */}
            <div>
              <span style={secLabel}>Notes</span>
              <textarea
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                onFocus={() => setFocusedField('notes')}
                onBlur={() => setFocusedField(null)}
                placeholder="Dietary requirements, special occasion, seating preference..."
                rows={3}
                style={{
                  ...inp,
                  ...iField('notes'),
                  paddingTop: 14,
                  paddingBottom: 14,
                  resize: 'none',
                  lineHeight: 1.6,
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 10,
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#f87171',
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <motion.button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              whileHover={saving || reduceMotion ? undefined : { scale: 1.02 }}
              whileTap={saving || reduceMotion ? undefined : { scale: 0.97 }}
              style={{
                position: 'relative',
                width: '100%',
                height: 56,
                border: 'none',
                borderRadius: 12,
                background: saving ? 'rgba(56,189,248,0.35)' : SKY,
                color: saving ? 'rgba(5,13,26,0.5)' : NAVY,
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 4,
                overflow: 'hidden',
              }}
            >
              {!saving && !reduceMotion && (
                <motion.div
                  animate={{ x: ['-120%', '280%'] }}
                  transition={{ repeat: Infinity, duration: 2.8, ease: 'linear', repeatDelay: 1.4 }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    width: '35%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)',
                    pointerEvents: 'none',
                  }}
                />
              )}
              {saving ? (
                <>
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: '2px solid rgba(5,13,26,0.25)',
                      borderTopColor: NAVY,
                      display: 'inline-block',
                    }}
                  />
                  {isEdit ? 'Saving…' : 'Confirming…'}
                </>
              ) : isEdit ? (
                'Save Changes'
              ) : (
                'Confirm booking'
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BookingsPage() {
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [monthOffset, setMonthOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [listFilter, setListFilter] = useState<ListFilter>('today')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editReservation, setEditReservation] = useState<Reservation | null>(null)
  const [prefilledDate, setPrefilledDate] = useState<string | undefined>(undefined)
  const reduceMotion = useReducedMotion()

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const displayMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const monthLabel = displayMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  // ─── Load data ─────────────────────────────────────────────────────────────
  const [loadError, setLoadError] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading + error on month change before async refetch
    setLoading(true)
    setLoadError(null)

    async function load() {
      const {
        data: { user: userFromGet },
      } = await supabase.auth.getUser()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const user = userFromGet ?? session?.user ?? null

      if (!user) {
        if (!cancelled) {
          setReservations([])
          setBusinessId(null)
          setLoading(false)
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
          setReservations([])
          setBusinessId(null)
          setLoading(false)
        }
        return
      }

      if (!cancelled) setBusinessId(business.id)

      const p2 = (n: number) => String(n).padStart(2, '0')
      const y = displayMonth.getFullYear()
      const mo = displayMonth.getMonth()
      const startStr = `${y}-${p2(mo + 1)}-01T00:00:00`
      const endDate = new Date(y, mo + 1, 1)
      const endStr = `${endDate.getFullYear()}-${p2(endDate.getMonth() + 1)}-01T00:00:00`

      const { data: rows, error } = await supabase
        .from('appointments')
        .select('id, service_name, scheduled_at, status, customer_id')
        .eq('business_id', business.id)
        .gte('scheduled_at', startStr)
        .lt('scheduled_at', endStr)
        .order('scheduled_at', { ascending: true })

      if (cancelled) return

      if (error) {
        setReservations([])
        setLoadError("We couldn't load reservations.")
        setLoading(false)
        return
      }

      if (!rows) {
        setReservations([])
        setLoading(false)
        return
      }

      const typed = rows as DbRow[]
      const ids = [
        ...new Set(typed.map((r) => r.customer_id).filter((id): id is string => Boolean(id))),
      ]
      const nameById = new Map<string, string>()

      if (ids.length > 0) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id, name')
          .in('id', ids)
        for (const c of customers ?? []) {
          if (c.id && c.name) nameById.set(String(c.id), String(c.name))
        }
      }

      if (!cancelled) {
        setReservations(
          typed.map((r) =>
            parseReservation(r, r.customer_id ? nameById.get(r.customer_id) : undefined),
          ),
        )
        setLoading(false)
      }
    }

    void load()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (!cancelled) void load()
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [monthOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Helpers ───────────────────────────────────────────────────────────────
  async function updateStatus(id: string, status: ResStatus) {
    const previous = reservations
    setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
    setUpdateError(null)
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (error) {
      setReservations(previous)
      setUpdateError("Couldn't update reservation. Please try again.")
    }
  }

  async function deleteReservation(id: string) {
    const previous = reservations
    setReservations((prev) => prev.filter((r) => r.id !== id))
    setUpdateError(null)
    const { error } = await supabase.from('appointments').delete().eq('id', id)
    if (error) {
      setReservations(previous)
      setUpdateError("Couldn't delete reservation. Please try again.")
    }
  }

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const todayRes = reservations.filter(
      (r) =>
        isSameDay(r.scheduledAt, today) &&
        r.status !== 'cancelled' &&
        r.status !== 'no-show',
    )
    const todayCovers = todayRes.reduce((s, r) => s + r.partySize, 0)

    const weekStart = startOfWeekMon(today)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekCount = reservations.filter(
      (r) =>
        r.scheduledAt >= weekStart &&
        r.scheduledAt < weekEnd &&
        r.status !== 'cancelled',
    ).length

    const pending = reservations.filter((r) => r.status === 'pending').length
    return { todayCovers, weekCount, pending }
  }, [reservations]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Filtered list ─────────────────────────────────────────────────────────
  const listReservations = useMemo(() => {
    if (listFilter === 'today') return reservations.filter((r) => isSameDay(r.scheduledAt, today))
    if (listFilter === 'week') {
      const ws = startOfWeekMon(today)
      const we = new Date(ws)
      we.setDate(we.getDate() + 7)
      return reservations.filter((r) => r.scheduledAt >= ws && r.scheduledAt < we)
    }
    return reservations
  }, [reservations, listFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDayReservations = useMemo(
    () =>
      selectedDay
        ? reservations.filter((r) => isSameDay(r.scheduledAt, selectedDay))
        : [],
    [reservations, selectedDay],
  )

  const showModal = showAddModal || editReservation !== null

  return (
    <DashboardOceanNav activeNav="Bookings">
      {({ isMobile, openNav }) => (
        <main style={{ display: 'grid', gap: 20, paddingBottom: 48 }}>
          {/* Mobile hamburger */}
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

          {/* ── HEADER ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={oceanTransition(reduceMotion, { duration: 0.22 })}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 16,
              flexWrap: 'wrap',
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
                Reservations
              </h1>
              <p style={{ margin: '6px 0 0', color: t.textMuted, fontSize: 13 }}>
                Manage your restaurant reservations
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* Today button — jumps back to current month */}
              <button
                type="button"
                onClick={() => setMonthOffset(0)}
                style={{
                  padding: '0 14px',
                  height: 34,
                  borderRadius: 8,
                  border: `1px solid ${monthOffset === 0 ? t.accent : t.border}`,
                  background: monthOffset === 0 ? t.accentSoftBg : t.bgSurface,
                  color: monthOffset === 0 ? t.accent : t.text,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                Today
              </button>

              {/* Month navigation — ← Month Year → */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  padding: 4,
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bgSurface,
                }}
              >
                <button
                  type="button"
                  onClick={() => setMonthOffset((o) => o - 1)}
                  title="Previous month"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: t.text,
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                >
                  ←
                </button>
                <span
                  style={{
                    padding: '0 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: t.text,
                    whiteSpace: 'nowrap',
                    minWidth: 110,
                    textAlign: 'center',
                    letterSpacing: '0.02em',
                  }}
                >
                  {monthLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setMonthOffset((o) => o + 1)}
                  title="Next month"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: t.text,
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                >
                  →
                </button>
              </div>

              {/* Calendar | List toggle */}
              <div
                style={{
                  display: 'flex',
                  padding: 3,
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bgSurface,
                }}
              >
                {(['calendar', 'list'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      border: 'none',
                      background: view === v ? t.accentSoftBg : 'transparent',
                      color: view === v ? t.accent : t.textMuted,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {v === 'calendar' ? 'Calendar' : 'List'}
                  </button>
                ))}
              </div>

              {/* Add Reservation */}
              <motion.button
                type="button"
                whileHover={reduceMotion ? undefined : { y: -1 }}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                onClick={() => setShowAddModal(true)}
                style={{
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px 18px',
                  background: t.accent,
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                New booking
              </motion.button>
            </div>
          </motion.div>

          {/* ── ERRORS ── */}
          {loadError || updateError ? (
            <motion.div
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                borderRadius: 10,
                border: `1px solid ${t.dangerBorder}`,
                background: t.dangerBg,
                color: t.danger,
                padding: '12px 16px',
                fontSize: 13,
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{loadError ?? updateError}</span>
              <button
                type="button"
                onClick={() => {
                  setLoadError(null)
                  setUpdateError(null)
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: t.danger,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Dismiss
              </button>
            </motion.div>
          ) : null}

          {/* ── STATS ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={oceanTransition(reduceMotion, { delay: 0.05, duration: 0.22 })}
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
              gap: 14,
            }}
          >
            {[
              { label: 'Guests Today', value: loading ? '—' : String(stats.todayCovers) },
              { label: 'This Week', value: loading ? '—' : String(stats.weekCount) },
              { label: 'Pending', value: loading ? '—' : String(stats.pending) },
            ].map(({ label, value }) => (
              <div key={label} style={{ ...glass, padding: 16 }}>
                <div
                  style={{
                    color: t.textMuted,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.16em',
                    fontWeight: 600,
                  }}
                >
                  {label}
                </div>
                <div
                  style={{ marginTop: 10, color: t.text, fontSize: 28, fontWeight: 700 }}
                >
                  {value}
                </div>
              </div>
            ))}
          </motion.div>

          {/* ── MAIN VIEW ── */}
          <AnimatePresence mode="wait">
            {view === 'calendar' ? (
              <motion.div
                key="calendar"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={oceanTransition(reduceMotion, { duration: 0.18 })}
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: selectedDay && !isMobile ? 16 : 0,
                  alignItems: 'start',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <MonthCalendar
                    displayMonth={displayMonth}
                    reservations={reservations}
                    selectedDay={selectedDay}
                    onSelectDay={(d) =>
                      setSelectedDay((prev) =>
                        prev && isSameDay(prev, d) ? null : d,
                      )
                    }
                    today={today}
                  />
                </div>

                {/* Desktop: panel slot always in flex flow, width animates 0→340 */}
                {!isMobile && (
                  <motion.div
                    animate={{ width: selectedDay ? 340 : 0 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }
                    }
                    style={{ overflow: 'hidden', flexShrink: 0 }}
                  >
                    <div style={{ width: 340 }}>
                      {selectedDay && (
                        <DayPanel
                          key={selectedDay.toISOString()}
                          day={selectedDay}
                          reservations={selectedDayReservations}
                          onClose={() => setSelectedDay(null)}
                          onConfirm={(id) => void updateStatus(id, 'confirmed')}
                          onCancel={(id) => void updateStatus(id, 'cancelled')}
                          onDelete={(id) => void deleteReservation(id)}
                          onEdit={(r) => setEditReservation(r)}
                          onAddForDay={() => {
                            const d = selectedDay
                            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                            setPrefilledDate(iso)
                            setShowAddModal(true)
                          }}
                        />
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Mobile: panel appears below calendar */}
                {isMobile && (
                  <AnimatePresence>
                    {selectedDay && (
                      <DayPanel
                        key={selectedDay.toISOString()}
                        day={selectedDay}
                        reservations={selectedDayReservations}
                        onClose={() => setSelectedDay(null)}
                        onConfirm={(id) => void updateStatus(id, 'confirmed')}
                        onCancel={(id) => void updateStatus(id, 'cancelled')}
                        onDelete={(id) => void deleteReservation(id)}
                        onEdit={(r) => setEditReservation(r)}
                        onAddForDay={() => {
                          const d = selectedDay
                          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                          setPrefilledDate(iso)
                          setShowAddModal(true)
                        }}
                      />
                    )}
                  </AnimatePresence>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={oceanTransition(reduceMotion, { duration: 0.18 })}
              >
                <ReservationListView
                  reservations={listReservations}
                  filter={listFilter}
                  onFilterChange={setListFilter}
                  loading={loading}
                  onConfirm={(id) => void updateStatus(id, 'confirmed')}
                  onCancel={(id) => void updateStatus(id, 'cancelled')}
                  onDelete={(id) => void deleteReservation(id)}
                  onEdit={(r) => setEditReservation(r)}
                  isMobile={isMobile}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── MODAL ── */}
          <AnimatePresence>
            {showModal && (
              <ReservationModal
                mode={editReservation ? 'edit' : 'add'}
                editReservation={editReservation}
                initialDate={editReservation ? undefined : prefilledDate}
                onClose={() => {
                  setShowAddModal(false)
                  setEditReservation(null)
                  setPrefilledDate(undefined)
                }}
                businessId={businessId}
                onAdded={(newRes) => {
                  if (
                    newRes.scheduledAt.getFullYear() === displayMonth.getFullYear() &&
                    newRes.scheduledAt.getMonth() === displayMonth.getMonth()
                  ) {
                    setReservations((prev) =>
                      [...prev, newRes].sort(
                        (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
                      ),
                    )
                  }
                  setShowAddModal(false)
                  setPrefilledDate(undefined)
                }}
                onUpdated={(updated) => {
                  setReservations((prev) =>
                    prev
                      .map((r) => (r.id === updated.id ? updated : r))
                      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()),
                  )
                  setEditReservation(null)
                }}
              />
            )}
          </AnimatePresence>
        </main>
      )}
    </DashboardOceanNav>
  )
}
