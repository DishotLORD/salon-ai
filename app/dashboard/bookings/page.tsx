'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { BookingsDayChips, BookingsDayEmptyStrip } from '@/components/bookings-day-chips'
import { BookingsLightCalendar } from '@/components/bookings-light-calendar'
import { BookingsDayTimeline } from '@/components/bookings-day-timeline'
import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { TimeDialPicker } from '@/components/time-dial-picker'
import {
  DEFAULT_OPERATING_HOURS,
  formatHoursRangeLabel,
  getDayHoursForDate,
  peaksForDate,
  parseOperatingHours,
  scheduleKindLabel,
  timelineRangeFromDayHours,
  type OperatingHours,
} from '@/lib/operating-hours'
import { ReservationCard, type Reservation, type ResStatus } from '@/components/reservation-card'
import { oceanTransition } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'
import { card, t } from '@/lib/dashboard-theme'
import { bk, bkCard } from '@/lib/bookings-compact-ui'
import { computeBookingKpi, isInDisplayMonth } from '@/lib/booking-kpi'
import { toDateIso, toWallClock } from '@/lib/reservation-schedule'
import {
  buildTimeSlots,
  minutesToTime,
  snapToGrid,
  timeToMinutes,
  timeToTimelineMinutes,
} from '@/lib/time-timeline'

type DbRow = {
  id: string
  service_name: string | null
  scheduled_at: string
  status: string | null
  customer_id: string | null
  conversation_id: string | null
  notes: string | null
}

type AdvancedFilters = {
  minPartySize: number | null
  source: 'all' | 'chat' | 'manual'
}

const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = {
  minPartySize: null,
  source: 'all',
}

function applyAdvancedFilters(list: Reservation[], filters: AdvancedFilters): Reservation[] {
  let out = list
  if (filters.minPartySize != null && filters.minPartySize > 0) {
    out = out.filter((r) => r.partySize >= filters.minPartySize!)
  }
  if (filters.source === 'chat') {
    out = out.filter((r) => Boolean(r.conversationId))
  } else if (filters.source === 'manual') {
    out = out.filter((r) => !r.conversationId)
  }
  return out
}

function advancedFiltersActive(filters: AdvancedFilters) {
  return filters.minPartySize != null || filters.source !== 'all'
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
  const notesFromServiceName = notesPart ? notesPart.replace(/^Notes:\s*/i, '').trim() : ''
  const specialRequests = row.notes?.trim() || notesFromServiceName

  return {
    id: row.id,
    guestName,
    partySize,
    tableNumber,
    scheduledAt: new Date(row.scheduled_at),
    status: normalizeStatus(row.status),
    specialRequests,
    customerId: row.customer_id ?? null,
    conversationId: row.conversation_id ?? null,
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
  operatingHours,
  bare,
}: {
  displayMonth: Date
  reservations: Reservation[]
  selectedDay: Date | null
  onSelectDay: (d: Date) => void
  today: Date
  operatingHours: OperatingHours
  bare?: boolean
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

  // Precompute per-day booking stats for the heatmap bar
  const dayStats = new Map<string, { count: number; covers: number }>()
  for (const r of reservations) {
    if (r.status === 'cancelled' || r.status === 'no-show') continue
    const rd = r.scheduledAt
    const k = `${rd.getFullYear()}-${rd.getMonth()}-${rd.getDate()}`
    const curr = dayStats.get(k) ?? { count: 0, covers: 0 }
    dayStats.set(k, { count: curr.count + 1, covers: curr.covers + r.partySize })
  }
  const maxCount = Math.max(1, ...Array.from(dayStats.values()).map((s) => s.count))

  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div style={bare ? { overflow: 'hidden' } : { ...glass, overflow: 'hidden' }}>
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
          const k = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
          const { count, covers } = dayStats.get(k) ?? { count: 0, covers: 0 }
          const fillPct = count / maxCount
          const isToday = isSameDay(date, today)
          const isSelected = selectedDay ? isSameDay(date, selectedDay) : false
          const closed = inMonth && getDayHoursForDate(operatingHours, toDateIso(date)).closed
          const showTodayRing = isToday && !isSelected

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectDay(date)}
              title={closed ? 'Closed' : count > 0 ? `${count} bookings, ${covers} guests` : undefined}
              style={{
                minHeight: 44,
                padding: 0,
                background: closed ? t.bgSurfaceMuted : isSelected ? t.accentSoftBg : t.bgSurface,
                border: 'none',
                borderTop: idx >= 7 ? `1px solid ${t.borderSoft}` : 'none',
                borderRight: (idx + 1) % 7 !== 0 ? `1px solid ${t.borderSoft}` : 'none',
                outline: isSelected
                  ? `2px solid ${t.accentSoftBorder}`
                  : showTodayRing
                    ? `1px solid ${t.accent}`
                    : 'none',
                outlineOffset: -2,
                cursor: 'pointer',
                opacity: closed && inMonth ? 0.7 : 1,
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                transition: 'background 0.12s',
              }}
            >
              {/* Count badge (left) + day number (right) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 5px 0' }}>
                {count > 0 ? (
                  <span style={{
                    minWidth: 18,
                    height: 18,
                    padding: '0 4px',
                    borderRadius: 5,
                    background: t.accentSoftBg,
                    border: `1px solid ${t.accentSoftBorder}`,
                    color: t.accentText,
                    fontSize: 9,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}>
                    {count}
                  </span>
                ) : (
                  <span style={{ width: 18 }} />
                )}
                <span style={{
                  fontSize: 12,
                  fontWeight: isToday ? 700 : inMonth ? 500 : 400,
                  color: !inMonth ? t.textSubtle : isToday ? t.accent : t.text,
                }}>
                  {date.getDate()}
                </span>
              </div>

              {/* Guest count */}
              {covers > 0 && (
                <span style={{ fontSize: 9, color: t.textMuted, padding: '2px 8px 0', letterSpacing: '0.01em' }}>
                  {covers} {covers === 1 ? 'guest' : 'guests'}
                </span>
              )}

              <div style={{ flex: 1 }} />

              {/* Heat bar — proportional to busiest day this month */}
              {count > 0 && (
                <div style={{ height: 3, margin: '0 6px 5px', borderRadius: 2, background: t.bgSurfaceMuted, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.max(12, fillPct * 100)}%`,
                    background: t.accent,
                    borderRadius: 2,
                  }} />
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
  onGuestClick,
}: {
  day: Date
  reservations: Reservation[]
  onClose: () => void
  onConfirm: (id: string) => void
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (r: Reservation) => void
  onAddForDay: () => void
  onGuestClick?: (customerId: string, guestName: string) => void
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
                onGuestClick={onGuestClick}
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
  loading,
  onConfirm,
  onCancel,
  onDelete,
  onEdit,
  isMobile,
  onGuestClick,
}: {
  reservations: Reservation[]
  loading: boolean
  onConfirm: (id: string) => void
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  onEdit: (r: Reservation) => void
  isMobile: boolean
  onGuestClick?: (customerId: string, guestName: string) => void
}) {
  const emptyMsg = 'No reservations for this period'

  return isMobile ? (
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
                onGuestClick={onGuestClick}
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
      )
}

const STATUS_OPTIONS: ResStatus[] = ['pending', 'confirmed', 'seated', 'cancelled', 'no-show']

const MODAL_FONT = {
  playfair: 'var(--font-playfair), Georgia, serif',
  jakarta: 'var(--font-plus-jakarta), system-ui, sans-serif',
} as const

const STATUS_ICONS: Record<ResStatus, string> = {
  pending: '◷',
  confirmed: '✦',
  seated: '◎',
  cancelled: '✕',
  'no-show': '○',
}

function buildServiceName(
  guestName: string,
  partySize: number,
  tableNumber: string,
  notes: string,
): string {
  return [
    guestName.trim().replace(/\u00b7/g, '-'),
    `Party of ${partySize}`,
    tableNumber.trim() ? `Table ${tableNumber.trim()}` : null,
    notes.trim() ? `Notes: ${notes.trim()}` : null,
  ]
    .filter(Boolean)
    .join(' \u00b7 ')
}

function PartySizeCompact({
  value,
  onChange,
  reduceMotion,
}: {
  value: number
  onChange: (n: number) => void
  reduceMotion: boolean | null
}) {
  const quick = [1, 2, 3, 4, 5, 6, 7, 8]
  const clamp = (n: number) => Math.min(50, Math.max(1, n))

  const stepBtn: CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.bgSurface,
    color: t.text,
    fontSize: 18,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <motion.button
          type="button"
          aria-label="Decrease party size"
          onClick={() => onChange(clamp(value - 1))}
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          disabled={value <= 1}
          style={{ ...stepBtn, opacity: value <= 1 ? 0.4 : 1 }}
        >
          −
        </motion.button>
        <motion.div
          key={value}
          initial={reduceMotion ? false : { scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 28 }}
          style={{
            minWidth: 44,
            textAlign: 'center',
            fontFamily: MODAL_FONT.playfair,
            fontSize: 26,
            fontWeight: 600,
            color: t.text,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </motion.div>
        <motion.button
          type="button"
          aria-label="Increase party size"
          onClick={() => onChange(clamp(value + 1))}
          whileTap={reduceMotion ? undefined : { scale: 0.92 }}
          disabled={value >= 50}
          style={{ ...stepBtn, opacity: value >= 50 ? 0.4 : 1 }}
        >
          +
        </motion.button>
        <span style={{ fontSize: 12, color: t.textMuted, fontFamily: MODAL_FONT.jakarta }}>
          {value === 1 ? 'guest' : 'guests'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {quick.map((n) => {
          const active = value === n
          return (
            <motion.button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              style={{
                minWidth: 32,
                height: 28,
                padding: '0 8px',
                borderRadius: 8,
                border: `1px solid ${active ? t.accentSoftBorder : t.border}`,
                background: active ? t.accentSoftBg : t.bgSurfaceMuted,
                color: active ? t.accent : t.textMuted,
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                fontFamily: MODAL_FONT.jakarta,
                boxShadow: active ? t.accentGlow : 'none',
              }}
            >
              {n}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

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
  const appointmentId = editReservation?.id ?? null

  const nowDefault = new Date()
  const defaultDate = initialDate ?? nowDefault.toISOString().split('T')[0]
  const defaultTime = `${String(nowDefault.getHours() + 1).padStart(2, '0')}:00`

  const [hydrating, setHydrating] = useState(isEdit)
  const [guestName, setGuestName] = useState('')
  const [partySize, setPartySize] = useState(2)
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState(defaultTime)
  const [tableNumber, setTableNumber] = useState('')
  const [specialRequests, setSpecialRequests] = useState('')
  const [editStatus, setEditStatus] = useState<ResStatus>('pending')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const [operatingHours, setOperatingHours] = useState<OperatingHours>(DEFAULT_OPERATING_HOURS)

  const dayHours = useMemo(() => getDayHoursForDate(operatingHours, date), [operatingHours, date])
  const timeRange = useMemo(() => timelineRangeFromDayHours(dayHours), [dayHours])
  const reservationPeaks = useMemo(
    () => (timeRange ? peaksForDate(date, timeRange) : []),
    [date, timeRange],
  )

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('businesses')
        .select('operating_hours')
        .eq('id', businessId)
        .maybeSingle()
      if (cancelled || !data) return
      setOperatingHours(parseOperatingHours((data as { operating_hours?: unknown }).operating_hours))
    })()
    return () => {
      cancelled = true
    }
  }, [businessId])

  const applyReservation = useCallback(
    (r: Reservation) => {
      const d = r.scheduledAt
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const row = getDayHoursForDate(operatingHours, dateStr)
      const range = timelineRangeFromDayHours(row)
      setGuestName(r.guestName)
      setPartySize(r.partySize)
      setDate(dateStr)
      setTime(
        range
          ? snapToGrid(d.getHours() * 60 + d.getMinutes(), range)
          : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      )
      setTableNumber(r.tableNumber !== '—' ? r.tableNumber : '')
      setSpecialRequests(r.specialRequests)
      setEditStatus(r.status)
    },
    [operatingHours],
  )

  useEffect(() => {
    if (!timeRange) return
    setTime((prev) => snapToGrid(timeToMinutes(prev), timeRange))
  }, [date, timeRange])

  useEffect(() => {
    if (!isEdit || !appointmentId) {
      if (!isEdit) {
        setGuestName('')
        setPartySize(2)
        setDate(defaultDate)
        setTime(defaultTime)
        setTableNumber('')
        setSpecialRequests('')
        setEditStatus('pending')
      }
      setHydrating(false)
      return
    }

    let cancelled = false
    setHydrating(true)
    setError('')

    void (async () => {
      const { data, error: fetchError } = await supabase
        .from('appointments')
        .select('id, service_name, scheduled_at, status, customer_id, notes')
        .eq('id', appointmentId)
        .single()

      if (cancelled) return

      if (fetchError || !data) {
        applyReservation(editReservation!)
        setError(fetchError?.message ?? 'Could not load reservation.')
      } else {
        applyReservation(parseReservation(data as DbRow))
      }
      setHydrating(false)
    })()

    return () => {
      cancelled = true
    }
  }, [isEdit, appointmentId, defaultDate, defaultTime, editReservation, applyReservation])

  const handleSubmit = async () => {
    if (!guestName.trim()) {
      setError('Guest name is required.')
      return
    }
    if (!date || !time) {
      setError('Date and time are required.')
      return
    }
    if (!timeRange) {
      setError('The restaurant is closed on this day — choose another date.')
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
    const notesValue = specialRequests.trim() || null
    const serviceName = buildServiceName(guestName, partySize, tableNumber, specialRequests)

    if (isEdit && editReservation) {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          service_name: serviceName,
          scheduled_at: wallClock,
          status: editStatus,
          notes: notesValue,
        })
        .eq('id', editReservation.id)

      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }

      onUpdated({
        ...editReservation,
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
        notes: notesValue,
      })
      .select('id, service_name, scheduled_at, status, customer_id, notes')
      .single()

    setSaving(false)
    if (insertError || !data) {
      setError(insertError?.message ?? 'Failed to add reservation.')
      return
    }

    onAdded(parseReservation(data as DbRow))
  }

  const guestFloating = focusedField === 'guest' || guestName.length > 0

  const fieldFocus = (field: string): CSSProperties =>
    focusedField === field
      ? { border: `1.5px solid ${t.accent}`, boxShadow: `0 0 0 3px ${t.accentSoftBg}` }
      : { border: `1px solid ${t.border}` }

  const inp: CSSProperties = {
    width: '100%',
    borderRadius: 10,
    background: t.bgSurface,
    color: t.text,
    fontSize: 14,
    outline: 'none',
    fontFamily: MODAL_FONT.jakarta,
    boxSizing: 'border-box',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
  }

  const sectionLabel: CSSProperties = {
    display: 'block',
    marginBottom: 6,
    color: t.textMuted,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    fontFamily: MODAL_FONT.jakarta,
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reservation-modal-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(6,14,28,0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={
          reduceMotion
            ? { duration: 0.15 }
            : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
        }
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(420px, 100%)',
          maxHeight: 'min(88vh, 720px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 16,
          background: 'var(--t-glass-bg)',
          border: `1px solid ${t.border}`,
          boxShadow: t.shadowLg,
          fontFamily: MODAL_FONT.jakarta,
        }}
      >
        <div
          style={{
            padding: '14px 18px 12px',
            borderBottom: `1px solid ${t.border}`,
            background: t.accentSoftBg,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: '0 0 4px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: t.accent,
                  fontFamily: MODAL_FONT.jakarta,
                }}
              >
                {isEdit ? 'Booking' : 'New'}
              </p>
              <h2
                id="reservation-modal-title"
                style={{
                  margin: 0,
                  fontFamily: MODAL_FONT.playfair,
                  fontSize: 22,
                  fontWeight: 600,
                  color: t.text,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                }}
              >
                {isEdit ? 'Edit reservation' : 'Add reservation'}
              </h2>
            </div>
            <motion.button
              type="button"
              aria-label="Close"
              onClick={onClose}
              whileHover={reduceMotion ? undefined : { scale: 1.05 }}
              whileTap={reduceMotion ? undefined : { scale: 0.95 }}
              style={{
                flexShrink: 0,
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `1px solid ${t.border}`,
                background: t.bgSurface,
                color: t.textMuted,
                cursor: 'pointer',
                fontSize: 18,
                display: 'grid',
                placeItems: 'center',
                lineHeight: 1,
              }}
            >
              ×
            </motion.button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 16px' }}>
          {hydrating ? (
            <div style={{ display: 'grid', gap: 10, padding: '12px 0' }}>
              {[48, 40, 56, 40].map((h, i) => (
                <motion.div
                  key={i}
                  animate={{ opacity: [0.35, 0.7, 0.35] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.1 }}
                  style={{ height: h, borderRadius: 10, background: t.bgSurfaceMuted }}
                />
              ))}
            </div>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
              }}
              style={{ display: 'grid', gap: 14 }}
            >
              {/* Guest */}
              <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    onFocus={() => setFocusedField('guest')}
                    onBlur={() => setFocusedField(null)}
                    autoComplete="name"
                    style={{
                      ...inp,
                      ...fieldFocus('guest'),
                      paddingTop: guestFloating ? 22 : 14,
                      paddingBottom: guestFloating ? 8 : 14,
                      paddingLeft: 14,
                      paddingRight: 14,
                      fontWeight: 500,
                    }}
                  />
                  <label
                    style={{
                      position: 'absolute',
                      left: 14,
                      top: guestFloating ? 8 : 14,
                      fontSize: guestFloating ? 10 : 14,
                      fontWeight: guestFloating ? 700 : 400,
                      letterSpacing: guestFloating ? '0.12em' : 0,
                      textTransform: guestFloating ? 'uppercase' : 'none',
                      color: focusedField === 'guest' ? t.accent : guestFloating ? t.textMuted : t.textSubtle,
                      pointerEvents: 'none',
                      transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
                      fontFamily: MODAL_FONT.jakarta,
                    }}
                  >
                    Guest name
                  </label>
                </div>
              </motion.div>

              <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                <span style={sectionLabel}>Party size</span>
                <PartySizeCompact value={partySize} onChange={setPartySize} reduceMotion={reduceMotion} />
              </motion.div>

              <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                <span style={sectionLabel}>Date</span>
                <div
                  style={{
                    position: 'relative',
                    height: 42,
                    borderRadius: 10,
                    ...fieldFocus('date'),
                    background: t.bgSurface,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                  onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <rect x="1.5" y="3" width="13" height="11" rx="2" stroke={t.accent} strokeWidth="1.2" />
                    <path d="M1.5 6.5h13" stroke={t.accent} strokeWidth="1.2" />
                    <path d="M5 1.5V4M11 1.5V4" stroke={t.accent} strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: 500,
                      color: date ? t.text : t.textSubtle,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {date
                      ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Select date'}
                  </span>
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={date}
                    min={isEdit ? undefined : new Date().toISOString().split('T')[0]}
                    onChange={(e) => setDate(e.target.value)}
                    onFocus={() => setFocusedField('date')}
                    onBlur={() => setFocusedField(null)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
                  />
                </div>
              </motion.div>

              <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                <span style={sectionLabel}>Time</span>
                <p
                  style={{
                    margin: '0 0 8px',
                    fontSize: 11,
                    color: t.textMuted,
                    fontFamily: MODAL_FONT.jakarta,
                    lineHeight: 1.4,
                  }}
                >
                  {scheduleKindLabel(date)} · {formatHoursRangeLabel(dayHours)}
                </p>
                {timeRange ? (
                  <TimeDialPicker
                    value={time}
                    onChange={setTime}
                    range={timeRange}
                    peaks={reservationPeaks}
                    reduceMotion={reduceMotion}
                  />
                ) : (
                  <div
                    style={{
                      borderRadius: 12,
                      border: `1px dashed ${t.border}`,
                      background: t.bgSurfaceMuted,
                      padding: '16px 14px',
                      fontSize: 13,
                      color: t.textMuted,
                      fontFamily: MODAL_FONT.jakarta,
                      lineHeight: 1.5,
                      textAlign: 'center',
                    }}
                  >
                    Closed on this day — pick another date to set a time.
                  </div>
                )}
              </motion.div>

              <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                <span style={sectionLabel}>Table</span>
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  onFocus={() => setFocusedField('table')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Optional"
                  style={{
                    ...inp,
                    ...fieldFocus('table'),
                    padding: '11px 14px',
                  }}
                />
              </motion.div>

              {isEdit && (
                <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                  <span style={sectionLabel}>Status</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {STATUS_OPTIONS.map((statusKey) => {
                      const pal = statusColor(statusKey)
                      const active = editStatus === statusKey
                      const label =
                        statusKey === 'no-show'
                          ? 'No-show'
                          : statusKey.charAt(0).toUpperCase() + statusKey.slice(1)
                      return (
                        <motion.button
                          key={statusKey}
                          type="button"
                          onClick={() => setEditStatus(statusKey)}
                          whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '5px 9px',
                            borderRadius: 999,
                            border: `1px solid ${active ? pal.border : t.border}`,
                            background: active ? pal.bg : t.bgSurfaceMuted,
                            color: active ? pal.text : t.textMuted,
                            cursor: 'pointer',
                            fontFamily: MODAL_FONT.jakarta,
                            fontSize: 10,
                            fontWeight: active ? 700 : 500,
                            boxShadow: active ? t.accentGlow : 'none',
                          }}
                        >
                          <span style={{ fontSize: 13, lineHeight: 1 }}>{STATUS_ICONS[statusKey]}</span>
                          {label}
                        </motion.button>
                      )
                    })}
                  </div>
                </motion.div>
              )}

              <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                <span style={sectionLabel}>Notes</span>
                <textarea
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  onFocus={() => setFocusedField('notes')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Dietary, occasion, seating…"
                  rows={2}
                  style={{
                    ...inp,
                    ...fieldFocus('notes'),
                    padding: '10px 14px',
                    resize: 'vertical',
                    minHeight: 64,
                    lineHeight: 1.5,
                  }}
                />
              </motion.div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: t.dangerBg,
                    border: `1px solid ${t.dangerBorder}`,
                    color: t.danger,
                    fontSize: 12,
                  }}
                >
                  {error}
                </motion.div>
              )}
            </motion.div>
          )}
        </div>

        <div
          style={{
            padding: '12px 18px 14px',
            borderTop: `1px solid ${t.border}`,
            background: t.bgSurfaceMuted,
            flexShrink: 0,
          }}
        >
          <motion.button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || hydrating}
            whileHover={saving || hydrating || reduceMotion ? undefined : { scale: 1.01 }}
            whileTap={saving || hydrating || reduceMotion ? undefined : { scale: 0.98 }}
            style={{
              width: '100%',
              height: 44,
              border: 'none',
              borderRadius: 10,
              background: saving || hydrating ? t.bgSubtle : t.accent,
              color: saving || hydrating ? t.textSubtle : '#0f172a',
              fontWeight: 600,
              fontSize: 14,
              cursor: saving || hydrating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontFamily: MODAL_FONT.jakarta,
              boxShadow: saving || hydrating ? 'none' : t.shadowGlow,
            }}
          >
            {saving ? (
              <>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.75, ease: 'linear' }}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: '2px solid rgba(15,23,42,0.15)',
                    borderTopColor: '#0f172a',
                    display: 'inline-block',
                  }}
                />
                {isEdit ? 'Saving…' : 'Confirming…'}
              </>
            ) : isEdit ? (
              'Save changes'
            ) : (
              'Confirm booking'
            )}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Guest Profile Drawer ─────────────────────────────────────────────────────


type GuestProfile = {
  id: string
  name: string
  email: string | null
  phone: string | null
  tags: string[] | null
  total_bookings: number | null
  last_visit: string | null
}

function nameHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

function GuestProfileDrawer({
  customerId,
  guestName,
  onClose,
}: {
  customerId: string
  guestName: string
  onClose: () => void
}) {
  const [profile, setProfile] = useState<GuestProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const { data } = await supabase
        .from('customers')
        .select('id, name, email, phone, tags, total_bookings, last_visit')
        .eq('id', customerId)
        .maybeSingle()
      setProfile(data as GuestProfile | null)
      setLoading(false)
    })()
  }, [customerId])

  const hue = nameHue(guestName)
  const initials = guestName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  const TAG_COLORS: Record<string, { bg: string; color: string }> = {
    VIP:      { bg: 'rgba(250,204,21,0.12)',  color: '#fbbf24' },
    Regular:  { bg: 'rgba(56,189,248,0.12)',  color: '#38bdf8' },
    New:      { bg: 'rgba(74,222,128,0.12)',  color: '#4ade80' },
    'At Risk':{ bg: 'rgba(248,113,113,0.12)', color: '#f87171' },
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      {/* Drawer */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
          width: 340,
          background: 'var(--t-glass-bg)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          borderLeft: `1px solid ${t.border}`,
          boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${t.borderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Guest Profile</span>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 16 }}
          >
            ×
          </button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: t.textMuted, fontSize: 13 }}>
            Loading…
          </div>
        ) : (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Avatar + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                background: `linear-gradient(135deg, hsl(${hue} 60% 65%), hsl(${(hue + 35) % 360} 50% 42%))`,
                display: 'grid', placeItems: 'center',
                fontSize: 18, fontWeight: 700, color: '#fff',
                boxShadow: `0 0 0 3px rgba(${hue},${hue},255,0.15)`,
              }}>
                {initials}
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: t.text }}>{profile?.name ?? guestName}</div>
                {profile?.tags && profile.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {profile.tags.map((tag) => {
                      const tc = TAG_COLORS[tag] ?? { bg: t.bgSurfaceMuted, color: t.textMuted }
                      return (
                        <span key={tag} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: tc.bg, color: tc.color }}>
                          {tag}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Contact */}
            <div style={{ background: t.bgSurfaceMuted, borderRadius: 12, border: `1px solid ${t.borderSoft}`, overflow: 'hidden' }}>
              {[
                { label: 'Phone', value: profile?.phone || '—' },
                { label: 'Email', value: profile?.email || '—' },
              ].map(({ label, value }, i, arr) => (
                <div key={label} style={{ padding: '12px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${t.borderSoft}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 500, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 13, color: t.text, fontWeight: 600, textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Total visits', value: String(profile?.total_bookings ?? 0) },
                { label: 'Last visit', value: profile?.last_visit ? new Date(profile.last_visit).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: t.bgSurfaceMuted, borderRadius: 10, border: `1px solid ${t.borderSoft}`, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: t.text }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BookingsPage() {
  const [monthOffset, setMonthOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [rightTab, setRightTab] = useState<'day' | 'week' | 'all'>('day')
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editReservation, setEditReservation] = useState<Reservation | null>(null)
  const [prefilledDate, setPrefilledDate] = useState<string | undefined>(undefined)
  const [guestDrawer, setGuestDrawer] = useState<{ customerId: string; guestName: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'pending' | 'cancelled'>('all')
  const [calendarView, setCalendarView] = useState<'month' | 'day'>('month')
  const [operatingHours, setOperatingHours] = useState<OperatingHours>(DEFAULT_OPERATING_HOURS)
  const [tableVisibleCount, setTableVisibleCount] = useState(10)
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(DEFAULT_ADVANCED_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [mobileCalendarView, setMobileCalendarView] = useState<'month' | 'day'>('month')
  const reduceMotion = useReducedMotion()
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const filtersRef = useRef<HTMLDivElement>(null)
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [today] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), n.getDate())
  })
  const displayMonth = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + monthOffset, 1),
    [today, monthOffset],
  )
  const loadMonthYear = displayMonth.getFullYear()
  const loadMonthIndex = displayMonth.getMonth()
  const monthLabel = displayMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const effectiveDay = selectedDay ?? today
  const effectiveDayIso = useMemo(
    () => toDateIso(effectiveDay),
    [selectedDay, today],
  )

  const dayHours = useMemo(
    () => getDayHoursForDate(operatingHours, effectiveDayIso),
    [operatingHours, effectiveDayIso],
  )
  const timeRange = useMemo(
    () => timelineRangeFromDayHours(dayHours),
    [dayHours],
  )
  const dayPeaks = useMemo(
    () => (timeRange ? peaksForDate(effectiveDayIso, timeRange) : []),
    [effectiveDayIso, timeRange],
  )

  const dayPanelReservations = useMemo(
    () => reservations.filter((r) => isSameDay(r.scheduledAt, effectiveDay)),
    [reservations, effectiveDayIso],
  )

  function navigateDayOffset(offset: number) {
    const next = new Date(effectiveDay)
    next.setDate(next.getDate() + offset)
    setSelectedDay(next)
    setTableVisibleCount(10)
    const monthDiff =
      (next.getFullYear() - today.getFullYear()) * 12 +
      (next.getMonth() - today.getMonth())
    setMonthOffset(monthDiff)
  }

  // ─── Load data ─────────────────────────────────────────────────────────────
  const [loadError, setLoadError] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)

  const fetchReservations = useCallback(
    async (isCancelled: () => boolean, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false
      const {
        data: { user: userFromGet },
      } = await supabase.auth.getUser()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const user = userFromGet ?? session?.user ?? null

      if (!user) {
        if (!isCancelled()) {
          setReservations([])
          setBusinessId(null)
          if (!silent) setLoading(false)
        }
        return
      }

      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!business?.id) {
        if (!isCancelled()) {
          setReservations([])
          setBusinessId(null)
          if (!silent) setLoading(false)
        }
        return
      }

      if (!isCancelled()) {
        setBusinessId((prev) => (prev === business.id ? prev : business.id))
      }

      const p2 = (n: number) => String(n).padStart(2, '0')
      const startStr = `${loadMonthYear}-${p2(loadMonthIndex + 1)}-01T00:00:00`
      const endDate = new Date(loadMonthYear, loadMonthIndex + 1, 1)
      const endStr = `${endDate.getFullYear()}-${p2(endDate.getMonth() + 1)}-01T00:00:00`

      const { data: rows, error } = await supabase
        .from('appointments')
        .select('id, service_name, scheduled_at, status, customer_id, conversation_id, notes')
        .eq('business_id', business.id)
        .gte('scheduled_at', startStr)
        .lt('scheduled_at', endStr)
        .order('scheduled_at', { ascending: true })

      if (isCancelled()) return

      if (error) {
        if (!isCancelled()) {
          setReservations([])
          setLoadError("We couldn't load reservations.")
          if (!silent) setLoading(false)
        }
        return
      }

      if (!rows) {
        if (!isCancelled()) {
          setReservations([])
          if (!silent) setLoading(false)
        }
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

      if (!isCancelled()) {
        const next = typed.map((r) =>
          parseReservation(r, r.customer_id ? nameById.get(r.customer_id) : undefined),
        )
        setReservations((prev) => {
          if (
            prev.length === next.length &&
            prev.every(
              (r, i) =>
                r.id === next[i].id &&
                r.status === next[i].status &&
                r.scheduledAt.getTime() === next[i].scheduledAt.getTime(),
            )
          ) {
            return prev
          }
          return next
        })
        if (!silent) setLoading(false)
      }
    },
    [loadMonthYear, loadMonthIndex],
  )

  const fetchReservationsRef = useRef(fetchReservations)
  fetchReservationsRef.current = fetchReservations

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset loading + error on month change before async refetch
    setLoading(true)
    setLoadError(null)
    void fetchReservationsRef.current(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [loadMonthYear, loadMonthIndex])

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        setLoading(true)
        void fetchReservationsRef.current(() => false)
      }
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!businessId) return
    const channel = supabase
      .channel(`appointments:${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
          realtimeDebounceRef.current = setTimeout(() => {
            void fetchReservationsRef.current(() => false, { silent: true })
          }, 500)
        },
      )
      .subscribe()
    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current)
      void supabase.removeChannel(channel)
    }
  }, [businessId])

  useEffect(() => {
    if (!filtersOpen) return
    function onDocClick(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setFiltersOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [filtersOpen])

  useEffect(() => {
    if (!businessId) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('businesses')
        .select('operating_hours')
        .eq('id', businessId)
        .maybeSingle()
      if (!cancelled && data) {
        setOperatingHours(
          parseOperatingHours((data as { operating_hours?: unknown }).operating_hours),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [businessId])

  // ─── Helpers ───────────────────────────────────────────────────────────────
  async function rescheduleReservation(id: string, dateIso: string, time: string) {
    if (!timeRange) {
      setUpdateError('Restaurant is closed on this day.')
      return
    }
    const slots = buildTimeSlots(timeRange)
    const snapped = snapToGrid(timeToTimelineMinutes(time, timeRange), timeRange, slots)
    const wallClock = toWallClock(dateIso, snapped)
    const nextAt = new Date(wallClock)
    const previous = reservations
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, scheduledAt: nextAt } : r)),
    )
    setUpdateError(null)
    const { error } = await supabase
      .from('appointments')
      .update({ scheduled_at: wallClock })
      .eq('id', id)
    if (error) {
      setReservations(previous)
      setUpdateError("Couldn't reschedule. Please try again.")
    }
  }

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

  const pendingBadgeCount = useMemo(
    () => reservations.filter((r) => r.status === 'pending').length,
    [reservations],
  )

  const bookingKpi = useMemo(
    () =>
      computeBookingKpi(reservations, {
        selectedDay,
        monthOffset,
        today,
        displayMonth,
      }),
    [reservations, selectedDay, monthOffset, today, displayMonth],
  )

  const monthScopedReservations = useMemo(
    () => reservations.filter((r) => isInDisplayMonth(r.scheduledAt, displayMonth)),
    [reservations, displayMonth],
  )

  const tableScopeReservations = useMemo(() => {
    const base = selectedDay
      ? reservations.filter((r) => isSameDay(r.scheduledAt, selectedDay))
      : monthScopedReservations
    let list = base
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.status === (statusFilter as ResStatus))
    }
    return applyAdvancedFilters(list, advancedFilters)
  }, [reservations, selectedDay, monthScopedReservations, statusFilter, advancedFilters])

  const tableListTitle = useMemo(() => {
    const count = tableScopeReservations.length
    const noun = count === 1 ? 'reservation' : 'reservations'
    if (selectedDay) {
      const label = selectedDay.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      return `${label} · ${count} ${noun}`
    }
    return `All in ${monthLabel} · ${count} ${noun}`
  }, [selectedDay, tableScopeReservations.length, monthLabel])

  // ─── Right panel reservations ───────────────────────────────────────────────
  const rightReservations = useMemo(() => {
    if (rightTab === 'day') return reservations.filter((r) => isSameDay(r.scheduledAt, effectiveDay))
    if (rightTab === 'week') {
      const ws = startOfWeekMon(today)
      const we = new Date(ws)
      we.setDate(we.getDate() + 7)
      return reservations.filter((r) => r.scheduledAt >= ws && r.scheduledAt < we)
    }
    return reservations
  }, [reservations, rightTab, effectiveDay]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredTableReservations = useMemo(() => {
    if (!searchQuery.trim()) return tableScopeReservations
    const q = searchQuery.toLowerCase()
    return tableScopeReservations.filter(
      (r) =>
        r.guestName.toLowerCase().includes(q) ||
        (r.specialRequests ?? '').toLowerCase().includes(q),
    )
  }, [tableScopeReservations, searchQuery])

  const tableSearchHint =
    searchQuery.trim() && filteredTableReservations.length !== tableScopeReservations.length
      ? `Showing ${filteredTableReservations.length} of ${tableScopeReservations.length}`
      : filteredTableReservations.length > 0
        ? `${filteredTableReservations.length} shown`
        : null

  function focusRightPanel() {
    rightPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  function handleViewAllCancelled() {
    setStatusFilter('cancelled')
    setSelectedDay(null)
    setTableVisibleCount(10)
    focusRightPanel()
  }

  function handleBellClick() {
    setStatusFilter('pending')
    setTableVisibleCount(10)
    focusRightPanel()
  }

  function handleShowAllMonth() {
    setSelectedDay(null)
    setTableVisibleCount(10)
  }

  const lightStatusColors: Record<ResStatus, { bg: string; color: string }> = {
    confirmed: { bg: '#dcfce7', color: '#16a34a' },
    seated:    { bg: '#dbeafe', color: '#2563eb' },
    pending:   { bg: '#fef3c7', color: '#d97706' },
    cancelled: { bg: '#fee2e2', color: '#dc2626' },
    'no-show': { bg: '#f1f5f9', color: '#64748b' },
  }

  const showModal = showAddModal || editReservation !== null

  const visibleTableRows = filteredTableReservations.slice(0, tableVisibleCount)

  function renderDesktopTableRow(r: Reservation) {
    const isNext = r.id === bookingKpi.nextUpcomingId
    const sc = lightStatusColors[r.status]
    const location =
      r.tableNumber !== '—' ? `Table ${r.tableNumber}` : r.specialRequests || 'Main Dining'
    return (
      <tr
        key={r.id}
        style={{
          borderBottom: '1px solid #f1f5f9',
          borderLeft: `3px solid ${isNext ? '#6366f1' : 'transparent'}`,
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#f8fafc'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' as const }}>
          <span style={{ fontSize: bk.body, fontWeight: 700, color: '#0f172a' }}>
            {fmtTime(r.scheduledAt)}
          </span>
        </td>
        <td style={{ padding: '7px 10px', maxWidth: 0 }}>
          <div
            style={{
              fontSize: bk.body,
              fontWeight: 700,
              color: '#0f172a',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {r.customerId ? (
              <span
                style={{ cursor: 'pointer', borderBottom: '1px dashed #cbd5e1' }}
                onClick={() =>
                  setGuestDrawer({ customerId: r.customerId!, guestName: r.guestName })
                }
              >
                {r.guestName}
              </span>
            ) : (
              r.guestName
            )}
          </div>
          <div
            style={{
              fontSize: bk.micro,
              color: '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
              marginTop: 1,
            }}
          >
            {r.partySize} {r.partySize === 1 ? 'guest' : 'guests'} · {location}
          </div>
        </td>
        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' as const }}>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 6px',
              borderRadius: 999,
              background: sc.bg,
              color: sc.color,
              fontSize: 9,
              fontWeight: 700,
              whiteSpace: 'nowrap' as const,
            }}
          >
            {r.status === 'no-show' ? 'No-show' : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
          </span>
        </td>
        <td style={{ padding: '7px 10px' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
            {r.status === 'pending' && (
              <button
                type="button"
                title="Confirm"
                onClick={() => void updateStatus(r.id, 'confirmed')}
                style={{
                  padding: '3px 6px',
                  borderRadius: 5,
                  border: '1px solid #bbf7d0',
                  background: '#f0fdf4',
                  color: '#16a34a',
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✓
              </button>
            )}
            {r.status === 'confirmed' && (
              <button
                type="button"
                title="Cancel"
                onClick={() => void updateStatus(r.id, 'cancelled')}
                style={{
                  padding: '3px 6px',
                  borderRadius: 5,
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: '#dc2626',
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            )}
            <button
              type="button"
              title="More actions"
              onClick={() => setEditReservation(r)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                border: bk.border,
                background: '#ffffff',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="12" height="3" viewBox="0 0 12 3" fill="none">
                <circle cx="1.5" cy="1.5" r="1.2" fill="#94a3b8" />
                <circle cx="6" cy="1.5" r="1.2" fill="#94a3b8" />
                <circle cx="10.5" cy="1.5" r="1.2" fill="#94a3b8" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    )
  }

  const desktopTableBody = useMemo(() => {
    if (selectedDay) {
      return visibleTableRows.map((r) => renderDesktopTableRow(r))
    }
    const groups = new Map<string, Reservation[]>()
    for (const r of visibleTableRows) {
      const iso = toDateIso(r.scheduledAt)
      const g = groups.get(iso) ?? []
      g.push(r)
      groups.set(iso, g)
    }
    const nodes: ReactNode[] = []
    for (const [iso, items] of groups) {
      const d = new Date(`${iso}T12:00:00`)
      nodes.push(
        <tr key={`hdr-${iso}`}>
          <td
            colSpan={4}
            style={{
              padding: '8px 10px',
              background: '#fafafa',
              fontSize: bk.caption,
              fontWeight: 700,
              color: '#64748b',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            {d.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </td>
        </tr>,
      )
      for (const r of items) nodes.push(renderDesktopTableRow(r))
    }
    return nodes
  }, [
    selectedDay,
    visibleTableRows,
    bookingKpi.nextUpcomingId,
    lightStatusColors,
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDaySelect(d: Date) {
    setSelectedDay((prev) => {
      if (prev && isSameDay(prev, d)) return prev
      return d
    })
    setRightTab('day')
    setTableVisibleCount(10)
  }

  function handleAddForDay() {
    setPrefilledDate(effectiveDayIso)
    setShowAddModal(true)
  }

  function setCalendarViewDay() {
    setCalendarView('day')
    if (!selectedDay) setSelectedDay(effectiveDay)
  }

  const calendarToggleBtn = (active: boolean): CSSProperties => ({
    padding: '5px 12px',
    borderRadius: bk.radiusSm,
    border: active ? 'none' : bk.border,
    background: active ? '#0f172a' : '#ffffff',
    color: active ? '#ffffff' : '#64748b',
    fontSize: bk.caption,
    fontWeight: 600,
    cursor: 'pointer',
  })

  const RIGHT_TABS = [
    { key: 'day' as const, label: effectiveDay.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) },
    { key: 'week' as const, label: 'This week' },
    { key: 'all' as const, label: 'All' },
  ]

  const segTab = (active: boolean) => ({
    padding: '6px 12px', borderRadius: 7, border: 'none',
    background: active ? t.bgSurface : 'transparent',
    color: active ? t.text : t.textMuted,
    fontSize: 12, fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    boxShadow: active ? t.shadowSm : 'none',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  })

  const navPill = {
    width: 28, height: 28, borderRadius: 7,
    border: `1px solid ${t.borderSoft}`,
    background: t.bgSurface,
    color: t.text, fontSize: 14, cursor: 'pointer',
    display: 'grid', placeItems: 'center',
  }

  const statRows = useMemo(() => {
    if (bookingKpi.scope === 'day') {
      return [
        { label: 'Guests', value: loading ? '—' : String(bookingKpi.covers), hi: false },
        { label: 'Total', value: loading ? '—' : String(bookingKpi.totalCount), hi: false },
        {
          label: 'Awaiting',
          value: loading ? '—' : String(bookingKpi.pendingCount),
          hi: !loading && bookingKpi.pendingCount > 0,
        },
      ]
    }
    const weekStart = startOfWeekMon(today)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekCount = reservations.filter(
      (r) =>
        r.scheduledAt >= weekStart &&
        r.scheduledAt < weekEnd &&
        r.status !== 'cancelled',
    ).length
    return [
      {
        label: bookingKpi.scope === 'month' ? 'Month guests' : 'Guests today',
        value: loading ? '—' : String(bookingKpi.covers),
        hi: false,
      },
      { label: 'This week', value: loading ? '—' : String(weekCount), hi: false },
      {
        label: 'Awaiting',
        value: loading ? '—' : String(bookingKpi.pendingCount),
        hi: !loading && bookingKpi.pendingCount > 0,
      },
    ]
  }, [bookingKpi, loading, reservations, today])

  return (
    <>
      <DashboardOceanNav activeNav="Bookings" flatBackground="#f8fafc">
        {({ isMobile, openNav }) => (
          <main style={{
            background: '#f8fafc',
            minHeight: '100vh',
            margin: isMobile ? '-20px -16px' : '-36px',
            padding: isMobile ? bk.pagePadMobile : bk.pagePad,
          }}>

            {/* Mobile hamburger */}
            {isMobile && (
              <motion.button
                type="button"
                onClick={openNav}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                style={{ marginBottom: 16, width: 44, height: 44, borderRadius: 12, border: `1px solid ${t.border}`, background: t.bgSurface, color: t.text, fontSize: 22, cursor: 'pointer', boxShadow: t.shadowSm }}
              >
                ☰
              </motion.button>
            )}

            {/* ── HEADER ── */}
            {isMobile ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={oceanTransition(reduceMotion, { duration: 0.22 })}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}
              >
                <div>
                  <h1 style={{ margin: 0, color: t.text, fontSize: bk.h1Mobile, fontWeight: 700, fontFamily: 'var(--font-playfair)', letterSpacing: '-0.03em' }}>
                    Reservations
                  </h1>
                  <p style={{ margin: '4px 0 0', color: t.textMuted, fontSize: 13 }}>
                    {monthLabel}
                  </p>
                </div>
                <motion.button
                  type="button"
                  whileHover={reduceMotion ? undefined : { y: -1 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                  onClick={() => setShowAddModal(true)}
                  style={{ border: 'none', borderRadius: 8, padding: '9px 16px', background: t.accent, color: '#ffffff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  + New
                </motion.button>
              </motion.div>
            ) : (
              /* ── Desktop top bar ── */
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 14, fontFamily: bk.font, flexWrap: 'wrap' as const }}>
                <h1 style={{ margin: 0, fontSize: bk.h1, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', whiteSpace: 'nowrap' as const, marginRight: 6 }}>
                  Reservations
                </h1>

                {/* Date navigator */}
                <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: bk.border, borderRadius: bk.radiusSm, overflow: 'hidden' }}>
                  <button type="button" onClick={() => navigateDayOffset(-1)} style={{ width: 30, height: bk.controlH, border: 'none', borderRight: '1px solid #e2e8f0', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 15, display: 'grid', placeItems: 'center' }}>‹</button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="1" y="2.5" width="12" height="10" rx="1.5" stroke="#94a3b8" strokeWidth="1.2"/>
                      <path d="M1 5.5h12" stroke="#94a3b8" strokeWidth="1.2"/>
                      <path d="M4.5 1v2M9.5 1v2" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                    <span style={{ fontSize: bk.body, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' as const }}>
                      {effectiveDay.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <button type="button" onClick={() => navigateDayOffset(1)} style={{ width: 30, height: bk.controlH, border: 'none', borderLeft: '1px solid #e2e8f0', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 15, display: 'grid', placeItems: 'center' }}>›</button>
                </div>

                {/* Today pill */}
                <button type="button" onClick={() => { setSelectedDay(today); setMonthOffset(0) }} style={{ padding: '6px 12px', background: '#ffffff', border: bk.border, borderRadius: bk.radiusSm, fontSize: bk.body, fontWeight: 500, color: '#0f172a', cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                  Today
                </button>

                <div style={{ flex: 1 }} />

                {/* Search */}
                <div style={{ position: 'relative' as const, flex: '0 1 300px', minWidth: 180 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute' as const, left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' as const }}>
                    <circle cx="6" cy="6" r="4.5" stroke="#94a3b8" strokeWidth="1.2"/>
                    <path d="M9.5 9.5L12 12" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  <input
                    type="search"
                    placeholder="Search by guest name, phone or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px 6px 28px', background: '#ffffff', border: bk.border, borderRadius: bk.radiusSm, fontSize: bk.body, color: '#0f172a', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' }}
                  />
                </div>

                {/* Filters */}
                <div ref={filtersRef} style={{ position: 'relative' as const }}>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen((o) => !o)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#ffffff', border: bk.border, borderRadius: bk.radiusSm, fontSize: bk.body, fontWeight: 500, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' as const }}
                  >
                    <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                      <path d="M1 1.5h12M3 5h8M5 8.5h4" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                    Filters
                    {advancedFiltersActive(advancedFilters) && (
                      <span style={{ minWidth: 16, height: 16, borderRadius: 8, background: '#6366f1', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>!</span>
                    )}
                  </button>
                  {filtersOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        right: 0,
                        zIndex: 40,
                        width: 240,
                        padding: 12,
                        background: '#ffffff',
                        border: bk.border,
                        borderRadius: bk.radiusSm,
                        boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
                        display: 'grid',
                        gap: 10,
                      }}
                    >
                      <div style={{ fontSize: bk.micro, color: '#94a3b8' }}>Filters apply to loaded month</div>
                      <label style={{ display: 'grid', gap: 4, fontSize: bk.caption, color: '#374151' }}>
                        Min party size
                        <select
                          value={advancedFilters.minPartySize ?? ''}
                          onChange={(e) => {
                            const v = e.target.value
                            setAdvancedFilters((f) => ({
                              ...f,
                              minPartySize: v === '' ? null : Number(v),
                            }))
                            setTableVisibleCount(10)
                          }}
                          style={{ padding: '6px 8px', border: bk.border, borderRadius: 6, fontSize: bk.body }}
                        >
                          <option value="">Any</option>
                          {[2, 4, 6, 8, 10].map((n) => (
                            <option key={n} value={n}>{n}+ guests</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: 'grid', gap: 4, fontSize: bk.caption, color: '#374151' }}>
                        Source
                        <select
                          value={advancedFilters.source}
                          onChange={(e) => {
                            setAdvancedFilters((f) => ({
                              ...f,
                              source: e.target.value as AdvancedFilters['source'],
                            }))
                            setTableVisibleCount(10)
                          }}
                          style={{ padding: '6px 8px', border: bk.border, borderRadius: 6, fontSize: bk.body }}
                        >
                          <option value="all">All</option>
                          <option value="chat">With chat</option>
                          <option value="manual">Manual</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setAdvancedFilters(DEFAULT_ADVANCED_FILTERS)
                          setTableVisibleCount(10)
                        }}
                        style={{ padding: '6px 10px', border: bk.border, borderRadius: 6, background: '#fff', fontSize: bk.caption, cursor: 'pointer', color: '#64748b' }}
                      >
                        Reset filters
                      </button>
                    </div>
                  )}
                </div>

                {/* + New Reservation */}
                <button type="button" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: '#0f172a', border: 'none', borderRadius: bk.radiusSm, fontSize: bk.body, fontWeight: 600, color: '#ffffff', cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
                  New Reservation
                </button>

                {/* Notification bell — pending count */}
                <div style={{ position: 'relative' as const, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={handleBellClick}
                    title="Show pending reservations"
                    style={{ width: bk.controlH, height: bk.controlH, borderRadius: '50%', border: bk.border, background: '#ffffff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                  >
                    <svg width="16" height="17" viewBox="0 0 16 17" fill="none">
                      <path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6v3.25L2 11v.75h12V11l-1.5-1.75V6C12.5 3.515 10.485 1.5 8 1.5z" stroke="#374151" strokeWidth="1.2" strokeLinejoin="round"/>
                      <path d="M6.5 12.25a1.5 1.5 0 0 0 3 0" stroke="#374151" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </button>
                  {!loading && pendingBadgeCount > 0 && (
                    <span style={{ position: 'absolute' as const, top: -1, right: -1, minWidth: 16, height: 16, borderRadius: 8, background: '#6366f1', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '2px solid #f8fafc' }}>
                      {pendingBadgeCount > 9 ? '9+' : pendingBadgeCount}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── ERRORS ── */}
            {(loadError || updateError) && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ borderRadius: 10, border: `1px solid ${t.dangerBorder}`, background: t.dangerBg, color: t.danger, padding: '12px 16px', fontSize: 13, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}
              >
                <span>{loadError ?? updateError}</span>
                <button type="button" onClick={() => { setLoadError(null); setUpdateError(null) }} style={{ border: 'none', background: 'transparent', color: t.danger, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  Dismiss
                </button>
              </motion.div>
            )}

            {isMobile ? (
              /* ── MOBILE ────────────────────────────────────────────────── */
              <div style={{ display: 'grid', gap: 14 }}>
                {/* Stats */}
                <div style={{ ...glass, overflow: 'hidden' }}>
                  {statRows.map(({ label, value, hi }, i, arr) => (
                    <div key={label} style={{ padding: '14px 18px', borderBottom: i < arr.length - 1 ? `1px solid ${t.borderSoft}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: 22, fontWeight: 700, color: hi ? t.warning : t.text, letterSpacing: '-0.02em' }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Month nav */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
                  <button type="button" onClick={() => setMonthOffset((o) => o - 1)} style={{ ...navPill, width: 32, height: 32, fontSize: 16, borderRadius: 8 }}>←</button>
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{monthLabel}</span>
                  <button type="button" onClick={() => setMonthOffset((o) => o + 1)} style={{ ...navPill, width: 32, height: 32, fontSize: 16, borderRadius: 8 }}>→</button>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setMobileCalendarView('month')}
                    style={calendarToggleBtn(mobileCalendarView === 'month')}
                  >
                    Month
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileCalendarView('day')
                      if (!selectedDay) setSelectedDay(effectiveDay)
                    }}
                    style={calendarToggleBtn(mobileCalendarView === 'day')}
                  >
                    Day
                  </button>
                </div>

                {mobileCalendarView === 'month' ? (
                  <>
                    <MonthCalendar
                      displayMonth={displayMonth}
                      reservations={reservations}
                      selectedDay={selectedDay}
                      onSelectDay={handleDaySelect}
                      today={today}
                      operatingHours={operatingHours}
                    />
                    <BookingsDayChips
                      date={effectiveDay}
                      reservations={dayPanelReservations}
                      loading={loading}
                      statusColors={lightStatusColors}
                      onEdit={(r) => setEditReservation(r)}
                      onAdd={handleAddForDay}
                    />
                    {!loading && dayPanelReservations.length === 0 && selectedDay && (
                      <BookingsDayEmptyStrip date={effectiveDay} onAdd={handleAddForDay} />
                    )}
                  </>
                ) : (
                  <div style={{ maxHeight: 360, overflow: 'auto' }}>
                    <BookingsDayTimeline
                      date={effectiveDay}
                      reservations={reservations}
                      range={timeRange}
                      peaks={dayPeaks}
                      loading={loading}
                      reduceMotion={reduceMotion}
                      onReschedule={(id, newTime) => void rescheduleReservation(id, effectiveDayIso, newTime)}
                      onEdit={(r) => setEditReservation(r)}
                      onAdd={handleAddForDay}
                    />
                  </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', padding: 3, borderRadius: 9, background: t.bgSurfaceMuted, border: `1px solid ${t.borderSoft}`, gap: 2 }}>
                  {RIGHT_TABS.map(({ key, label }) => (
                    <button key={key} type="button" onClick={() => setRightTab(key)} style={segTab(rightTab === key)}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* List */}
                <ReservationListView
                  reservations={rightReservations}
                  loading={loading}
                  onConfirm={(id) => void updateStatus(id, 'confirmed')}
                  onCancel={(id) => void updateStatus(id, 'cancelled')}
                  onDelete={(id) => void deleteReservation(id)}
                  onEdit={(r) => setEditReservation(r)}
                  isMobile={true}
                  onGuestClick={(cid, name) => setGuestDrawer({ customerId: cid, guestName: name })}
                />
              </div>
            ) : (
              /* ── DESKTOP ── */
              <>
              {/* ── STAT CARDS ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: bk.gapMd, marginBottom: 12, fontFamily: bk.font }}>
                {/* Card 1 — context label */}
                <div style={{ ...bkCard, padding: bk.cardPad }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: bk.caption, fontWeight: 600, color: '#64748b' }}>{bookingKpi.card1Label}</span>
                    <div style={{ width: 28, height: 28, borderRadius: bk.radiusSm, background: '#ede9fe', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
                        <rect x="2" y="3.5" width="14" height="12" rx="2" stroke="#7c3aed" strokeWidth="1.4"/>
                        <path d="M2 7.5h14" stroke="#7c3aed" strokeWidth="1.4"/>
                        <path d="M6 2v2M12 2v2" stroke="#7c3aed" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                    </div>
                  </div>
                  <div style={{ fontSize: bk.statValue, fontWeight: 700, color: '#0f172a', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 2 }}>
                    {loading ? '—' : bookingKpi.totalCount}
                  </div>
                  <div style={{ fontSize: bk.caption, color: '#94a3b8', marginBottom: 6 }}>reservations</div>
                  <div style={{ fontSize: bk.caption, fontWeight: 600, color: '#64748b' }}>{loading ? '—' : bookingKpi.subtitle1}</div>
                </div>

                {/* Upcoming */}
                <div style={{ ...bkCard, padding: bk.cardPad }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: bk.caption, fontWeight: 600, color: '#64748b' }}>Upcoming</span>
                    <div style={{ width: 28, height: 28, borderRadius: bk.radiusSm, background: '#dbeafe', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="9" r="7" stroke="#2563eb" strokeWidth="1.4"/>
                        <path d="M9 5.5V9l2.5 2" stroke="#2563eb" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                  <div style={{ fontSize: bk.statValue, fontWeight: 700, color: '#0f172a', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 2 }}>
                    {loading ? '—' : bookingKpi.upcomingCount}
                  </div>
                  <div style={{ fontSize: bk.caption, color: '#94a3b8', marginBottom: 6 }}>reservations</div>
                  <div style={{ fontSize: bk.caption, fontWeight: 600, color: '#2563eb' }}>
                    {loading ? '—' : bookingKpi.subtitle2}
                  </div>
                </div>

                {/* Confirmed */}
                <div style={{ ...bkCard, padding: bk.cardPad }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: bk.caption, fontWeight: 600, color: '#64748b' }}>Confirmed</span>
                    <div style={{ width: 28, height: 28, borderRadius: bk.radiusSm, background: '#dcfce7', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="9" r="7" stroke="#16a34a" strokeWidth="1.4"/>
                        <path d="M6 9l2 2 4-4" stroke="#16a34a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                  <div style={{ fontSize: bk.statValue, fontWeight: 700, color: '#0f172a', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 2 }}>
                    {loading ? '—' : bookingKpi.confirmedCount}
                  </div>
                  <div style={{ fontSize: bk.caption, color: '#94a3b8', marginBottom: 6 }}>reservations</div>
                  <div>
                    <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                      <div style={{ height: '100%', width: `${loading ? 0 : bookingKpi.confirmedPct}%`, background: '#16a34a', borderRadius: 2, transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ fontSize: bk.micro, color: '#64748b' }}>
                      {loading ? '—' : `${bookingKpi.confirmedPct}%`} of {bookingKpi.scope === 'day' ? 'day' : bookingKpi.scope === 'month' ? 'month' : 'today'}
                    </div>
                  </div>
                </div>

                {/* Cancelled */}
                <div style={{ ...bkCard, padding: bk.cardPad }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: bk.caption, fontWeight: 600, color: '#64748b' }}>Cancelled</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={handleViewAllCancelled}
                        style={{ fontSize: bk.micro, fontWeight: 600, color: '#6366f1', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                      >
                        View all
                      </button>
                      <div style={{ width: 28, height: 28, borderRadius: bk.radiusSm, background: '#fee2e2', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
                          <circle cx="9" cy="9" r="7" stroke="#dc2626" strokeWidth="1.4"/>
                          <path d="M6.5 6.5l5 5M11.5 6.5l-5 5" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: bk.statValue, fontWeight: 700, color: '#0f172a', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 2 }}>
                    {loading ? '—' : bookingKpi.cancelledCount}
                  </div>
                  <div style={{ fontSize: bk.caption, color: '#94a3b8', marginBottom: 6 }}>reservations</div>
                  <div style={{ fontSize: bk.caption, fontWeight: 600, color: '#ef4444' }}>{loading ? '—' : bookingKpi.subtitle4}</div>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={oceanTransition(reduceMotion, { duration: 0.2 })}
                style={{ display: 'grid', gridTemplateColumns: '7fr 3fr', gap: bk.gapMd, alignItems: 'start' }}
              >
                {/* LEFT: Month overview or Day timeline */}
                <div style={{ display: 'grid', gap: bk.gap }}>
                  <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}>
                    <button
                      type="button"
                      onClick={() => setCalendarView('month')}
                      style={calendarToggleBtn(calendarView === 'month')}
                    >
                      Month
                    </button>
                    <button
                      type="button"
                      onClick={setCalendarViewDay}
                      style={calendarToggleBtn(calendarView === 'day')}
                    >
                      Day
                    </button>
                  </div>

                  {calendarView === 'month' ? (
                    <>
                      <BookingsLightCalendar
                        displayMonth={displayMonth}
                        reservations={reservations}
                        selectedDay={selectedDay}
                        onSelectDay={handleDaySelect}
                        onMonthPrev={() => setMonthOffset((o) => o - 1)}
                        onMonthNext={() => setMonthOffset((o) => o + 1)}
                        onJumpToday={() => { setMonthOffset(0); setSelectedDay(today); setTableVisibleCount(10) }}
                        onClearDay={handleShowAllMonth}
                        today={today}
                        operatingHours={operatingHours}
                        reduceMotion={reduceMotion}
                      />
                      <BookingsDayChips
                        date={effectiveDay}
                        reservations={dayPanelReservations}
                        loading={loading}
                        statusColors={lightStatusColors}
                        onEdit={(r) => setEditReservation(r)}
                        onAdd={handleAddForDay}
                      />
                      {!loading && dayPanelReservations.length === 0 && selectedDay && (
                        <BookingsDayEmptyStrip date={effectiveDay} onAdd={handleAddForDay} />
                      )}
                    </>
                  ) : (
                    <BookingsDayTimeline
                      date={effectiveDay}
                      reservations={reservations}
                      range={timeRange}
                      peaks={dayPeaks}
                      loading={loading}
                      reduceMotion={reduceMotion}
                      onReschedule={(id, newTime) => void rescheduleReservation(id, effectiveDayIso, newTime)}
                      onEdit={(r) => setEditReservation(r)}
                      onAdd={handleAddForDay}
                    />
                  )}
                </div>

                {/* RIGHT MAIN PANEL */}
                <div ref={rightPanelRef} style={{ ...bkCard, overflow: 'hidden' }}>

                  {/* Filter tabs + list scope */}
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: bk.body, fontWeight: 700, color: '#0f172a' }}>
                        {loading ? '—' : tableListTitle}
                      </span>
                      {selectedDay ? (
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={handleShowAllMonth}
                            style={{ fontSize: bk.caption, color: '#6366f1', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            All month
                          </button>
                          <button
                            type="button"
                            onClick={handleShowAllMonth}
                            style={{ fontSize: bk.caption, color: '#94a3b8', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            Clear ×
                          </button>
                        </span>
                      ) : null}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' as const }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['all', 'confirmed', 'pending', 'cancelled'] as const).map((f) => {
                          const active = statusFilter === f
                          return (
                            <button
                              key={f}
                              type="button"
                              onClick={() => { setStatusFilter(f); setTableVisibleCount(10) }}
                              style={{
                                padding: '5px 11px',
                                borderRadius: 999,
                                border: active ? 'none' : bk.border,
                                background: active ? '#0f172a' : '#ffffff',
                                color: active ? '#ffffff' : '#64748b',
                                fontSize: bk.caption,
                                fontWeight: active ? 600 : 500,
                                cursor: 'pointer',
                                transition: 'background 0.15s, color 0.15s',
                              }}
                            >
                              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                          )
                        })}
                      </div>
                      {tableSearchHint && (
                        <span style={{ fontSize: bk.micro, color: '#94a3b8', fontWeight: 500 }}>{tableSearchHint}</span>
                      )}
                    </div>
                  </div>

                  {/* Table */}
                  <>
                    <div>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#fafafa', borderBottom: '1px solid #e2e8f0' }}>
                            {(['Time', 'Guest', 'Status', ''] as const).map((col, i) => (
                              <th
                                key={i}
                                style={{
                                  padding: '7px 10px',
                                  textAlign: 'left',
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: '#94a3b8',
                                  textTransform: 'uppercase' as const,
                                  letterSpacing: '0.08em',
                                  whiteSpace: 'nowrap' as const,
                                  width: i === 0 ? 60 : i === 2 ? 72 : i === 3 ? 88 : 'auto',
                                }}
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                {[48, 100, 52, 24].map((w, c) => (
                                  <td key={c} style={{ padding: '7px 10px' }}>
                                    <div style={{ height: 11, borderRadius: 5, background: '#f1f5f9', width: w }} />
                                    {c === 1 && <div style={{ height: 9, borderRadius: 4, background: '#f8fafc', width: 72, marginTop: 5 }} />}
                                  </td>
                                ))}
                              </tr>
                            ))
                          ) : filteredTableReservations.length === 0 ? (
                            <tr>
                              <td colSpan={4} style={{ padding: '24px 10px', textAlign: 'center', color: '#94a3b8', fontSize: bk.caption }}>
                                No reservations
                              </td>
                            </tr>
                          ) : (
                            desktopTableBody
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Load more */}
                    {!loading && filteredTableReservations.length > tableVisibleCount && (
                      <div style={{ padding: '12px', borderTop: '1px solid #f1f5f9', textAlign: 'center' as const }}>
                        <button
                          type="button"
                          onClick={() => setTableVisibleCount((c) => c + 10)}
                          style={{ padding: '8px 20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#64748b', cursor: 'pointer' }}
                        >
                          Load more ↓
                        </button>
                      </div>
                    )}
                  </>
                </div>


              </motion.div>
              </>
            )}

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

      {/* ── Guest Profile Drawer ── */}
      <AnimatePresence>
        {guestDrawer && (
          <GuestProfileDrawer
            key={guestDrawer.customerId}
            customerId={guestDrawer.customerId}
            guestName={guestDrawer.guestName}
            onClose={() => setGuestDrawer(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
