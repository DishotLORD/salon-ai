'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { DashboardLogoutButton } from '@/components/dashboard-logout-button'
import { supabase } from '@/lib/supabase'

type BookingStatus = 'confirmed' | 'pending' | 'cancelled'

type WeekBooking = {
  id: string
  customerName: string
  service: string
  staff: string
  status: BookingStatus
  /** 0 = Monday ... 6 = Sunday */
  dayIndex: number
  /** Hour in 24h clock, aligned to calendar rows (9–19) */
  hour: number
  /** Minutes within the hour for display */
  minute: number
}

const navItems = ['Dashboard', 'Chats', 'Calendar', 'Bookings', 'CRM', 'Settings']
const navLinks: Record<string, string> = {
  Dashboard: '/dashboard',
  Chats: '/dashboard/chats',
  Calendar: '/dashboard/bookings',
  Bookings: '/dashboard/bookings',
  CRM: '/dashboard/crm',
  Settings: '/dashboard/settings',
}

function startOfWeekMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay() // 0 Sun ... 6 Sat
  const diff = (day + 6) % 7 // days since Monday
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - diff)
  return d
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatHour(hour: number) {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h12 = ((hour + 11) % 12) + 1
  return `${h12}:00 ${suffix}`
}

function formatTime(hour: number, minute: number) {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h12 = ((hour + 11) % 12) + 1
  const mm = minute.toString().padStart(2, '0')
  return `${h12}:${mm} ${suffix}`
}

function statusStyle(status: BookingStatus) {
  if (status === 'confirmed') {
    return { bg: '#ecfdf5', border: '#bbf7d0', color: '#166534' }
  }
  if (status === 'pending') {
    return { bg: '#fffbeb', border: '#fde68a', color: '#92400e' }
  }
  return { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' }
}

function normalizeStatus(raw: string | null | undefined): BookingStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'confirmed') {
    return 'confirmed'
  }
  if (s === 'cancelled' || s === 'canceled') {
    return 'cancelled'
  }
  return 'pending'
}

type AppointmentRow = {
  id: string
  service_name: string | null
  scheduled_at: string
  status: string | null
  customer_id: string | null
}

function mapRowsToWeekBookings(rows: AppointmentRow[], nameById: Map<string, string>): WeekBooking[] {
  const out: WeekBooking[] = []
  for (const row of rows) {
    const at = new Date(row.scheduled_at)
    if (Number.isNaN(at.getTime())) {
      continue
    }
    const dayIndex = (at.getDay() + 6) % 7
    out.push({
      id: row.id,
      customerName: row.customer_id ? (nameById.get(row.customer_id) ?? 'Customer') : 'Customer',
      service: row.service_name?.trim() ? row.service_name : 'Appointment',
      staff: '—',
      status: normalizeStatus(row.status),
      dayIndex,
      hour: at.getHours(),
      minute: at.getMinutes(),
    })
  }
  out.sort((a, b) => a.dayIndex - b.dayIndex || a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
  return out
}

export default function BookingsPage() {
  const [weekBookings, setWeekBookings] = useState<WeekBooking[]>([])

  const today = new Date()
  const monday = startOfWeekMonday(today)
  const weekDays = Array.from({ length: 7 }).map((_, idx) => addDays(monday, idx))
  const hours = Array.from({ length: 11 }).map((_, idx) => idx + 9) // 9..19

  useEffect(() => {
    let cancelled = false

    async function loadAppointments() {
      const {
        data: { user: userFromGet },
      } = await supabase.auth.getUser()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const user = userFromGet ?? session?.user ?? null

      if (!user) {
        if (!cancelled) {
          setWeekBookings([])
        }
        return
      }

      const { data: business } = await supabase.from('businesses').select('id').eq('user_id', user.id).maybeSingle()

      if (!business?.id) {
        if (!cancelled) {
          setWeekBookings([])
        }
        return
      }

      const weekStart = startOfWeekMonday(new Date())
      weekStart.setHours(0, 0, 0, 0)
      const weekEndExclusive = addDays(weekStart, 7)
      weekEndExclusive.setHours(0, 0, 0, 0)

      const { data: rows, error } = await supabase
        .from('appointments')
        .select('id, service_name, scheduled_at, status, customer_id')
        .eq('business_id', business.id)
        .gte('scheduled_at', weekStart.toISOString())
        .lt('scheduled_at', weekEndExclusive.toISOString())
        .order('scheduled_at', { ascending: true })

      if (error || !rows) {
        if (!cancelled) {
          setWeekBookings([])
        }
        return
      }

      const typed = rows as AppointmentRow[]
      const customerIds = [...new Set(typed.map((r) => r.customer_id).filter((id): id is string => Boolean(id)))]

      const nameById = new Map<string, string>()
      if (customerIds.length > 0) {
        const { data: custs } = await supabase.from('customers').select('id, name').in('id', customerIds)
        for (const c of custs ?? []) {
          if (c.id && c.name != null) {
            nameById.set(String(c.id), String(c.name))
          }
        }
      }

      if (!cancelled) {
        setWeekBookings(mapRowsToWeekBookings(typed, nameById))
      }
    }

    void loadAppointments()

    return () => {
      cancelled = true
    }
  }, [])

  const todayIndex = (today.getDay() + 6) % 7
  const todaysBookings = weekBookings
    .filter((b) => b.dayIndex === todayIndex)
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f3f4f6',
        color: '#111827',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <aside
          style={{
            width: 258,
            background: '#ffffff',
            borderRight: '1px solid #e5e7eb',
            padding: '24px 14px 20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <p
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.24em',
              color: '#ef4444',
              margin: '0 12px 6px',
            }}
          >
            Salon AI
          </p>
          <h2 style={{ margin: '0 12px 24px', fontSize: 20, fontWeight: 700 }}>Operations</h2>
          <nav style={{ display: 'grid', gap: 6 }}>
            {navItems.map((item) => {
              const isActive = item === 'Bookings'
              return (
                <Link
                  key={item}
                  href={navLinks[item] ?? '#'}
                  style={{
                    padding: '11px 13px',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 500,
                    color: isActive ? '#7f1d1d' : '#6b7280',
                    background: isActive ? '#fee2e2' : 'transparent',
                    border: isActive ? '1px solid #fecaca' : '1px solid transparent',
                    textDecoration: 'none',
                  }}
                >
                  {item}
                </Link>
              )
            })}
          </nav>
          <div style={{ marginTop: 'auto', padding: '0 8px', display: 'grid', gap: 10 }}>
            <DashboardLogoutButton />
            <button
              type="button"
              style={{
                width: '100%',
                border: 'none',
                borderRadius: 10,
                background: '#dc2626',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                padding: '11px 14px',
                cursor: 'pointer',
              }}
            >
              Deploy Agent
            </button>
          </div>
        </aside>

        <main style={{ flex: 1, padding: '30px 32px 36px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 30, letterSpacing: '-0.02em' }}>Bookings</h1>
              <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 14 }}>
                Week of {monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
                {addDays(monday, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select
                defaultValue="this-week"
                style={{
                  borderRadius: 10,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  padding: '10px 12px',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <option value="this-week">This week</option>
                <option value="next-week">Next week</option>
                <option value="this-month">This month</option>
              </select>
              <button
                type="button"
                style={{
                  border: 'none',
                  borderRadius: 10,
                  background: '#dc2626',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  padding: '10px 14px',
                  cursor: 'pointer',
                }}
              >
                New Booking
              </button>
            </div>
          </div>

          <section
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: 16,
              padding: 16,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '92px repeat(7, minmax(0, 1fr))',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              <div />
              {weekDays.map((d, idx) => {
                const isToday = d.toDateString() === today.toDateString()
                return (
                  <div
                    key={d.toISOString()}
                    style={{
                      padding: '10px 8px',
                      textAlign: 'center',
                      borderLeft: '1px solid #f3f4f6',
                      background: isToday ? '#fef2f2' : 'transparent',
                    }}
                  >
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][idx]}
                    </div>
                    <div style={{ marginTop: 4, fontWeight: 700, fontSize: 14 }}>{d.getDate()}</div>
                  </div>
                )
              })}
            </div>

            <div style={{ maxHeight: 560, overflow: 'auto' }}>
              {hours.map((hour) => (
                <div
                  key={hour}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '92px repeat(7, minmax(0, 1fr))',
                    borderBottom: '1px solid #f3f4f6',
                    minHeight: 52,
                  }}
                >
                  <div style={{ padding: '10px 10px', color: '#6b7280', fontSize: 12, fontWeight: 600 }}>
                    {formatHour(hour)}
                  </div>
                  {weekDays.map((d, dayIdx) => {
                    const isToday = d.toDateString() === today.toDateString()
                    const booking = weekBookings.find((b) => b.dayIndex === dayIdx && b.hour === hour)
                    return (
                      <div
                        key={`${hour}-${dayIdx}`}
                        style={{
                          borderLeft: '1px solid #f3f4f6',
                          padding: 6,
                          background: isToday ? '#fffafa' : '#ffffff',
                        }}
                      >
                        {booking && (
                          <div
                            style={{
                              borderRadius: 10,
                              border: '1px solid #e5e7eb',
                              background: '#f9fafb',
                              padding: '6px 8px',
                            }}
                          >
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>
                              {booking.customerName}
                            </div>
                            <div style={{ marginTop: 2, fontSize: 11, color: '#6b7280' }}>{booking.service}</div>
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 11,
                                color: '#9ca3af',
                                textTransform: 'capitalize',
                              }}
                            >
                              {formatTime(booking.hour, booking.minute)} · {booking.status}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>

          <section
            style={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: 16,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Today&apos;s bookings</h2>
              <span style={{ color: '#6b7280', fontSize: 13 }}>
                {today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              {todaysBookings.map((booking) => {
                const badge = statusStyle(booking.status)
                return (
                  <div
                    key={booking.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.1fr 1.2fr 0.7fr 0.9fr auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: '12px 12px',
                      borderRadius: 12,
                      border: '1px solid #f3f4f6',
                      background: '#fafafa',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{booking.customerName}</div>
                    <div style={{ color: '#4b5563', fontSize: 14 }}>{booking.service}</div>
                    <div style={{ color: '#6b7280', fontSize: 13, fontWeight: 600 }}>
                      {formatTime(booking.hour, booking.minute)}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 13 }}>{booking.staff}</div>
                    <span
                      style={{
                        justifySelf: 'end',
                        padding: '5px 10px',
                        borderRadius: 999,
                        border: `1px solid ${badge.border}`,
                        background: badge.bg,
                        color: badge.color,
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: 'capitalize',
                      }}
                    >
                      {booking.status}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
