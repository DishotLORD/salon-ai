'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useMemo, useState, type CSSProperties } from 'react'

import type { Reservation } from '@/components/reservation-card'
import { bk } from '@/lib/bookings-compact-ui'
import { getDayHoursForDate, type OperatingHours } from '@/lib/operating-hours'
import { calendarMonthSlide } from '@/lib/ocean-motion'
import { calgaryCalendarDayKey } from '@/lib/booking-wall-clock'
import { toDateIso } from '@/lib/reservation-schedule'

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Map UI calendar cell (local midnight) to YYYY-MM-DD for stats lookup. */
function calendarCellDateKey(date: Date) {
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

const water = {
  shell: 'var(--bk-cal-shell)',
  border: '1px solid var(--bk-cal-border)',
  shadow: 'var(--bk-cal-shadow)',
  gridLine: '1px solid var(--bk-cal-line)',
} as const

function loadTint(ratio: number, inMonth: boolean): string {
  if (!inMonth || ratio <= 0) return 'var(--bk-cal-cell)'
  if (ratio < 0.34) return 'var(--bk-cal-load-1)'
  if (ratio < 0.67) return 'var(--bk-cal-load-2)'
  return 'var(--bk-cal-load-3)'
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
      const k = calgaryCalendarDayKey(r.scheduledAt)
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
    border: '1px solid var(--bk-cal-border)',
    background: 'var(--bk-cal-chrome)',
    color: 'var(--bk-accent)',
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
              color: 'var(--bk-head)',
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
          background: 'var(--bk-cal-chrome)',
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
              color: 'var(--bk-body)',
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
          style={{ ...gridStyle, padding: 1, background: 'var(--bk-cal-gutter)' }}
        >
          {cells.map(({ date, inMonth }, idx) => {
            const k = calendarCellDateKey(date)
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
                    ? 'inset 0 0 0 2px var(--bk-accent)'
                    : showTodayRing
                      ? 'inset 0 0 0 1px var(--bk-accent)'
                      : onlyCancelled
                        ? 'inset 0 0 0 1px var(--bk-danger-border)'
                        : 'none',
                  background: closed
                    ? 'var(--bk-surface)'
                    : isSelected
                      ? 'var(--bk-cal-selected)'
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
                        background: 'var(--bk-accent)',
                        color: 'var(--bk-cal-count-text)',
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
                        ? 'var(--bk-muted)'
                        : isSelected || isToday
                          ? 'var(--bk-accent)'
                          : isPast
                            ? 'var(--bk-muted)'
                            : 'var(--bk-head)',
                      marginLeft: 'auto',
                    }}
                  >
                    {date.getDate()}
                  </span>
                </div>

                <div style={{ minHeight: 14, display: 'flex', alignItems: 'center' }}>
                  {closed && inMonth ? (
                    <span style={{ fontSize: 9, color: 'var(--bk-muted)', fontWeight: 600 }}>Closed</span>
                  ) : covers > 0 && inMonth ? (
                    <span
                      style={{
                        fontSize: 9,
                        color: isSelected ? 'var(--bk-accent)' : 'var(--bk-body)',
                        fontWeight: 500,
                        lineHeight: 1.2,
                      }}
                    >
                      {covers} {covers === 1 ? 'guest' : 'guests'}
                    </span>
                  ) : onlyCancelled && inMonth ? (
                    <span style={{ fontSize: 9, color: 'var(--bk-danger)', fontWeight: 500 }}>
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
                      background: 'var(--bk-cal-track)',
                      overflow: 'hidden',
                      visibility: count > 0 && inMonth && !closed ? 'visible' : 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.max(12, loadRatio * 100)}%`,
                        background: 'linear-gradient(90deg, var(--bk-accent), #7dd3fc)',
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
                        background: 'var(--bk-danger-bg)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: onlyCancelled ? '100%' : `${Math.min(100, cancelledCount * 25)}%`,
                          background: 'var(--bk-danger)',
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
          color: 'var(--bk-body)',
          background: 'var(--bk-cal-chrome-soft)',
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--bk-text)' }}>Load</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: 'var(--bk-cal-load-1)',
              border: '1px solid var(--bk-cal-border)',
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
              background: 'var(--bk-cal-load-3)',
              border: '1px solid var(--bk-cal-border)',
            }}
          />
          Busy
        </span>
        <span style={{ textAlign: 'right', fontWeight: 600, color: 'var(--bk-muted)' }}>
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
          background: 'var(--bk-cal-chrome)',
          minHeight: 40,
        }}
      >
        <button
          type="button"
          onClick={onJumpToday}
          style={{
            padding: '6px 14px',
            borderRadius: bk.radiusSm,
            border: `1px solid ${isAtToday ? 'var(--bk-accent)' : 'var(--bk-cal-border)'}`,
            background: isAtToday ? 'var(--bk-accent-soft)' : 'var(--bk-cal-cell)',
            color: isAtToday ? 'var(--bk-accent)' : 'var(--bk-body)',
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
              border: '1px solid var(--bk-cal-border)',
              background: 'var(--bk-cal-cell)',
              color: 'var(--bk-body)',
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
