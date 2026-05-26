'use client'

import { motion } from 'framer-motion'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { Reservation, ResStatus } from '@/components/reservation-card'
import { bk, bkCard } from '@/lib/bookings-compact-ui'
import { timeFromDate, toDateIso } from '@/lib/reservation-schedule'
import {
  buildTimeSlots,
  snapToGrid,
  timeToTimelineMinutes,
  timelinePercent,
  type PeakBand,
  type TimelineRange,
} from '@/lib/time-timeline'

const CARD_H = 40
const GUTTER_W = 44

const STATUS_LABEL: Record<ResStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  seated: 'Seated',
  cancelled: 'Cancelled',
  'no-show': 'No-show',
}

const STATUS_STYLE: Record<ResStatus, { bg: string; border: string; color: string }> = {
  confirmed: { bg: '#f0fdf4', border: '#86efac', color: '#16a34a' },
  seated: { bg: '#eff6ff', border: '#93c5fd', color: '#2563eb' },
  pending: { bg: '#fffbeb', border: '#fcd34d', color: '#d97706' },
  cancelled: { bg: '#fef2f2', border: '#fca5a5', color: '#dc2626' },
  'no-show': { bg: '#f8fafc', border: '#e2e8f0', color: '#64748b' },
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

type PlacedReservation = {
  reservation: Reservation
  topPct: number
  lane: number
  laneCount: number
  timeValue: string
}

function placeReservations(
  list: Reservation[],
  range: TimelineRange,
  slots: ReturnType<typeof buildTimeSlots>,
): PlacedReservation[] {
  const active = list.filter((r) => r.status !== 'cancelled')
  const bySlot = new Map<string, Reservation[]>()

  for (const r of active) {
    const tv = timeFromDate(r.scheduledAt)
    const snapped = snapToGrid(timeToTimelineMinutes(tv, range), range, slots)
    const arr = bySlot.get(snapped) ?? []
    arr.push(r)
    bySlot.set(snapped, arr)
  }

  const placed: PlacedReservation[] = []
  for (const [, group] of bySlot) {
    const sorted = [...group].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    const laneCount = sorted.length
    const tv = timeFromDate(sorted[0].scheduledAt)
    const snapped = snapToGrid(timeToTimelineMinutes(tv, range), range, slots)
    const topPct = timelinePercent(timeToTimelineMinutes(snapped, range), range)
    sorted.forEach((reservation, lane) => {
      placed.push({ reservation, topPct, lane, laneCount, timeValue: snapped })
    })
  }

  return placed.sort((a, b) => a.topPct - b.topPct || a.lane - b.lane)
}

export type BookingsDayTimelineProps = {
  date: Date
  reservations: Reservation[]
  range: TimelineRange | null
  peaks?: PeakBand[]
  loading: boolean
  reduceMotion: boolean | null
  onReschedule: (id: string, newTime: string) => void | Promise<void>
  onEdit: (r: Reservation) => void
  onAdd: () => void
}

export function BookingsDayTimeline({
  date,
  reservations,
  range,
  loading,
  reduceMotion,
  onReschedule,
  onEdit,
  onAdd,
}: BookingsDayTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragTime, setDragTime] = useState<string | null>(null)
  const dragMovedRef = useRef(false)

  const dateIso = toDateIso(date)
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const slots = useMemo(() => (range ? buildTimeSlots(range) : []), [range])
  const trackHeight = Math.max(280, slots.length * 22)

  const dayReservations = useMemo(
    () =>
      reservations.filter(
        (r) =>
          r.scheduledAt.getFullYear() === date.getFullYear() &&
          r.scheduledAt.getMonth() === date.getMonth() &&
          r.scheduledAt.getDate() === date.getDate(),
      ),
    [reservations, date],
  )

  const placed = useMemo(
    () => (range ? placeReservations(dayReservations, range, slots) : []),
    [dayReservations, range, slots],
  )

  const pickTimeFromClientY = useCallback(
    (clientY: number) => {
      if (!range || !trackRef.current) return null
      const rect = trackRef.current.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      const mins = range.start + pct * (range.end - range.start)
      return snapToGrid(mins, range, slots)
    },
    [range, slots],
  )

  const startDrag = useCallback(
    (id: string, initialTime: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!range) return
      e.preventDefault()
      const el = e.currentTarget
      el.setPointerCapture(e.pointerId)
      setDragId(id)
      setDragTime(initialTime)
      dragMovedRef.current = false

      const onMove = (ev: PointerEvent) => {
        dragMovedRef.current = true
        const t = pickTimeFromClientY(ev.clientY)
        if (t) setDragTime(t)
      }

      const onUp = async (ev: PointerEvent) => {
        try {
          el.releasePointerCapture(ev.pointerId)
        } catch {
          /* capture may already be released */
        }
        const finalTime = pickTimeFromClientY(ev.clientY) ?? initialTime
        setDragId(null)
        setDragTime(null)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        if (finalTime !== initialTime) {
          await onReschedule(id, finalTime)
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [range, pickTimeFromClientY, onReschedule],
  )

  const shell: CSSProperties = {
    ...bkCard,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  }

  const hourMarks = useMemo(() => {
    if (!range) return []
    const marks: { pct: number; label: string }[] = []
    const firstHour = Math.ceil(range.start / 60) * 60
    for (let m = firstHour; m <= range.end; m += 60) {
      const h = Math.floor((m % (24 * 60)) / 60)
      const period = h < 12 ? 'AM' : 'PM'
      const dh = h > 12 ? h - 12 : h === 0 ? 12 : h
      marks.push({
        pct: timelinePercent(m, range),
        label: `${dh} ${period}`,
      })
    }
    return marks
  }, [range])

  return (
    <div style={shell}>
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: bk.title, fontWeight: 700, color: '#0f172a' }}>{dateLabel}</div>
          <div style={{ fontSize: bk.micro, color: '#94a3b8', marginTop: 2 }}>
            Drag to reschedule · 15 min slots
          </div>
        </div>
        <button
          type="button"
          onClick={onAdd}
          style={{
            padding: '5px 12px',
            borderRadius: bk.radiusSm,
            border: 'none',
            background: '#0f172a',
            color: '#fff',
            fontSize: bk.caption,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + New
        </button>
      </div>

      {!range ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: bk.caption }}>
          Restaurant is closed on this day.
        </div>
      ) : loading ? (
        <div style={{ padding: 16, display: 'grid', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 36, borderRadius: bk.radiusSm, background: '#f1f5f9' }} />
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: '10px 8px 12px 6px',
            overflowY: 'auto',
            maxHeight: 'min(58vh, 480px)',
          }}
        >
          <div style={{ display: 'flex', gap: 0, minHeight: trackHeight }}>
            <div
              style={{
                width: GUTTER_W,
                flexShrink: 0,
                position: 'relative',
                height: trackHeight,
              }}
            >
              {hourMarks.map(({ pct, label }) => (
                <span
                  key={label + pct}
                  style={{
                    position: 'absolute',
                    top: `${pct}%`,
                    transform: 'translateY(-50%)',
                    right: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#94a3b8',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            <div
              ref={trackRef}
              style={{
                flex: 1,
                position: 'relative',
                height: trackHeight,
                borderRadius: bk.radiusSm,
                background: '#f8fafc',
                border: bk.border,
              }}
            >
              {slots.map((slot, i) => (
                <div
                  key={slot.value}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: `${timelinePercent(slot.minutes, range)}%`,
                    height: 1,
                    background: i % 2 === 0 ? '#e2e8f0' : 'transparent',
                    pointerEvents: 'none',
                  }}
                />
              ))}

              {placed.map(({ reservation: r, topPct, lane, laneCount, timeValue }) => {
                const isDragging = dragId === r.id
                const displayTime = isDragging && dragTime ? dragTime : timeValue
                const displayPct = isDragging && dragTime && range
                  ? timelinePercent(timeToTimelineMinutes(dragTime, range), range)
                  : topPct
                const st = STATUS_STYLE[r.status]
                const widthPct = laneCount > 1 ? 100 / laneCount - 2 : 100
                const leftPct = laneCount > 1 ? (lane / laneCount) * 100 + 1 : 0

                return (
                  <motion.div
                    key={r.id}
                    layout={!reduceMotion}
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    onPointerDown={startDrag(r.id, timeValue)}
                    onClick={(e) => {
                      if (dragMovedRef.current) {
                        dragMovedRef.current = false
                        return
                      }
                      e.stopPropagation()
                      onEdit(r)
                    }}
                    style={{
                      position: 'absolute',
                      top: `${displayPct}%`,
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      transform: 'translateY(-50%)',
                      height: CARD_H,
                      padding: '6px 8px',
                      borderRadius: bk.radiusSm,
                      border: `1px solid ${isDragging ? '#38bdf8' : st.border}`,
                      background: isDragging ? '#f0f9ff' : st.bg,
                      boxShadow: isDragging
                        ? '0 8px 24px rgba(56,189,248,0.25)'
                        : '0 2px 8px rgba(15,23,42,0.06)',
                      cursor: range ? 'grab' : 'default',
                      touchAction: 'none',
                      zIndex: isDragging ? 20 : 10,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      gap: 2,
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ fontSize: bk.caption, fontWeight: 700, color: '#0f172a' }}>
                      {isDragging && dragTime
                        ? dragTime
                        : fmtTime(r.scheduledAt)}{' '}
                      · {r.guestName}
                    </div>
                    <div style={{ fontSize: bk.micro, color: st.color, fontWeight: 600 }}>
                      Party {r.partySize} · {STATUS_LABEL[r.status]}
                    </div>
                  </motion.div>
                )
              })}

              {placed.length === 0 && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#94a3b8',
                    fontSize: 12,
                  }}
                >
                  No active reservations — drag or add one
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
