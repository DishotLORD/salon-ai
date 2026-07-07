'use client'

import { useCallback, useEffect, useState } from 'react'

import { bk, bkCard } from '@/lib/bookings-compact-ui'
import { supabase } from '@/lib/supabase'
import { wallClockInCalgaryToUtcDate } from '@/lib/booking-wall-clock'

export const WAITLIST_MIGRATION_HINT =
  'To enable the waitlist, run supabase/migrations/015_waitlist.sql in Supabase Dashboard → SQL Editor, then reload this page.'

type WaitlistEntry = {
  id: string
  customer_id: string | null
  guest_name: string
  phone: string | null
  email: string | null
  requested_date: string
  requested_time: string
  party_size: number
  zone_id: string | null
  status: 'waiting' | 'contacted' | 'converted' | 'cancelled'
  notes: string | null
}

type WaitlistPanelProps = {
  businessId: string
  zoneNameById: Map<string, string>
  /** Called after an entry is converted into a reservation so the calendar refreshes. */
  onConverted?: () => void
}

function isWaitlistSchemaError(message: string | undefined): boolean {
  return Boolean(message && message.toLowerCase().includes('waitlist_entries'))
}

function fmtTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h)) return hhmm
  const period = h < 12 ? 'AM' : 'PM'
  const dh = h % 12 === 0 ? 12 : h % 12
  return `${dh}:${String(m ?? 0).padStart(2, '0')} ${period}`
}

function fmtDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

const STATUS_STYLE: Record<'waiting' | 'contacted', { bg: string; color: string; label: string }> = {
  waiting: { bg: 'rgba(245,158,11,0.12)', color: 'var(--bk-amber)', label: 'Waiting' },
  contacted: { bg: 'rgba(14,165,233,0.12)', color: 'var(--bk-accent)', label: 'Contacted' },
}

export function WaitlistPanel({ businessId, zoneNameById, onConverted }: WaitlistPanelProps) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [schemaReady, setSchemaReady] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const todayKey = new Date().toISOString().slice(0, 10)
    const { data, error: err } = await supabase
      .from('waitlist_entries')
      .select('id, customer_id, guest_name, phone, email, requested_date, requested_time, party_size, zone_id, status, notes')
      .eq('business_id', businessId)
      .in('status', ['waiting', 'contacted'])
      .gte('requested_date', todayKey)
      .order('requested_date', { ascending: true })
      .order('requested_time', { ascending: true })
    if (err) {
      if (isWaitlistSchemaError(err.message)) setSchemaReady(false)
      setEntries([])
    } else {
      setSchemaReady(true)
      setEntries((data ?? []) as WaitlistEntry[])
    }
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch syncs external Supabase state
    void load()
  }, [load])

  const setStatus = async (id: string, status: WaitlistEntry['status']) => {
    setBusyId(id)
    setError(null)
    const { error: err } = await supabase
      .from('waitlist_entries')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    setBusyId(null)
    if (err) {
      setError(err.message)
      return
    }
    await load()
  }

  const convert = async (entry: WaitlistEntry) => {
    setBusyId(entry.id)
    setError(null)
    const wallClock = `${entry.requested_date}T${entry.requested_time.padStart(5, '0')}:00`
    const scheduledAtIso = wallClockInCalgaryToUtcDate(wallClock).toISOString()
    const { error: insertErr } = await supabase.from('appointments').insert({
      business_id: businessId,
      customer_id: entry.customer_id,
      service_name: `${entry.guest_name} · Party of ${entry.party_size}`,
      scheduled_at: scheduledAtIso,
      status: 'pending',
      notes: entry.notes,
      party_size: entry.party_size,
      zone_id: entry.zone_id,
    })
    if (insertErr) {
      setBusyId(null)
      setError(insertErr.message)
      return
    }
    await supabase
      .from('waitlist_entries')
      .update({ status: 'converted', updated_at: new Date().toISOString() })
      .eq('id', entry.id)
    setBusyId(null)
    await load()
    onConverted?.()
  }

  if (!schemaReady || (!loading && entries.length === 0)) {
    // Hide entirely when empty — the waitlist earns space only when it has guests.
    return null
  }

  return (
    <section style={{ ...bkCard, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: bk.title, fontWeight: 700, color: 'var(--bk-head)' }}>
          Waitlist
        </h2>
        <span style={{ fontSize: bk.caption, color: 'var(--bk-muted)' }}>
          {entries.length} waiting guest{entries.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && <div style={{ fontSize: bk.caption, color: 'var(--bk-danger)', marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'grid', gap: 8 }}>
        {entries.map((entry) => {
          const st = STATUS_STYLE[entry.status === 'contacted' ? 'contacted' : 'waiting']
          const zoneName = entry.zone_id ? zoneNameById.get(entry.zone_id) : null
          const busy = busyId === entry.id
          return (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 10,
                border: bk.border,
                background: 'var(--bk-surface)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <div style={{ fontSize: bk.body, fontWeight: 700, color: 'var(--bk-head)' }}>
                  {entry.guest_name}
                  <span style={{ fontWeight: 500, color: 'var(--bk-body)' }}> · {entry.party_size} guests</span>
                  {zoneName && <span style={{ fontWeight: 500, color: 'var(--bk-body)' }}> · {zoneName}</span>}
                </div>
                <div style={{ fontSize: bk.caption, color: 'var(--bk-body)', marginTop: 2 }}>
                  {fmtDateLabel(entry.requested_date)} at {fmtTimeLabel(entry.requested_time)}
                  {(entry.phone || entry.email) && ` · ${entry.phone || entry.email}`}
                </div>
              </div>

              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: st.bg,
                  color: st.color,
                }}
              >
                {st.label}
              </span>

              <div style={{ display: 'flex', gap: 6 }}>
                {entry.status === 'waiting' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setStatus(entry.id, 'contacted')}
                    style={{
                      border: bk.border,
                      borderRadius: 8,
                      padding: '6px 10px',
                      background: 'var(--bk-card)',
                      color: 'var(--bk-head)',
                      fontSize: bk.caption,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Mark contacted
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void convert(entry)}
                  style={{
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 10px',
                    background: 'var(--bk-inverse)',
                    color: 'var(--bk-inverse-text)',
                    fontSize: bk.caption,
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {busy ? 'Working…' : 'Book table'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove ${entry.guest_name} from waitlist`}
                  onClick={() => void setStatus(entry.id, 'cancelled')}
                  style={{
                    border: bk.border,
                    borderRadius: 8,
                    width: 28,
                    background: 'var(--bk-card)',
                    color: 'var(--bk-muted)',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
