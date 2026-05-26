'use client'

import type { CSSProperties, PointerEvent } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { t } from '@/lib/dashboard-theme'
import { BOOKING_SLOT_MINUTES } from '@/lib/operating-hours'
import {
  buildTimeSlots,
  formatDigitalClock,
  snapToGrid,
  timeToTimelineMinutes,
  timelinePercent,
  type TimelineRange,
} from '@/lib/time-timeline'

const DIAL_FONT = 'var(--font-plus-jakarta, system-ui, sans-serif)'

export const HOURS_TIMELINE_RANGE: TimelineRange = {
  start: 6 * 60,
  end: 26 * 60,
  step: BOOKING_SLOT_MINUTES,
  wrapAfterMidnight: true,
}

export type TimeRangeDialProps = {
  open: string
  close: string
  onChange: (open: string, close: string) => void
  disabled?: boolean
  range?: TimelineRange
}

type DragTarget = 'open' | 'close' | null

function pickNearestHandle(
  mins: number,
  openMin: number,
  closeMin: number,
): DragTarget {
  const distOpen = Math.abs(mins - openMin)
  const distClose = Math.abs(mins - closeMin)
  return distOpen <= distClose ? 'open' : 'close'
}

export function TimeRangeDial({
  open,
  close,
  onChange,
  disabled = false,
  range = HOURS_TIMELINE_RANGE,
}: TimeRangeDialProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<DragTarget>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [activeHandle, setActiveHandle] = useState<DragTarget>(null)

  const slots = useMemo(() => buildTimeSlots(range), [range])
  const openMin = timeToTimelineMinutes(open, range)
  const closeMin = timeToTimelineMinutes(close, range)
  const openPct = timelinePercent(openMin, range)
  const closePct = timelinePercent(closeMin, range)
  const openDigital = formatDigitalClock(open, range, slots)
  const closeDigital = formatDigitalClock(close, range, slots)

  const pickFromClientX = useCallback(
    (clientX: number, target: DragTarget) => {
      const el = trackRef.current
      if (!el || disabled) return
      const rect = el.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const mins = range.start + pct * (range.end - range.start)
      const snapped = snapToGrid(mins, range, slots)
      const snappedMin = timeToTimelineMinutes(snapped, range)

      if (target === 'open') {
        const nextClose =
          snappedMin >= closeMin ? snapToGrid(snappedMin + range.step, range, slots) : close
        onChange(snapped, nextClose)
      } else if (snappedMin <= openMin) {
        onChange(open, snapToGrid(openMin + range.step, range, slots))
      } else {
        onChange(open, snapped)
      }
    },
    [close, closeMin, disabled, onChange, open, openMin, range, slots],
  )

  const handleTrackPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const mins = range.start + pct * (range.end - range.start)
    const target = pickNearestHandle(mins, openMin, closeMin)
    draggingRef.current = target
    setActiveHandle(target)
    setIsDragging(true)
    pickFromClientX(e.clientX, target)
  }

  const handleStyle = (pct: number, isActive: boolean): CSSProperties => ({
    position: 'absolute',
    top: '50%',
    left: `calc(${pct}% - 7px)`,
    transform: 'translateY(-50%)',
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: t.accent,
    border: `2px solid ${t.bgSurface}`,
    boxShadow: `0 0 10px ${t.accent}`,
    cursor: disabled ? 'not-allowed' : 'grab',
    zIndex: isActive ? 3 : 2,
    touchAction: 'none',
    transition: isDragging ? 'none' : 'left 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
  })

  return (
    <div style={{ display: 'grid', gap: 8, opacity: disabled ? 0.45 : 1 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
          fontWeight: 600,
          color: t.text,
        }}
      >
        <span>
          Open {openDigital.hm}
          <span style={{ fontSize: 10, color: t.accent, marginLeft: 4 }}>{openDigital.period}</span>
        </span>
        <span>
          Close {closeDigital.hm}
          <span style={{ fontSize: 10, color: t.accent, marginLeft: 4 }}>{closeDigital.period}</span>
        </span>
      </div>

      <div
        ref={trackRef}
        role="group"
        aria-label="Open and close times"
        onPointerDown={handleTrackPointerDown}
        onPointerMove={(e) => {
          if (!draggingRef.current) return
          pickFromClientX(e.clientX, draggingRef.current)
        }}
        onPointerUp={(e) => {
          draggingRef.current = null
          setActiveHandle(null)
          setIsDragging(false)
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
        onPointerCancel={() => {
          draggingRef.current = null
          setActiveHandle(null)
          setIsDragging(false)
        }}
        style={{
          position: 'relative',
          height: 40,
          borderRadius: 8,
          background: t.bgSurface,
          border: `1px solid ${t.border}`,
          overflow: 'hidden',
          touchAction: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 8,
            bottom: 8,
            left: `${openPct}%`,
            width: `${Math.max(0, closePct - openPct)}%`,
            background: t.accentSoftBg,
            borderRadius: 4,
            pointerEvents: 'none',
            transition: isDragging ? 'none' : 'left 0.35s cubic-bezier(0.22, 1, 0.36, 1), width 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />

        {slots.map((slot) => {
          const left = timelinePercent(slot.minutes, range)
          const isHour = slot.minutes % 60 === 0
          const inRange = slot.minutes >= openMin && slot.minutes <= closeMin
          return (
            <div
              key={slot.value}
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: isHour ? 10 : 14,
                width: 2,
                height: isHour ? 14 : 8,
                marginLeft: -1,
                borderRadius: 1,
                background: inRange ? t.accent : t.textSubtle,
                opacity: inRange ? 0.6 : 0.25,
                pointerEvents: 'none',
              }}
            />
          )
        })}

        <div style={handleStyle(openPct, activeHandle === 'open')} />
        <div style={handleStyle(closePct, activeHandle === 'close')} />
      </div>

      <div style={{ position: 'relative', height: 14, pointerEvents: 'none' }}>
        {[
          { mins: 6 * 60, label: '6 AM' },
          { mins: 10 * 60, label: '10' },
          { mins: 14 * 60, label: '2' },
          { mins: 18 * 60, label: '6' },
          { mins: 22 * 60, label: '10' },
          { mins: 26 * 60, label: '2 AM' },
        ].map((mark) => (
          <span
            key={mark.mins}
            style={{
              position: 'absolute',
              left: `${timelinePercent(mark.mins, range)}%`,
              transform: 'translateX(-50%)',
              fontSize: 8,
              fontWeight: 600,
              color: t.textSubtle,
              fontFamily: DIAL_FONT,
            }}
          >
            {mark.label}
          </span>
        ))}
      </div>
    </div>
  )
}
