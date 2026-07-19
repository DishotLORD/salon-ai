'use client'

import { useState } from 'react'

export function SettingsToggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  ariaLabel: string
}) {
  const [focused, setFocused] = useState(false)

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: 40,
        height: 23,
        flexShrink: 0,
        borderRadius: 999,
        background: checked ? 'linear-gradient(135deg, #38bdf8, #0ea5e9)' : 'var(--bk-surface-2)',
        border: `1px solid ${checked ? 'rgba(2,132,199,0.45)' : 'var(--bk-border-strong)'}`,
        boxShadow: focused
          ? '0 0 0 3px rgba(56,189,248,0.2)'
          : checked
            ? '0 4px 10px rgba(14,165,233,0.18)'
            : 'inset 0 1px 2px rgba(15,23,42,0.06)',
        opacity: disabled ? 0.55 : 1,
        transition: 'background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
      }}
    >
      <input
        type="checkbox"
        role="switch"
        aria-label={ariaLabel}
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          opacity: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          zIndex: 1,
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 17,
          height: 17,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 2px 5px rgba(15,23,42,0.22)',
          transform: checked ? 'translateX(17px)' : 'translateX(0)',
          transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </span>
  )
}
