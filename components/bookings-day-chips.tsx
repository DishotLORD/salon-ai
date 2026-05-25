'use client'

import type { CSSProperties } from 'react'

import type { Reservation, ResStatus } from '@/components/reservation-card'
import { bk } from '@/lib/bookings-compact-ui'
const MAX_VISIBLE = 6

const STATUS_LABEL: Record<ResStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  seated: 'Seated',
  cancelled: 'Cancelled',
  'no-show': 'No-show',
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export type BookingsDayChipsProps = {
  date: Date
  reservations: Reservation[]
  loading: boolean
  statusColors: Record<ResStatus, { bg: string; color: string }>
  onEdit: (r: Reservation) => void
  onAdd: () => void
}

export function BookingsDayChips({
  reservations,
  loading,
  statusColors,
  onEdit,
  onAdd,
}: BookingsDayChipsProps) {
  const sorted = [...reservations].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  const visible = sorted.slice(0, MAX_VISIBLE)
  const more = sorted.length - visible.length

  if (!loading && sorted.length === 0) {
    return null
  }

  const row: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    padding: '8px 10px',
    borderRadius: bk.radiusSm,
    background: '#f8fafc',
    border: bk.border,
    fontFamily: bk.font,
  }

  if (loading) {
    return (
      <div style={row} aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ height: 24, width: 100, borderRadius: 999, background: '#e2e8f0' }} />
        ))}
      </div>
    )
  }

  return (
    <div style={row}>
      {visible.map((r) => {
        const sc = statusColors[r.status]
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onEdit(r)}
            title={`Edit ${r.guestName}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 9px',
              borderRadius: 999,
              border: `1px solid ${sc.color}33`,
              background: '#ffffff',
              color: '#0f172a',
              fontSize: bk.micro,
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              maxWidth: '100%',
            }}
          >
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {fmtTime(r.scheduledAt)}
            </span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 100,
              }}
            >
              {r.guestName}
            </span>
            <span style={{ color: '#94a3b8', fontSize: 10 }}>{r.partySize}p</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: sc.color,
              }}
            >
              {STATUS_LABEL[r.status]}
            </span>
          </button>
        )
      })}
      {more > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>+{more} more</span>
      )}
      <button
        type="button"
        onClick={onAdd}
        style={{
          marginLeft: 'auto',
          padding: '6px 12px',
          borderRadius: 999,
          border: '1px dashed #cbd5e1',
          background: 'transparent',
          color: '#64748b',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        + Add
      </button>
    </div>
  )
}
