'use client'

import { motion } from 'framer-motion'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { t } from '@/lib/dashboard-theme'
import {
  buildTimeSlots,
  formatDigitalClock,
  peakBandStyle,
  snapToGrid,
  timeToTimelineMinutes,
  timelinePercent,
  type PeakBand,
  type TimelineRange,
  type TimeSlot,
} from '@/lib/time-timeline'

const DIAL_FONT = 'var(--font-plus-jakarta, system-ui, sans-serif)'

export type TimeDialPickerProps = {
  value: string
  onChange: (time: string) => void
  range: TimelineRange
  peaks?: PeakBand[]
  reduceMotion: boolean | null
  compact?: boolean
}

function peakHintForMinutes(minutes: number, peaks?: PeakBand[]): string | null {
  if (!peaks) return null
  for (const peak of peaks) {
    if (minutes >= peak.start && minutes < peak.end) return peak.label
  }
  return null
}

export function TimeDialPicker({
  value,
  onChange,
  range,
  peaks,
  reduceMotion,
  compact = false,
}: TimeDialPickerProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)

  const slots = useMemo(() => buildTimeSlots(range), [range])
  const snappedValue = snapToGrid(timeToTimelineMinutes(value, range), range, slots)
  const selectedMin = timeToTimelineMinutes(snappedValue, range)
  const playheadPct = timelinePercent(selectedMin, range)
  const digital = formatDigitalClock(snappedValue, range, slots)
  const peakHint = peakHintForMinutes(selectedMin, peaks)
  const currentSlotIndex = slots.findIndex((s) => s.value === snappedValue)

  const hourMarks = useMemo(() => {
    const marks: { minutes: number; label: string }[] = []
    const firstHour = Math.ceil(range.start / 60) * 60
    for (let m = firstHour; m <= range.end; m += 60) {
      const h = Math.floor((m % (24 * 60)) / 60)
      const period = h < 12 ? 'AM' : 'PM'
      const dh = h > 12 ? h - 12 : h === 0 ? 12 : h
      const isEdge = m === range.start || m >= range.end - 60
      marks.push({ minutes: m, label: isEdge ? `${dh} ${period}` : String(dh) })
    }
    return marks
  }, [range])

  const pickTimeFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const mins = range.start + pct * (range.end - range.start)
      onChange(snapToGrid(mins, range, slots))
    },
    [onChange, range, slots],
  )

  const stepSlot = useCallback(
    (delta: number) => {
      const idx = currentSlotIndex >= 0 ? currentSlotIndex : 0
      const next = Math.max(0, Math.min(slots.length - 1, idx + delta))
      onChange(slots[next].value)
    },
    [currentSlotIndex, onChange, slots],
  )

  const handleTrackKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      stepSlot(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      stepSlot(1)
    }
  }

  const stepBtnStyle: CSSProperties = {
    width: compact ? 24 : 28,
    height: compact ? 24 : 28,
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.bgSurface,
    color: t.text,
    fontSize: 16,
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  }

  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${t.border}`,
        background: t.bgSurfaceMuted,
        padding: compact ? '8px 10px' : '10px 12px 10px',
        display: 'grid',
        gap: compact ? 6 : 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <button
          type="button"
          aria-label="Earlier time"
          onClick={() => stepSlot(-1)}
          disabled={currentSlotIndex <= 0}
          style={{ ...stepBtnStyle, opacity: currentSlotIndex <= 0 ? 0.35 : 1 }}
        >
          −
        </button>

        <div
          role="slider"
          tabIndex={0}
          aria-valuemin={range.start}
          aria-valuemax={range.end}
          aria-valuenow={selectedMin}
          aria-valuetext={digital.label}
          onKeyDown={handleTrackKeyDown}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            outline: 'none',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <motion.span
              key={snappedValue}
              initial={reduceMotion ? false : { opacity: 0.5, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18 }}
              style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 1,
                fontSize: compact ? 22 : 26,
                fontWeight: 600,
                letterSpacing: '0.06em',
                color: t.text,
                fontVariantNumeric: 'tabular-nums',
                textShadow: `0 0 16px ${t.accentSoftBg}`,
              }}
            >
              {digital.hm.includes(':') ? (
                <>
                  <span>{digital.hm.split(':')[0]}</span>
                  <motion.span
                    animate={reduceMotion ? undefined : { opacity: [1, 0.25, 1] }}
                    transition={reduceMotion ? undefined : { duration: 1.1, repeat: Infinity }}
                  >
                    :
                  </motion.span>
                  <span>{digital.hm.split(':')[1]}</span>
                </>
              ) : (
                digital.hm
              )}
            </motion.span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: t.accent }}>
              {digital.period}
            </span>
          </div>
          {peakHint ? (
            <span style={{ fontSize: 9, color: t.textMuted, fontFamily: DIAL_FONT }}>
              {digital.label} · {peakHint}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          aria-label="Later time"
          onClick={() => stepSlot(1)}
          disabled={currentSlotIndex >= slots.length - 1}
          style={{
            ...stepBtnStyle,
            opacity: currentSlotIndex >= slots.length - 1 ? 0.35 : 1,
          }}
        >
          +
        </button>
      </div>

      <div style={{ position: 'relative', paddingTop: peaks?.length ? 16 : 4 }}>
        {peaks && peaks.length > 0 ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 12,
              pointerEvents: 'none',
            }}
          >
            {peaks.map((peak) => (
              <span
                key={peak.label}
                style={{
                  position: 'absolute',
                  ...peakBandStyle(peak.start, peak.end, range),
                  fontSize: 7,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: peak.label.toLowerCase().includes('lunch') ? t.warning : t.accent,
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {peak.label}
              </span>
            ))}
          </div>
        ) : null}

        <div
          ref={trackRef}
          role="presentation"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            draggingRef.current = true
            setIsDragging(true)
            pickTimeFromClientX(e.clientX)
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return
            pickTimeFromClientX(e.clientX)
          }}
          onPointerUp={(e) => {
            draggingRef.current = false
            setIsDragging(false)
            e.currentTarget.releasePointerCapture(e.pointerId)
          }}
          onPointerCancel={() => {
            draggingRef.current = false
            setIsDragging(false)
          }}
          style={{
            position: 'relative',
            height: compact ? 32 : 36,
            borderRadius: 8,
            background: t.bgSurface,
            border: `1px solid ${t.border}`,
            overflow: 'hidden',
            cursor: 'pointer',
            touchAction: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${playheadPct}%`,
              background: t.accentSoftBg,
              pointerEvents: 'none',
              transition: isDragging ? 'none' : 'width 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
          {peaks?.map((peak) => (
            <div
              key={`band-${peak.label}`}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                ...peakBandStyle(peak.start, peak.end, range),
                background: peak.label.toLowerCase().includes('lunch') ? t.warningBg : t.accentSoftBg,
                borderLeft: `1px solid ${peak.label.toLowerCase().includes('lunch') ? t.warningBorder : t.accentSoftBorder}`,
                borderRight: `1px solid ${peak.label.toLowerCase().includes('lunch') ? t.warningBorder : t.accentSoftBorder}`,
                opacity: 0.85,
                pointerEvents: 'none',
              }}
            />
          ))}

          {slots.map((slot) => {
            const left = timelinePercent(slot.minutes, range)
            const isHour = slot.minutes % 60 === 0
            const isActive = slot.value === snappedValue
            const inPeak = peaks?.some((p) => slot.minutes >= p.start && slot.minutes < p.end)
            const tickH = isActive ? 24 : isHour ? 16 : 10
            const top = isActive ? 6 : isHour ? 10 : 13

            return (
              <div
                key={slot.value}
                title={slot.label}
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  top,
                  width: isActive ? 3 : 2,
                  height: tickH,
                  marginLeft: isActive ? -1.5 : -1,
                  borderRadius: 1,
                  background: isActive ? t.accent : t.textSubtle,
                  opacity: isActive ? 1 : inPeak ? 0.5 : 0.3,
                  boxShadow: isActive ? `0 0 8px ${t.accent}` : 'none',
                  pointerEvents: 'none',
                  transition: isDragging ? 'none' : 'top 0.25s ease, height 0.25s ease, opacity 0.2s ease',
                }}
              />
            )
          })}

          <div
            style={{
              position: 'absolute',
              top: 4,
              bottom: 4,
              left: `calc(${playheadPct}% - 1px)`,
              width: 2,
              borderRadius: 1,
              background: t.accent,
              boxShadow: `0 0 8px ${t.accent}`,
              pointerEvents: 'none',
              transition: isDragging ? 'none' : 'left 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>

        <div style={{ position: 'relative', height: 14, marginTop: 5, pointerEvents: 'none' }}>
          {hourMarks.map((mark) => (
            <span
              key={mark.minutes}
              style={{
                position: 'absolute',
                left: `${timelinePercent(mark.minutes, range)}%`,
                transform: 'translateX(-50%)',
                fontSize: 8,
                fontWeight: 600,
                color: t.textSubtle,
                fontFamily: DIAL_FONT,
                whiteSpace: 'nowrap',
              }}
            >
              {mark.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
