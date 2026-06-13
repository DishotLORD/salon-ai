'use client'

import { useState } from 'react'

import {
  ZONE_PRESETS,
  defaultMainDiningZone,
  slugifyZoneName,
  type DiningZone,
} from '@/lib/dining-zones'
import type { BookingSettings } from '@/lib/booking-settings'

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#94a3b8',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(15, 23, 42, 0.1)',
  fontSize: 13,
  boxSizing: 'border-box',
}

export type DiningZoneDraft = Omit<DiningZone, 'id' | 'business_id'> & {
  id?: string
  business_id?: string
  _localKey?: string
}

function newZoneDraft(settings: BookingSettings, sortOrder: number): DiningZoneDraft {
  const base = defaultMainDiningZone('', settings)
  return {
    _localKey: `new-${Date.now()}`,
    name: 'Patio',
    slug: 'patio',
    max_concurrent_parties: 150,
    min_party_size: base.min_party_size,
    max_party_size: base.max_party_size,
    turnover_minutes: 70,
    is_active: true,
    sort_order: sortOrder,
  }
}

export type DiningZonesPanelProps = {
  zones: DiningZoneDraft[]
  bookingSettings: BookingSettings
  onChange: (zones: DiningZoneDraft[]) => void
  disabled?: boolean
}

export function DiningZonesPanel({
  zones,
  bookingSettings,
  onChange,
  disabled,
}: DiningZonesPanelProps) {
  const [presetOpen, setPresetOpen] = useState(false)

  const updateAt = (index: number, patch: Partial<DiningZoneDraft>) => {
    const next = zones.map((z, i) => (i === index ? { ...z, ...patch } : z))
    onChange(next)
  }

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= zones.length) return
    const next = [...zones]
    const tmp = next[index]
    next[index] = next[j]
    next[j] = tmp
    onChange(next.map((z, i) => ({ ...z, sort_order: i })))
  }

  const removeAt = (index: number) => {
    if (zones.length <= 1) return
    onChange(zones.filter((_, i) => i !== index).map((z, i) => ({ ...z, sort_order: i })))
  }

  const addPreset = (name: string, slug: string) => {
    const base = defaultMainDiningZone('', bookingSettings)
    onChange([
      ...zones,
      {
        _localKey: `new-${Date.now()}`,
        name,
        slug,
        max_concurrent_parties: slug === 'main-dining' ? 150 : 60,
        min_party_size: slug === 'large-groups' ? 8 : base.min_party_size,
        max_party_size: slug === 'large-groups' ? 20 : base.max_party_size,
        turnover_minutes: slug === 'large-groups' ? 120 : 70,
        is_active: true,
        sort_order: zones.length,
      },
    ])
    setPresetOpen(false)
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.55 }}>
        Smart zones replace a floor plan. Each zone has its own guest capacity (covers) and average stay time.
        Deactivate a zone instead of deleting it if it has past bookings.
      </p>

      {zones.map((zone, index) => (
        <div
          key={zone.id ?? zone._localKey ?? index}
          style={{
            padding: 14,
            borderRadius: 12,
            border: '1px solid rgba(15, 23, 42, 0.08)',
            background: zone.is_active ? '#fff' : '#f8fafc',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              disabled={disabled}
              style={{ ...inputStyle, flex: '1 1 140px', fontWeight: 600 }}
              value={zone.name}
              onChange={(e) => {
                const name = e.target.value
                updateAt(index, { name, slug: slugifyZoneName(name) })
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
              <input
                type="checkbox"
                checked={zone.is_active}
                disabled={disabled}
                onChange={(e) => updateAt(index, { is_active: e.target.checked })}
              />
              Active
            </label>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              <button
                type="button"
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
                style={iconBtn}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={disabled || index === zones.length - 1}
                onClick={() => move(index, 1)}
                style={iconBtn}
              >
                ↓
              </button>
              <button
                type="button"
                disabled={disabled || zones.length <= 1}
                onClick={() => removeAt(index)}
                style={{ ...iconBtn, color: '#b91c1c' }}
              >
                Remove
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 10,
            }}
          >
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={labelStyle}>Capacity (guests)</span>
              <input
                type="number"
                min={1}
                disabled={disabled}
                style={inputStyle}
                value={zone.max_concurrent_parties || ''}
                onChange={(e) => {
                  const raw = e.target.value
                  if (raw === '') {
                    // Allow the owner to clear the field while typing; validation happens on save.
                    updateAt(index, { max_concurrent_parties: 0 as number })
                    return
                  }
                  const next = parseInt(raw, 10)
                  if (Number.isNaN(next)) return
                  updateAt(index, { max_concurrent_parties: Math.max(1, next) })
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={labelStyle}>Avg stay (min)</span>
              <input
                type="number"
                min={15}
                step={15}
                disabled={disabled}
                style={inputStyle}
                value={zone.turnover_minutes}
                onChange={(e) =>
                  updateAt(index, {
                    turnover_minutes: Math.max(15, parseInt(e.target.value, 10) || 70),
                  })
                }
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={labelStyle}>Min party</span>
              <input
                type="number"
                min={1}
                disabled={disabled}
                style={inputStyle}
                value={zone.min_party_size}
                onChange={(e) =>
                  updateAt(index, {
                    min_party_size: Math.max(1, parseInt(e.target.value, 10) || 1),
                  })
                }
              />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={labelStyle}>Max party</span>
              <input
                type="number"
                min={1}
                disabled={disabled}
                style={inputStyle}
                value={zone.max_party_size}
                onChange={(e) =>
                  updateAt(index, {
                    max_party_size: Math.max(1, parseInt(e.target.value, 10) || 12),
                  })
                }
              />
            </label>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...zones, newZoneDraft(bookingSettings, zones.length)])}
          style={primaryBtn}
        >
          + Add zone
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPresetOpen((v) => !v)}
          style={secondaryBtn}
        >
          Add from preset
        </button>
      </div>

      {presetOpen && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ZONE_PRESETS.filter((p) => !zones.some((z) => z.slug === p.slug)).map((p) => (
            <button
              key={p.slug}
              type="button"
              disabled={disabled}
              onClick={() => addPreset(p.name, p.slug)}
              style={secondaryBtn}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 6,
  border: '1px solid rgba(15, 23, 42, 0.1)',
  background: '#fff',
  cursor: 'pointer',
}

const primaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  border: 'none',
  background: '#0f172a',
  color: '#fff',
  cursor: 'pointer',
}

const secondaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid rgba(15, 23, 42, 0.12)',
  background: '#fff',
  color: '#334155',
  cursor: 'pointer',
}
