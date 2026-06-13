import type { Reservation } from '@/components/reservation-card'
import { formatCalgaryTime, isSameCalgaryCalendarDay } from '@/lib/booking-wall-clock'

export type KpiScope = 'day' | 'today' | 'month'

export type BookingKpi = {
  scope: KpiScope
  label: string
  card1Label: string
  totalCount: number
  upcomingCount: number
  nextUpcomingTime: string | null
  nextUpcomingId: string | null
  confirmedCount: number
  confirmedPct: number
  cancelledCount: number
  covers: number
  pendingCount: number
  subtitle1: string
  subtitle2: string
  subtitle4: string
}

function isSameDay(a: Date, b: Date) {
  return isSameCalgaryCalendarDay(a, b)
}

export function isInDisplayMonth(d: Date, displayMonth: Date) {
  return d.getFullYear() === displayMonth.getFullYear() && d.getMonth() === displayMonth.getMonth()
}

function fmtTime(d: Date) {
  return formatCalgaryTime(d)
}

export function computeBookingKpi(
  reservations: Reservation[],
  opts: {
    selectedDay: Date | null
    monthOffset: number
    today: Date
    displayMonth: Date
  },
): BookingKpi {
  const { selectedDay, monthOffset, today, displayMonth } = opts
  const now = new Date()

  let scope: KpiScope
  let pool: Reservation[]
  let card1Label: string

  if (selectedDay) {
    scope = 'day'
    pool = reservations.filter((r) => isSameDay(r.scheduledAt, selectedDay))
    card1Label = selectedDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } else if (monthOffset === 0) {
    scope = 'today'
    pool = reservations.filter((r) => isSameDay(r.scheduledAt, today))
    card1Label = 'Today'
  } else {
    scope = 'month'
    pool = reservations.filter((r) => isInDisplayMonth(r.scheduledAt, displayMonth))
    card1Label = displayMonth.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  }

  const totalCount = pool.length
  const upcomingList = pool
    .filter(
      (r) => r.scheduledAt > now && r.status !== 'cancelled' && r.status !== 'no-show',
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
  const upcomingCount = upcomingList.length
  const nextUpcomingTime =
    upcomingList.length > 0 ? fmtTime(upcomingList[0].scheduledAt) : null
  const nextUpcomingId = upcomingList.length > 0 ? upcomingList[0].id : null
  const confirmedCount = pool.filter((r) => r.status === 'confirmed').length
  const confirmedPct = totalCount > 0 ? Math.round((confirmedCount / totalCount) * 100) : 0
  const cancelledCount = pool.filter((r) => r.status === 'cancelled').length
  const covers = pool
    .filter((r) => r.status !== 'cancelled' && r.status !== 'no-show')
    .reduce((s, r) => s + r.partySize, 0)
  const pendingCount = pool.filter((r) => r.status === 'pending').length

  let subtitle1: string
  if (scope === 'today') {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayCount = reservations.filter((r) =>
      isSameDay(r.scheduledAt, yesterday),
    ).length
    if (yesterdayCount > 0 && totalCount !== yesterdayCount) {
      const pct = Math.round(((totalCount - yesterdayCount) / yesterdayCount) * 100)
      subtitle1 =
        pct >= 0 ? `↑ ${pct}% vs yesterday` : `↓ ${Math.abs(pct)}% vs yesterday`
    } else if (totalCount === 0 && yesterdayCount === 0) {
      subtitle1 = 'No bookings yesterday'
    } else if (totalCount > 0 && yesterdayCount === 0) {
      subtitle1 = 'New bookings today'
    } else {
      subtitle1 = 'Same as yesterday'
    }
  } else if (scope === 'day') {
    subtitle1 =
      covers > 0 ? `${covers} ${covers === 1 ? 'guest' : 'guests'} on this day` : 'No guests yet'
  } else {
    const active = pool.filter(
      (r) => r.status !== 'cancelled' && r.status !== 'no-show',
    ).length
    subtitle1 = `${active} active in ${card1Label}`
  }

  const subtitle2 =
    upcomingCount > 0 && nextUpcomingTime
      ? `Next: ${nextUpcomingTime}`
      : scope === 'month'
        ? 'No upcoming in this month'
        : 'No upcoming today'

  let subtitle4: string
  if (scope === 'today') {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yCancelled = reservations.filter(
      (r) => isSameDay(r.scheduledAt, yesterday) && r.status === 'cancelled',
    ).length
    if (yCancelled > 0 && cancelledCount !== yCancelled) {
      const pct = Math.round(((cancelledCount - yCancelled) / yCancelled) * 100)
      subtitle4 =
        pct >= 0 ? `↑ ${pct}% vs yesterday` : `↓ ${Math.abs(pct)}% vs yesterday`
    } else {
      subtitle4 = cancelledCount > 0 ? `${cancelledCount} cancelled` : 'None cancelled'
    }
  } else {
    subtitle4 =
      cancelledCount > 0
        ? `${cancelledCount} in ${scope === 'day' ? 'this day' : card1Label}`
        : 'None cancelled'
  }

  return {
    scope,
    label: card1Label,
    card1Label,
    totalCount,
    upcomingCount,
    nextUpcomingTime,
    nextUpcomingId,
    confirmedCount,
    confirmedPct,
    cancelledCount,
    covers,
    pendingCount,
    subtitle1,
    subtitle2,
    subtitle4,
  }
}
