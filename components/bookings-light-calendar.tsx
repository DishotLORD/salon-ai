'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useMemo, useState, type CSSProperties } from 'react'

import type { Reservation } from '@/components/reservation-card'
import { bk } from '@/lib/bookings-compact-ui'
import { calendarMonthSlide } from '@/lib/ocean-motion'

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
    'linear-gradient(165deg, rgba(224,247,255,0.95) 0%, #ffffff 40%, rgba(240,249,255,0.98) 100%)',
  border: '1px solid rgba(56,189,248,0.22)',
  shadow: '0 4px 24px rgba(14,116,144,0.08), 0 1px 0 rgba(255,255,255,0.9) inset',
} as const

/** Heat tint from 0–1 load (count / max in month) */
function loadTint(ratio: number, inMonth: boolean): string {
  if (!inMonth || ratio <= 0) return 'transparent'
  if (ratio < 0.34) return 'rgba(224,242,254,0.55)'
  if (ratio < 0.67) return 'rgba(186,230,253,0.65)'
  return 'rgba(125,211,252,0.75)'
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

  const dayStats = useMemo(() => {
    const map = new Map<string, { count: number; covers: number }>()
    for (const r of reservations) {
      if (r.status === 'cancelled' || r.status === 'no-show') continue
      const k = dayKey(r.scheduledAt)
      const curr = map.get(k) ?? { count: 0, covers: 0 }
      map.set(k, { count: curr.count + 1, covers: curr.covers + r.partySize })
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
    width: 28,
    height: 28,
    borderRadius: bk.radiusSm,
    border: '1px solid rgba(56,189,248,0.2)',
    background: 'rgba(255,255,255,0.75)',
    color: '#0369a1',
    cursor: 'pointer',
    fontSize: 15,
    display: 'grid',
    placeItems: 'center',
    lineHeight: 1,
  }

  return (
    <div
      style={{
        position: 'relative',
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
          padding: '10px 12px 8px',
        }}
      >
        <button type="button" onClick={goPrev} style={navBtn}>
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
              fontSize: bk.title,
              fontWeight: 700,
              color: '#0c4a6e',
              letterSpacing: '-0.02em',
            }}
          >
            {monthLabel}
          </motion.span>
        </AnimatePresence>

        <button type="button" onClick={goNext} style={navBtn}>
          ›
        </button>
      </div>

      {/* DOW */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          borderTop: '1px solid rgba(56,189,248,0.12)',
          background: 'rgba(255,255,255,0.45)',
        }}
      >
        {DOW.map((d) => (
          <div
            key={d}
            style={{
              padding: '5px 0',
              textAlign: 'center',
              fontSize: bk.micro,
              fontWeight: 600,
              color: '#64748b',
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
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            borderTop: '1px solid rgba(56,189,248,0.08)',
          }}
        >
          {cells.map(({ date, inMonth }, idx) => {
            const k = dayKey(date)
            const { count, covers } = dayStats.get(k) ?? { count: 0, covers: 0 }
            const loadRatio = count / maxCount
            const isToday = isSameDay(date, today)
            const isSelected = selectedDay ? isSameDay(date, selectedDay) : false
            const isPast = date < today && !isToday

            const cellBg = isSelected
              ? 'rgba(224,242,254,0.9)'
              : loadTint(loadRatio, inMonth)

            return (
              <button
                key={`${monthKey}-${idx}`}
                type="button"
                onClick={() => onSelectDay(date)}
                title={
                  count > 0
                    ? `${count} reservation${count !== 1 ? 's' : ''}, ${covers} guests`
                    : undefined
                }
                style={{
                  minHeight: 48,
                  padding: 0,
                  border: 'none',
                  borderTop: idx >= 7 ? '1px solid rgba(56,189,248,0.06)' : 'none',
                  borderRight:
                    (idx + 1) % 7 !== 0 ? '1px solid rgba(56,189,248,0.06)' : 'none',
                  outline: isSelected
                    ? '2px solid #0284c7'
                    : isToday
                      ? '2px solid #38bdf8'
                      : 'none',
                  outlineOffset: -2,
                  background: cellBg,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'outline-color 0.15s ease, background 0.15s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '4px 5px 0',
                  }}
                >
                  {count > 0 ? (
                    <span
                      style={{
                        minWidth: 16,
                        height: 16,
                        padding: '0 3px',
                        borderRadius: 4,
                        background: isSelected ? '#0284c7' : '#0ea5e9',
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                      }}
                    >
                      {count}
                    </span>
                  ) : (
                    <span style={{ width: 16 }} />
                  )}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: isSelected || isToday ? 700 : inMonth ? 600 : 400,
                      color: !inMonth
                        ? '#cbd5e1'
                        : isSelected
                          ? '#0369a1'
                          : isToday
                            ? '#0284c7'
                            : isPast
                              ? '#94a3b8'
                              : '#0f172a',
                    }}
                  >
                    {date.getDate()}
                  </span>
                </div>

                {covers > 0 && inMonth && (
                  <span
                    style={{
                      fontSize: 8,
                      color: isSelected ? '#0369a1' : '#64748b',
                      padding: '1px 6px 0',
                      fontWeight: 500,
                    }}
                  >
                    {covers} {covers === 1 ? 'guest' : 'guests'}
                  </span>
                )}

                <div style={{ flex: 1, minHeight: 2 }} />

                {count > 0 && inMonth && (
                  <div
                    style={{
                      height: 3,
                      margin: '0 5px 4px',
                      borderRadius: 2,
                      background: 'rgba(255,255,255,0.5)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.max(14, loadRatio * 100)}%`,
                        background: isSelected
                          ? 'linear-gradient(90deg, #0284c7, #38bdf8)'
                          : 'linear-gradient(90deg, #0ea5e9, #7dd3fc)',
                        borderRadius: 2,
                        transition: 'width 0.25s ease',
                      }}
                    />
                  </div>
                )}
              </button>
            )
          })}
        </motion.div>
      </AnimatePresence>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 12px',
          borderTop: '1px solid rgba(56,189,248,0.1)',
          fontSize: 9,
          color: '#64748b',
          background: 'rgba(255,255,255,0.35)',
        }}
      >
        <span style={{ fontWeight: 600 }}>Load</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(224,242,254,0.9)' }} />
          Light
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(125,211,252,0.75)' }} />
          Busy
        </span>
        <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
          Badge = bookings
        </span>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid rgba(56,189,248,0.12)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.5)',
        }}
      >
        <button
          type="button"
          onClick={onJumpToday}
          style={{
            padding: '5px 12px',
            borderRadius: bk.radiusSm,
            border: `1px solid ${isAtToday ? 'rgba(56,189,248,0.5)' : 'rgba(56,189,248,0.18)'}`,
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
              padding: '5px 12px',
              borderRadius: bk.radiusSm,
              border: '1px solid rgba(56,189,248,0.15)',
              background: '#ffffff',
              color: '#64748b',
              fontSize: bk.caption,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Show all
          </button>
        )}
      </div>
    </div>
  )
}
