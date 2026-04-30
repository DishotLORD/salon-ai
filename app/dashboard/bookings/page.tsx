'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { oceanTransition } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'

type BookingStatus = 'confirmed' | 'pending' | 'cancelled'

type WeekBooking = {
  id: string
  customerName: string
  service: string
  staff: string
  status: BookingStatus
  dayIndex: number
  hour: number
  minute: number
}

type AppointmentRow = {
  id: string
  service_name: string | null
  scheduled_at: string
  status: string | null
  customer_id: string | null
}

const shellCard = {
  background: 'rgba(8,20,40,0.5)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
}

function startOfWeekMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day + 6) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - diff)
  return d
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function formatTime(hour: number, minute: number) {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const h12 = ((hour + 11) % 12) + 1
  const mm = minute.toString().padStart(2, '0')
  return `${h12}:${mm} ${suffix}`
}

function normalizeStatus(raw: string | null | undefined): BookingStatus {
  const status = (raw ?? '').toLowerCase()
  if (status === 'confirmed') {
    return 'confirmed'
  }
  if (status === 'cancelled' || status === 'canceled') {
    return 'cancelled'
  }
  return 'pending'
}

function statusStyle(status: BookingStatus) {
  if (status === 'confirmed') {
    return {
      bg: 'rgba(74,222,128,0.12)',
      border: 'rgba(74,222,128,0.3)',
      color: '#4ade80',
    }
  }
  if (status === 'pending') {
    return {
      bg: 'rgba(251,191,36,0.12)',
      border: 'rgba(251,191,36,0.3)',
      color: '#fbbf24',
    }
  }
  return {
    bg: 'rgba(248,113,113,0.12)',
    border: 'rgba(248,113,113,0.3)',
    color: '#f87171',
  }
}

function mapRowsToWeekBookings(rows: AppointmentRow[], nameById: Map<string, string>): WeekBooking[] {
  const out: WeekBooking[] = []
  for (const row of rows) {
    const at = new Date(row.scheduled_at)
    if (Number.isNaN(at.getTime())) {
      continue
    }
    out.push({
      id: row.id,
      customerName: row.customer_id ? (nameById.get(row.customer_id) ?? 'Customer') : 'Customer',
      service: row.service_name?.trim() ? row.service_name : 'Appointment',
      staff: '—',
      status: normalizeStatus(row.status),
      dayIndex: (at.getDay() + 6) % 7,
      hour: at.getHours(),
      minute: at.getMinutes(),
    })
  }
  out.sort((a, b) => a.dayIndex - b.dayIndex || a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
  return out
}

export default function BookingsPage() {
  const [weekBookings, setWeekBookings] = useState<WeekBooking[]>([])
  const reduceMotion = useReducedMotion()

  const today = new Date()
  const monday = startOfWeekMonday(today)
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(monday, index))

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
      const customerIds = [...new Set(typed.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))]

      const nameById = new Map<string, string>()
      if (customerIds.length > 0) {
        const { data: customers } = await supabase.from('customers').select('id, name').in('id', customerIds)
        for (const customer of customers ?? []) {
          if (customer.id && customer.name != null) {
            nameById.set(String(customer.id), String(customer.name))
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

  return (
    <DashboardOceanNav activeNav="Bookings">
      {({ isMobile, openNav }) => (
        <main style={{ display: 'grid', gap: 20 }}>
          {isMobile ? (
            <motion.button
              type="button"
              onClick={openNav}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(5,20,40,0.5)',
                color: 'white',
                fontSize: 22,
                cursor: 'pointer',
              }}
            >
              ☰
            </motion.button>
          ) : null}

          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={oceanTransition(reduceMotion, { duration: 0.24 })}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 16,
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  color: 'white',
                  fontSize: 32,
                  fontWeight: 700,
                  fontFamily: 'var(--font-playfair)',
                  letterSpacing: '-0.03em',
                }}
              >
                Bookings
              </h1>
              <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.42)', fontSize: 14 }}>
                Week of {monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} to{' '}
                {addDays(monday, 6).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div
                style={{
                  ...shellCard,
                  borderRadius: 16,
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <button
                  type="button"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                  }}
                >
                  ←
                </button>
                <button
                  type="button"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                  }}
                >
                  →
                </button>
              </div>
              <motion.button
                type="button"
                whileHover={reduceMotion ? undefined : { y: -2 }}
                whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                style={{
                  border: 'none',
                  borderRadius: 16,
                  padding: '12px 16px',
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 700,
                  boxShadow: '0 10px 28px rgba(14,165,233,0.28)',
                  cursor: 'pointer',
                }}
              >
                Add Booking
              </motion.button>
            </div>
          </motion.section>

          {isMobile ? (
            <div style={{ display: 'grid', gap: 14 }}>
              {weekDays.map((day, index) => {
                const dayBookings = weekBookings.filter((booking) => booking.dayIndex === index)

                return (
                  <motion.section
                    key={day.toISOString()}
                    initial={{ opacity: 0, scale: 0.97, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={oceanTransition(reduceMotion, { delay: index * 0.04, duration: 0.2 })}
                    style={{ ...shellCard, padding: 16 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>
                        {day.toLocaleDateString(undefined, { weekday: 'long' })}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12 }}>
                        {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    </div>

                    <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                      {dayBookings.length === 0 ? (
                        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>No bookings scheduled.</div>
                      ) : (
                        dayBookings.map((booking) => {
                          const status = statusStyle(booking.status)
                          return (
                            <div
                              key={booking.id}
                              style={{
                                borderRadius: 16,
                                padding: 14,
                                background: 'rgba(8,20,40,0.4)',
                                border: '1px solid rgba(255,255,255,0.07)',
                              }}
                            >
                              <div style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>
                                {formatTime(booking.hour, booking.minute)} • {booking.customerName}
                              </div>
                              <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.62)', fontSize: 12 }}>
                                {booking.service}
                              </div>
                              <span
                                style={{
                                  display: 'inline-block',
                                  marginTop: 10,
                                  padding: '5px 8px',
                                  borderRadius: 999,
                                  border: `1px solid ${status.border}`,
                                  background: status.bg,
                                  color: status.color,
                                  fontSize: 10,
                                  fontWeight: 700,
                                }}
                              >
                                {booking.status}
                              </span>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </motion.section>
                )
              })}
            </div>
          ) : (
            <motion.section
              initial={{ opacity: 0, scale: 0.98, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={oceanTransition(reduceMotion, { delay: 0.06, duration: 0.24 })}
              style={{
                ...shellCard,
                padding: 16,
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: 12,
                alignItems: 'start',
              }}
            >
              {weekDays.map((day, index) => {
                const dayBookings = weekBookings.filter((booking) => booking.dayIndex === index)
                const isToday = index === (today.getDay() + 6) % 7

                return (
                  <div
                    key={day.toISOString()}
                    style={{
                      minHeight: 520,
                      borderRadius: 16,
                      padding: 14,
                      background: 'rgba(8,20,40,0.4)',
                      border: isToday ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.07)',
                      display: 'grid',
                      alignContent: 'start',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                        {day.toLocaleDateString(undefined, { weekday: 'short' })}
                      </div>
                      <div style={{ marginTop: 6, color: 'white', fontSize: 22, fontWeight: 700 }}>
                        {day.getDate()}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      {dayBookings.length === 0 ? (
                        <div
                          style={{
                            borderRadius: 14,
                            border: '1px dashed rgba(255,255,255,0.08)',
                            padding: 14,
                            color: 'rgba(255,255,255,0.32)',
                            fontSize: 12,
                          }}
                        >
                          Open availability
                        </div>
                      ) : (
                        dayBookings.map((booking) => {
                          const status = statusStyle(booking.status)
                          return (
                            <div
                              key={booking.id}
                              style={{
                                borderRadius: 16,
                                padding: 12,
                                background: 'rgba(8,20,40,0.4)',
                                border: '1px solid rgba(255,255,255,0.07)',
                              }}
                            >
                              <div style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>
                                {formatTime(booking.hour, booking.minute)}
                              </div>
                              <div style={{ marginTop: 5, color: 'white', fontSize: 13, fontWeight: 600 }}>
                                {booking.customerName}
                              </div>
                              <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.58)', fontSize: 12 }}>
                                {booking.service}
                              </div>
                              <span
                                style={{
                                  display: 'inline-block',
                                  marginTop: 10,
                                  padding: '5px 8px',
                                  borderRadius: 999,
                                  border: `1px solid ${status.border}`,
                                  background: status.bg,
                                  color: status.color,
                                  fontSize: 10,
                                  fontWeight: 700,
                                }}
                              >
                                {booking.status}
                              </span>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </motion.section>
          )}
        </main>
      )}
    </DashboardOceanNav>
  )
}
