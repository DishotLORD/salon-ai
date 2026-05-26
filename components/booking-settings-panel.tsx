'use client'

import {
  DEFAULT_BOOKING_SETTINGS,
  type BookingSettings,
} from '@/lib/booking-settings'

const fieldStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#64748b',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid rgba(15, 23, 42, 0.1)',
  fontSize: 14,
  color: '#0f172a',
  background: '#fff',
  boxSizing: 'border-box',
}

export type BookingSettingsPanelProps = {
  settings: BookingSettings
  onChange: (settings: BookingSettings) => void
  disabled?: boolean
}

export function BookingSettingsPanel({
  settings,
  onChange,
  disabled,
}: BookingSettingsPanelProps) {
  const setNum = (key: keyof BookingSettings, raw: string, min: number, max: number) => {
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n)) return
    onChange({ ...settings, [key]: Math.min(max, Math.max(min, n)) })
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.55 }}>
        Global defaults used when no dining zone is selected. The AI concierge and manual
        bookings use these limits together with your zones.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
        }}
      >
        <label style={fieldStyle}>
          <span style={labelStyle}>Default table turn (min)</span>
          <input
            type="number"
            min={15}
            max={240}
            step={15}
            disabled={disabled}
            style={inputStyle}
            value={settings.default_duration_minutes}
            onChange={(e) => setNum('default_duration_minutes', e.target.value, 15, 240)}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Max overlapping reservations</span>
          <input
            type="number"
            min={1}
            max={99}
            disabled={disabled}
            style={inputStyle}
            value={settings.max_concurrent_reservations}
            onChange={(e) => setNum('max_concurrent_reservations', e.target.value, 1, 99)}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Slot interval (min)</span>
          <input
            type="number"
            min={5}
            max={60}
            step={5}
            disabled={disabled}
            style={inputStyle}
            value={settings.slot_interval_minutes}
            onChange={(e) => setNum('slot_interval_minutes', e.target.value, 5, 60)}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ ...DEFAULT_BOOKING_SETTINGS })}
        style={{
          justifySelf: 'start',
          padding: '8px 14px',
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 8,
          border: '1px solid rgba(15, 23, 42, 0.12)',
          background: '#f8fafc',
          color: '#475569',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        Reset to defaults
      </button>
    </div>
  )
}
