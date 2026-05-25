'use client'

import { useState } from 'react'

import { TimeRangeDial } from '@/components/time-range-dial'
import { t } from '@/lib/dashboard-theme'
import { DAY_ORDER, type DayKey, type DayHours, type OperatingHours } from '@/lib/operating-hours'
import { formatCompactTime } from '@/lib/time-timeline'

const PANEL_FONT = 'var(--font-plus-jakarta, system-ui, sans-serif)'

const WEEKDAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri']

function dayPreview(row: DayHours): string {
  if (row.closed) return 'Closed'
  return `${formatCompactTime(row.open)}–${formatCompactTime(row.close)}`
}

export type WorkingHoursPanelProps = {
  hours: OperatingHours
  onChange: (hours: OperatingHours) => void
  reduceMotion: boolean | null
}

export function WorkingHoursPanel({ hours, onChange, reduceMotion: _reduceMotion }: WorkingHoursPanelProps) {
  const [selectedDay, setSelectedDay] = useState<DayKey>('mon')
  const row = hours[selectedDay]

  const updateDay = (patch: Partial<DayHours>) => {
    onChange({
      ...hours,
      [selectedDay]: { ...hours[selectedDay], ...patch },
    })
  }

  const copyToWeekdays = () => {
    const template = hours[selectedDay]
    const next = { ...hours }
    for (const key of WEEKDAY_KEYS) {
      next[key] = { ...template }
    }
    onChange(next)
  }

  const copyToAllDays = () => {
    const template = hours[selectedDay]
    const next = { ...hours }
    for (const { key } of DAY_ORDER) {
      next[key] = { ...template }
    }
    onChange(next)
  }

  const actionBtnStyle = {
    border: `1px solid ${t.border}`,
    borderRadius: 8,
    padding: '6px 10px',
    background: t.bgSurface,
    color: t.textMuted,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: PANEL_FONT,
  } as const

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        {DAY_ORDER.map(({ key, short }) => {
          const active = selectedDay === key
          const preview = dayPreview(hours[key])
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDay(key)}
              style={{
                border: `1px solid ${active ? t.accent : t.borderSoft}`,
                borderRadius: 10,
                padding: '8px 10px',
                minWidth: 72,
                background: active ? t.accentSoftBg : t.bgSurface,
                cursor: 'pointer',
                fontFamily: PANEL_FONT,
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  color: active ? t.accent : t.text,
                }}
              >
                {short}
              </span>
              <span
                style={{
                  display: 'block',
                  marginTop: 2,
                  fontSize: 10,
                  color: t.textMuted,
                  whiteSpace: 'nowrap',
                }}
              >
                {preview}
              </span>
            </button>
          )
        })}
      </div>

      <div
        style={{
          borderRadius: 10,
          border: `1px solid ${t.borderSoft}`,
          background: t.bgSurfaceMuted,
          padding: 14,
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: t.text, fontFamily: PANEL_FONT }}>
            {DAY_ORDER.find((d) => d.key === selectedDay)?.label}
          </span>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: t.textMuted,
              fontFamily: PANEL_FONT,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={row.closed}
              onChange={(e) => updateDay({ closed: e.target.checked })}
            />
            Closed
          </label>
        </div>

        <TimeRangeDial
          open={row.open}
          close={row.close}
          disabled={row.closed}
          onChange={(open, close) => updateDay({ open, close })}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={copyToWeekdays} style={actionBtnStyle}>
            Copy to weekdays
          </button>
          <button type="button" onClick={copyToAllDays} style={actionBtnStyle}>
            Apply to all days
          </button>
        </div>
      </div>
    </div>
  )
}
