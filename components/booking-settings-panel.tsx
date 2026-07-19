'use client'

import {
  DEFAULT_BOOKING_SETTINGS,
  type BookingSettings,
} from '@/lib/booking-settings'
import { SettingsToggle } from '@/components/settings-toggle'

const fieldStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--bk-body)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--bk-border)',
  fontSize: 14,
  color: 'var(--bk-head)',
  background: 'var(--bk-card)',
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
      <p style={{ margin: 0, fontSize: 13, color: 'var(--bk-body)', lineHeight: 1.55 }}>
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
        <label style={fieldStyle}>
          <span style={labelStyle}>Minimum notice (min)</span>
          <input
            type="number"
            min={0}
            max={1440}
            step={15}
            disabled={disabled}
            style={inputStyle}
            value={settings.min_notice_minutes}
            onChange={(e) => setNum('min_notice_minutes', e.target.value, 0, 1440)}
          />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Book up to (days ahead)</span>
          <input
            type="number"
            min={1}
            max={365}
            step={1}
            disabled={disabled}
            style={inputStyle}
            value={settings.max_advance_days}
            onChange={(e) => setNum('max_advance_days', e.target.value, 1, 365)}
          />
        </label>
      </div>
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px solid var(--bk-border)',
          background: 'var(--bk-surface)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <SettingsToggle
          checked={settings.require_contact_before_booking}
          disabled={disabled}
          onChange={(requireContact) =>
            onChange({ ...settings, require_contact_before_booking: requireContact })
          }
          ariaLabel="Require guest contact before booking"
        />
        <span style={{ display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--bk-head)' }}>
            Require contact before booking
          </span>
          <span style={{ fontSize: 12, color: 'var(--bk-body)', lineHeight: 1.5 }}>
            The AI concierge must collect a phone number or email before confirming a
            reservation — so you can send confirmations and recognize returning guests.
          </span>
        </span>
      </label>
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
          border: '1px solid var(--bk-border-strong)',
          background: 'var(--bk-surface)',
          color: 'var(--bk-text)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        Reset to defaults
      </button>
    </div>
  )
}
