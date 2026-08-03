'use client'

import {
  BUSINESS_TIMEZONE_OPTIONS,
  type CanadianBusinessTimezone,
} from '@/lib/business-timezone'

type Props = {
  value: CanadianBusinessTimezone | ''
  onChange: (value: CanadianBusinessTimezone) => void
  id?: string
  required?: boolean
  disabled?: boolean
  hint?: string
  /** light = settings/onboarding; dark = auth signup canvas */
  tone?: 'light' | 'dark'
}

/** Restaurant operating timezone — Canadian IANA zones only. Never browser TZ. */
export function BusinessTimezoneSelect({
  value,
  onChange,
  id = 'business-timezone',
  required = true,
  disabled,
  hint,
  tone = 'light',
}: Props) {
  if (tone === 'dark') {
    return (
      <div style={{ marginBottom: 14 }}>
        <label
          htmlFor={id}
          style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            color: 'rgba(242,247,252,0.40)',
            marginBottom: 7,
          }}
        >
          Restaurant timezone{required ? ' *' : ''}
        </label>
        <select
          id={id}
          required={required}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value as CanadianBusinessTimezone)}
          style={{
            width: '100%',
            borderRadius: 13,
            border: '1px solid rgba(255,255,255,0.10)',
            padding: '13px 14px',
            fontSize: 14.5,
            background: 'rgba(255,255,255,0.035)',
            color: '#f2f7fc',
            outline: 'none',
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <option value="" disabled style={{ color: '#0f172a' }}>
            Confirm your timezone
          </option>
          {BUSINESS_TIMEZONE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ color: '#0f172a' }}>
              {opt.label}
            </option>
          ))}
        </select>
        {hint ? (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgba(242,247,252,0.45)', lineHeight: 1.45 }}>
            {hint}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        Restaurant timezone
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
      <select
        id={id}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value as CanadianBusinessTimezone)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      >
        <option value="" disabled>
          Confirm your timezone
        </option>
        {BUSINESS_TIMEZONE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint ? <p className="text-xs leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  )
}
