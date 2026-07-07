'use client'

import { useState } from 'react'

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--bk-muted)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(15, 23, 42, 0.1)',
  fontSize: 13,
  boxSizing: 'border-box',
  background: '#fff',
  color: 'var(--bk-head)',
  fontFamily: 'inherit',
}

export type ActivityType = 'pool' | 'tennis' | 'billiard' | 'other'

export type ActivityResource = {
  id: string
  name: string
  type: ActivityType
  active: boolean
}

export const DEFAULT_ACTIVITY_RESOURCES: ActivityResource[] = [
  { id: 'pool-1', name: 'Pool Table 1', type: 'pool', active: true },
  { id: 'pool-2', name: 'Pool Table 2', type: 'pool', active: true },
  { id: 'tennis-1', name: 'Tennis Table', type: 'tennis', active: true },
]

const TYPE_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'pool', label: 'Pool Table' },
  { value: 'tennis', label: 'Tennis / Ping-Pong' },
  { value: 'billiard', label: 'Billiard' },
  { value: 'other', label: 'Other' },
]

function TypeIcon({ type }: { type: ActivityType }) {
  if (type === 'pool' || type === 'billiard') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.1" opacity="0.4" />
        <circle cx="8" cy="8" r="1" fill="currentColor" />
      </svg>
    )
  }
  if (type === 'tennis') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="5.5" width="14" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
        <line x1="8" y1="5.5" x2="8" y2="10.5" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="13" cy="3" r="1.5" fill="currentColor" opacity="0.7" />
        <path d="M13 4.5L11.5 5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export function ActivityResourcesPanel({
  resources,
  onChange,
  disabled,
}: {
  resources: ActivityResource[]
  onChange: (next: ActivityResource[]) => void
  disabled?: boolean
}) {
  const [focusedId, setFocusedId] = useState<string | null>(null)

  function update(id: string, patch: Partial<ActivityResource>) {
    onChange(resources.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function remove(id: string) {
    onChange(resources.filter((r) => r.id !== id))
  }

  function add() {
    onChange([
      ...resources,
      { id: uid(), name: '', type: 'other', active: true },
    ])
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...resources]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onChange(next)
  }

  const rowStyle: React.CSSProperties = {
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 10,
    padding: '12px 14px',
    background: 'var(--bk-surface)',
    display: 'grid',
    gap: 10,
  }

  const actionBtn: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 7,
    border: '1px solid rgba(15,23,42,0.1)',
    background: '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    opacity: disabled ? 0.5 : 1,
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {resources.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--bk-muted)', textAlign: 'center', padding: '12px 0' }}>
          No activities configured — add one below.
        </p>
      )}

      {resources.map((resource, idx) => (
        <div key={resource.id} style={rowStyle}>
          {/* Top row: icon + name + active toggle + reorder + remove */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                background: resource.active ? 'var(--bk-purple-bg)' : 'var(--bk-surface)',
                color: resource.active ? 'var(--bk-purple)' : 'var(--bk-muted)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <TypeIcon type={resource.type} />
            </div>

            <input
              value={resource.name}
              onChange={(e) => update(resource.id, { name: e.target.value })}
              onFocus={() => setFocusedId(resource.id)}
              onBlur={() => setFocusedId(null)}
              placeholder="e.g. Pool Table 1"
              disabled={disabled}
              style={{
                ...inputStyle,
                outline: 'none',
                boxShadow: focusedId === resource.id ? '0 0 0 2px rgba(99,102,241,0.3)' : 'none',
              }}
            />

            {/* Active toggle */}
            <label
              title={resource.active ? 'Active' : 'Inactive'}
              style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
            >
              <input
                type="checkbox"
                checked={resource.active}
                onChange={(e) => update(resource.id, { active: e.target.checked })}
                disabled={disabled}
                style={{ width: 14, height: 14, cursor: 'inherit', accentColor: 'var(--bk-indigo)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--bk-body)', whiteSpace: 'nowrap' }}>Active</span>
            </label>

            {/* Reorder */}
            <button type="button" onClick={() => move(idx, -1)} disabled={disabled || idx === 0} style={{ ...actionBtn, opacity: disabled || idx === 0 ? 0.3 : 1, fontSize: 12, color: 'var(--bk-body)' }}>
              ↑
            </button>
            <button type="button" onClick={() => move(idx, 1)} disabled={disabled || idx === resources.length - 1} style={{ ...actionBtn, opacity: disabled || idx === resources.length - 1 ? 0.3 : 1, fontSize: 12, color: 'var(--bk-body)' }}>
              ↓
            </button>

            {/* Remove */}
            <button
              type="button"
              onClick={() => remove(resource.id)}
              disabled={disabled}
              style={{ ...actionBtn, border: 'none', background: 'var(--bk-danger-bg)', color: 'var(--bk-danger)' }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Type selector */}
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={labelStyle}>Type</span>
            <select
              value={resource.type}
              onChange={(e) => update(resource.id, { type: e.target.value as ActivityType })}
              disabled={disabled}
              style={{ ...inputStyle, cursor: disabled ? 'not-allowed' : 'pointer' }}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        disabled={disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '9px 0',
          borderRadius: 9,
          border: '1.5px dashed rgba(99,102,241,0.35)',
          background: 'transparent',
          color: 'var(--bk-indigo)',
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
          width: '100%',
          opacity: disabled ? 0.5 : 1,
          fontFamily: 'inherit',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        Add Activity
      </button>
    </div>
  )
}
