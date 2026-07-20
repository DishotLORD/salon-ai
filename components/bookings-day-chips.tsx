'use client'

import type { CSSProperties } from 'react'

import type { Reservation, ResStatus } from '@/components/reservation-card'
import { formatCalgaryTime } from '@/lib/booking-wall-clock'
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
  return formatCalgaryTime(d)
}

export type BookingsDayChipsProps = {
  date: Date
  reservations: Reservation[]
  loading: boolean
  statusColors: Record<ResStatus, { bg: string; color: string }>
  onEdit: (r: Reservation) => void
  onAdd: () => void
}

export function BookingsDayEmptyStrip({
  date,
  onAdd,
}: {
  date: Date
  onAdd: () => void
}) {
  const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '10px 12px',
        borderRadius: bk.radiusSm,
        background: 'var(--bk-surface)',
        border: bk.border,
        fontFamily: bk.font,
      }}
    >
      <span style={{ fontSize: bk.caption, color: 'var(--bk-body)', fontWeight: 500 }}>
        No bookings on {label}
      </span>
      <button
        type="button"
        onClick={onAdd}
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          border: 'none',
          background: 'var(--bk-inverse)',
          color: 'var(--bk-inverse-text)',
          fontSize: bk.micro,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        + Add
      </button>
    </div>
  )
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
    background: 'var(--bk-surface)',
    border: bk.border,
    fontFamily: bk.font,
  }

  if (loading) {
    return (
      <div style={row} aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ height: 24, width: 100, borderRadius: 999, background: 'var(--bk-surface-2)' }} />
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
              background: 'var(--bk-card)',
              color: 'var(--bk-head)',
              fontSize: bk.micro,
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: 'var(--bk-shadow)',
              maxWidth: '100%',
            }}
          >
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {fmtTime(r.scheduledAt)}
            </span>
            <span style={{ color: 'var(--bk-border-strong)' }}>|</span>
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
            <span style={{ color: 'var(--bk-muted)', fontSize: 10 }}>{r.partySize}p</span>
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
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--bk-body)' }}>+{more} more</span>
      )}
      <button
        type="button"
        onClick={onAdd}
        style={{
          marginLeft: 'auto',
          padding: '6px 12px',
          borderRadius: 999,
          border: '1px dashed var(--bk-border-strong)',
          background: 'transparent',
          color: 'var(--bk-body)',
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
