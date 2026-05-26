'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useMemo, useState, type CSSProperties } from 'react'

import type { Reservation } from '@/components/reservation-card'
import { bk } from '@/lib/bookings-compact-ui'
import { getDayHoursForDate, type OperatingHours } from '@/lib/operating-hours'
import { calendarMonthSlide } from '@/lib/ocean-motion'
import { toDateIso } from '@/lib/reservation-schedule'

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

const water = {
  shell:
    'linear-gradient(165deg, rgba(224,247,255,0.92) 0%, #ffffff 42%, rgba(240,249,255,0.98) 100%)',
  border: '1px solid rgba(56,189,248,0.2)',
  shadow: '0 4px 20px rgba(14,116,144,0.07), inset 0 1px 0 rgba(255,255,255,0.95)',
  gridLine: '1px solid rgba(56,189,248,0.08)',
} as const

function loadTint(ratio: number, inMonth: boolean): string {
  if (!inMonth || ratio <= 0) return '#ffffff'
  if (ratio < 0.34) return 'rgba(224,242,254,0.7)'
  if (ratio < 0.67) return 'rgba(186,230,253,0.75)'
  return 'rgba(147,197,253,0.82)'
}

type DayCellStats = {
  count: number
  covers: number
  cancelledCount: number
  pendingCount: number
}

function buildDayTooltip(stats: DayCellStats): string | undefined {
  const { count, covers, cancelledCount, pendingCount } = stats
  if (count === 0 && cancelledCount === 0) return undefined
  const parts: string[] = []
  if (count > 0) {
    parts.push(`${count} booking${count !== 1 ? 's' : ''}`)
    parts.push(`${covers} guest${covers !== 1 ? 's' : ''}`)
  }
  if (pendingCount > 0) parts.push(`${pendingCount} pending`)
  if (cancelledCount > 0) parts.push(`${cancelledCount} cancelled`)
  return parts.join(' · ')
}

export type BookingsLightCalendarProps = {
  displayMonth: Date
  reservations: Reservation[]
  selectedDay: Date | null
  onSelectDay: (d: Date) => void
  onMonthPrev: () => void
  onMonthNext: () => void
  onJumpToday: () => void
  onClearDay: () => void
  today: Date
  operatingHours: OperatingHours
  reduceMotion: boolean | null
}

export function BookingsLightCalendar({
  displayMonth,
  reservations,
  selectedDay,
  onSelectDay,
  onMonthPrev,
  onMonthNext,
  onJumpToday,
  onClearDay,
  today,
  operatingHours,
  reduceMotion,
}: BookingsLightCalendarProps) {
  const [slideDir, setSlideDir] = useState(0)

  const year = displayMonth.getFullYear()
  const month = displayMonth.getMonth()
  const monthKey = `${year}-${month}`

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDate = new Date(year, month + 1, 0).getDate()
    const startPad = (firstDay.getDay() + 6) % 7
    const list: { date: Date; inMonth: boolean }[] = []
    for (let i = startPad - 1; i >= 0; i--)
      list.push({ date: new Date(year, month, -i), inMonth: false })
    for (let d = 1; d <= lastDate; d++)
      list.push({ date: new Date(year, month, d), inMonth: true })
    const tail = list.length % 7
    if (tail !== 0)
      for (let d = 1; d <= 7 - tail; d++)
        list.push({ date: new Date(year, month + 1, d), inMonth: false })
    return list
  }, [year, month])

  const rowCount = Math.ceil(cells.length / 7)

  const dayStats = useMemo(() => {
    const map = new Map<string, DayCellStats>()
    for (const r of reservations) {
      const k = dayKey(r.scheduledAt)
      const curr = map.get(k) ?? { count: 0, covers: 0, cancelledCount: 0, pendingCount: 0 }
      if (r.status === 'cancelled') {
        map.set(k, { ...curr, cancelledCount: curr.cancelledCount + 1 })
        continue
      }
      if (r.status === 'no-show') continue
      map.set(k, {
        count: curr.count + 1,
        covers: curr.covers + r.partySize,
        cancelledCount: curr.cancelledCount,
        pendingCount: curr.pendingCount + (r.status === 'pending' ? 1 : 0),
      })
    }
    return map
  }, [reservations])

  const maxCount = useMemo(
    () => Math.max(1, ...Array.from(dayStats.values()).map((s) => s.count)),
    [dayStats],
  )

  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const monthLabel = displayMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
  const isAtToday = selectedDay !== null && isSameDay(selectedDay, today)

  const goPrev = useCallback(() => {
    setSlideDir(-1)
    onMonthPrev()
  }, [onMonthPrev])

  const goNext = useCallback(() => {
    setSlideDir(1)
    onMonthNext()
  }, [onMonthNext])

  const navBtn: CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: bk.radiusSm,
    border: '1px solid rgba(56,189,248,0.22)',
    background: 'rgba(255,255,255,0.85)',
    color: '#0369a1',
    cursor: 'pointer',
    fontSize: 16,
    display: 'grid',
    placeItems: 'center',
    lineHeight: 1,
  }

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gridTemplateRows: `repeat(${rowCount}, minmax(${bk.calCellMinH}px, 1fr))`,
    gap: bk.calRowGap,
    background: water.gridLine,
  }

  return (
    <div
      style={{
        width: '100%',
        overflow: 'hidden',
        borderRadius: bk.radius,
        border: water.border,
        boxShadow: water.shadow,
        background: water.shell,
        fontFamily: bk.font,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Month nav */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px 10px',
          minHeight: 48,
        }}
      >
        <button type="button" onClick={goPrev} aria-label="Previous month" style={navBtn}>
          ‹
        </button>

        <AnimatePresence mode="wait" custom={slideDir}>
          <motion.span
            key={monthKey}
            custom={slideDir}
            variants={reduceMotion ? undefined : calendarMonthSlide}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#0c4a6e',
              letterSpacing: '-0.02em',
            }}
          >
            {monthLabel}
          </motion.span>
        </AnimatePresence>

        <button type="button" onClick={goNext} aria-label="Next month" style={navBtn}>
          ›
        </button>
      </div>

      {/* DOW */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          borderTop: water.gridLine,
          borderBottom: water.gridLine,
          background: 'rgba(255,255,255,0.55)',
        }}
      >
        {DOW.map((d) => (
          <div
            key={d}
            style={{
              padding: '8px 4px',
              textAlign: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: '#64748b',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <AnimatePresence mode="wait" custom={slideDir}>
        <motion.div
          key={monthKey}
          custom={slideDir}
          variants={reduceMotion ? undefined : calendarMonthSlide}
          initial="initial"
          animate="animate"
          exit="exit"
          style={{ ...gridStyle, padding: 1, background: 'rgba(56,189,248,0.06)' }}
        >
          {cells.map(({ date, inMonth }, idx) => {
            const k = dayKey(date)
            const stats = dayStats.get(k) ?? {
              count: 0,
              covers: 0,
              cancelledCount: 0,
              pendingCount: 0,
            }
            const { count, covers, cancelledCount } = stats
            const loadRatio = count / maxCount
            const isToday = isSameDay(date, today)
            const isSelected = selectedDay ? isSameDay(date, selectedDay) : false
            const isPast = date < today && !isToday
            const closed =
              inMonth && getDayHoursForDate(operatingHours, toDateIso(date)).closed
            const showTodayRing = isToday && !isSelected
            const onlyCancelled = count === 0 && cancelledCount > 0
            const tooltip = closed
              ? 'Closed'
              : buildDayTooltip(stats)

            return (
              <button
                key={`${monthKey}-${idx}`}
                type="button"
                onClick={() => onSelectDay(date)}
                title={tooltip}
                style={{
                  minHeight: bk.calCellMinH,
                  padding: '7px 8px 6px',
                  border: 'none',
                  borderRadius: 2,
                  boxShadow: isSelected
                    ? 'inset 0 0 0 2px #0284c7'
                    : showTodayRing
                      ? 'inset 0 0 0 1px #38bdf8'
                      : onlyCancelled
                        ? 'inset 0 0 0 1px rgba(239,68,68,0.35)'
                        : 'none',
                  background: closed
                    ? '#f1f5f9'
                    : isSelected
                      ? 'linear-gradient(180deg, #e0f2fe 0%, #f0f9ff 100%)'
                      : loadTint(loadRatio, inMonth),
                  cursor: 'pointer',
                  display: 'grid',
                  gridTemplateRows: 'auto auto 1fr auto',
                  gap: 3,
                  textAlign: 'left',
                  transition: 'box-shadow 0.15s ease, background 0.15s ease',
                  opacity: inMonth ? (closed ? 0.72 : 1) : 0.55,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 4,
                    minHeight: 22,
                  }}
                >
                  {count > 0 && inMonth ? (
                    <span
                      style={{
                        minWidth: 18,
                        height: 18,
                        padding: '0 4px',
                        borderRadius: 5,
                        background: isSelected ? '#0284c7' : '#0ea5e9',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      {count}
                    </span>
                  ) : (
                    <span style={{ width: 18, flexShrink: 0 }} />
                  )}
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: isSelected || isToday ? 700 : inMonth ? 600 : 500,
                      lineHeight: 1.1,
                      color: !inMonth
                        ? '#cbd5e1'
                        : isSelected
                          ? '#0369a1'
                          : isToday
                            ? '#0284c7'
                            : isPast
                              ? '#94a3b8'
                              : '#0f172a',
                      marginLeft: 'auto',
                    }}
                  >
                    {date.getDate()}
                  </span>
                </div>

                <div style={{ minHeight: 14, display: 'flex', alignItems: 'center' }}>
                  {closed && inMonth ? (
                    <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>Closed</span>
                  ) : covers > 0 && inMonth ? (
                    <span
                      style={{
                        fontSize: 9,
                        color: isSelected ? '#0369a1' : '#64748b',
                        fontWeight: 500,
                        lineHeight: 1.2,
                      }}
                    >
                      {covers} {covers === 1 ? 'guest' : 'guests'}
                    </span>
                  ) : onlyCancelled && inMonth ? (
                    <span style={{ fontSize: 9, color: '#dc2626', fontWeight: 500 }}>
                      {cancelledCount} cancelled
                    </span>
                  ) : null}
                </div>

                <div aria-hidden />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: 'rgba(148,163,184,0.15)',
                      overflow: 'hidden',
                      visibility: count > 0 && inMonth && !closed ? 'visible' : 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.max(12, loadRatio * 100)}%`,
                        background: isSelected
                          ? 'linear-gradient(90deg, #0284c7, #38bdf8)'
                          : 'linear-gradient(90deg, #0ea5e9, #7dd3fc)',
                        borderRadius: 2,
                        transition: 'width 0.25s ease',
                      }}
                    />
                  </div>
                  {cancelledCount > 0 && inMonth && !closed ? (
                    <div
                      style={{
                        height: 2,
                        borderRadius: 1,
                        background: 'rgba(239,68,68,0.25)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: onlyCancelled ? '100%' : `${Math.min(100, cancelledCount * 25)}%`,
                          background: '#f87171',
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </button>
            )
          })}
        </motion.div>
      </AnimatePresence>

      {/* Legend */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto auto auto 1fr',
          alignItems: 'center',
          gap: '6px 14px',
          padding: '8px 14px',
          borderTop: water.gridLine,
          fontSize: 10,
          color: '#64748b',
          background: 'rgba(255,255,255,0.45)',
        }}
      >
        <span style={{ fontWeight: 700, color: '#475569' }}>Load</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: 'rgba(224,242,254,0.9)',
              border: '1px solid rgba(56,189,248,0.15)',
            }}
          />
          Light
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: 'rgba(147,197,253,0.82)',
              border: '1px solid rgba(56,189,248,0.2)',
            }}
          />
          Busy
        </span>
        <span style={{ textAlign: 'right', fontWeight: 600, color: '#94a3b8' }}>
          Number = bookings
        </span>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '9px 14px',
          borderTop: water.gridLine,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(255,255,255,0.55)',
          minHeight: 40,
        }}
      >
        <button
          type="button"
          onClick={onJumpToday}
          style={{
            padding: '6px 14px',
            borderRadius: bk.radiusSm,
            border: `1px solid ${isAtToday ? 'rgba(56,189,248,0.45)' : 'rgba(56,189,248,0.18)'}`,
            background: isAtToday ? '#e0f2fe' : '#ffffff',
            color: isAtToday ? '#0369a1' : '#64748b',
            fontSize: bk.caption,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Today
        </button>
        {selectedDay && (
          <button
            type="button"
            onClick={onClearDay}
            style={{
              padding: '6px 14px',
              borderRadius: bk.radiusSm,
              border: '1px solid rgba(56,189,248,0.15)',
              background: '#ffffff',
              color: '#64748b',
              fontSize: bk.caption,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            All month
          </button>
        )}
      </div>
    </div>
  )
}
