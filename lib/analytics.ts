import { parsePartySizeFromServiceName } from '@/lib/appointment-service-name'
import {
  appointmentInstantFromRaw,
  getCalgaryPartsFromInstant,
  wallClockDateKey,
  type WallClockParts,
} from '@/lib/booking-wall-clock'

export type AnalyticsRange = '7d' | '30d' | '90d' | '12m'

export type AnalyticsAppointmentRow = {
  customer_id: string | null
  scheduled_at: string
  status: string | null
  party_size: number | null
  service_name: string | null
  zone_id: string | null
}

export type AnalyticsZone = {
  id: string
  name: string
  max_concurrent_parties: number
  turnover_minutes: number
  is_active: boolean
}

export type AnalyticsBucket = {
  key: string
  label: string
  bookings: number
  covers: number
  cancelled: number
  noShows: number
  newGuests: number
  returningGuests: number
}

export type AnalyticsKpis = {
  bookings: number
  covers: number
  avgPartySize: number | null
  cancellationRate: number
  noShowRate: number
  uniqueGuests: number
  newGuests: number
  returningGuests: number
  /** Deltas vs the preceding window of the same length; null when previous window empty. */
  bookingsDeltaPct: number | null
  coversDeltaPct: number | null
}

export type ZoneStat = {
  zoneId: string
  zoneName: string
  bookings: number
  covers: number
  sharePct: number
  /** Peak concurrent parties observed / configured capacity. Null when zone has no bookings. */
  peakUtilizationPct: number | null
}

export type HeatmapCell = {
  weekday: number
  hour: number
  count: number
}

export type AnalyticsReport = {
  kpis: AnalyticsKpis
  series: AnalyticsBucket[]
  /** Same bucketing for the preceding window, aligned by index with `series` (guest-mix fields stay 0). */
  prevSeries: AnalyticsBucket[]
  zones: ZoneStat[]
  heatmap: HeatmapCell[]
  heatmapMax: number
  heatmapHourRange: { start: number; end: number } | null
}

const RANGE_DAYS: Record<AnalyticsRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '12m': 365,
}

export function rangeDays(range: AnalyticsRange): number {
  return RANGE_DAYS[range]
}

function isCancelled(status: string | null): boolean {
  const s = (status ?? '').toLowerCase()
  return s === 'cancelled' || s === 'canceled'
}

function isNoShow(status: string | null): boolean {
  const s = (status ?? '').toLowerCase()
  return s === 'no-show' || s === 'noshow'
}

export function resolvePartySize(row: AnalyticsAppointmentRow): number {
  if (row.party_size != null && row.party_size > 0) return row.party_size
  return parsePartySizeFromServiceName(row.service_name) ?? 1
}

function monthKey(parts: WallClockParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayLabel(key: string): string {
  const [, m, d] = key.split('-').map(Number)
  return `${MONTH_LABELS[m - 1]} ${d}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTH_LABELS[m - 1]} ${String(y).slice(2)}`
}

/** UTC ms boundaries [start, end) for the report window ending now, plus the preceding window. */
export function reportWindow(range: AnalyticsRange, now: Date = new Date()) {
  const days = RANGE_DAYS[range]
  const end = now.getTime()
  const start = end - days * 24 * 60 * 60 * 1000
  const prevStart = start - days * 24 * 60 * 60 * 1000
  return { start, end, prevStart }
}

/**
 * Build the full analytics report.
 *
 * `allRows` must contain the business's complete appointment history (used to
 * decide whether a guest is new or returning); the report itself covers
 * [window.start, window.end).
 */
export function buildAnalyticsReport(
  allRows: AnalyticsAppointmentRow[],
  zones: AnalyticsZone[],
  range: AnalyticsRange,
  now: Date = new Date(),
): AnalyticsReport {
  const { start, end, prevStart } = reportWindow(range, now)
  const useMonthBuckets = range === '12m'

  // First-ever appointment per customer (across full history) → new vs returning.
  const firstSeen = new Map<string, number>()
  const parsed = allRows
    .map((row) => {
      const instant = appointmentInstantFromRaw(row.scheduled_at)
      return { row, ms: instant.getTime(), instant }
    })
    .filter((e) => Number.isFinite(e.ms))

  for (const e of parsed) {
    const cid = e.row.customer_id
    if (!cid) continue
    const prev = firstSeen.get(cid)
    if (prev === undefined || e.ms < prev) firstSeen.set(cid, e.ms)
  }

  const inWindow = parsed.filter((e) => e.ms >= start && e.ms < end)
  const inPrevWindow = parsed.filter((e) => e.ms >= prevStart && e.ms < start)

  // ── Buckets ──
  const buckets = new Map<string, AnalyticsBucket>()
  const bucketKeyFor = (instant: Date): { key: string; label: string } => {
    const parts = getCalgaryPartsFromInstant(instant)
    if (useMonthBuckets) {
      const key = monthKey(parts)
      return { key, label: monthLabel(key) }
    }
    const key = wallClockDateKey(parts)
    return { key, label: dayLabel(key) }
  }

  // Pre-seed every bucket in the window so gaps render as zeros.
  if (useMonthBuckets) {
    const nowParts = getCalgaryPartsFromInstant(now)
    for (let i = 11; i >= 0; i--) {
      let y = nowParts.year
      let m = nowParts.month - i
      while (m <= 0) {
        m += 12
        y -= 1
      }
      const key = `${y}-${String(m).padStart(2, '0')}`
      buckets.set(key, { key, label: monthLabel(key), bookings: 0, covers: 0, cancelled: 0, noShows: 0, newGuests: 0, returningGuests: 0 })
    }
  } else {
    const days = RANGE_DAYS[range]
    for (let i = days - 1; i >= 0; i--) {
      const instant = new Date(end - 1 - i * 24 * 60 * 60 * 1000)
      const parts = getCalgaryPartsFromInstant(instant)
      const key = wallClockDateKey(parts)
      if (!buckets.has(key)) {
        buckets.set(key, { key, label: dayLabel(key), bookings: 0, covers: 0, cancelled: 0, noShows: 0, newGuests: 0, returningGuests: 0 })
      }
    }
  }

  // ── Previous-window buckets (period-over-period chart overlay) ──
  const emptyBucket = (key: string, label: string): AnalyticsBucket => ({
    key,
    label,
    bookings: 0,
    covers: 0,
    cancelled: 0,
    noShows: 0,
    newGuests: 0,
    returningGuests: 0,
  })
  const prevBuckets = new Map<string, AnalyticsBucket>()
  if (useMonthBuckets) {
    const nowParts = getCalgaryPartsFromInstant(now)
    for (let i = 23; i >= 12; i--) {
      let y = nowParts.year
      let m = nowParts.month - i
      while (m <= 0) {
        m += 12
        y -= 1
      }
      const key = `${y}-${String(m).padStart(2, '0')}`
      prevBuckets.set(key, emptyBucket(key, monthLabel(key)))
    }
  } else {
    const days = RANGE_DAYS[range]
    for (let i = 2 * days - 1; i >= days; i--) {
      const instant = new Date(end - 1 - i * 24 * 60 * 60 * 1000)
      const parts = getCalgaryPartsFromInstant(instant)
      const key = wallClockDateKey(parts)
      if (!prevBuckets.has(key)) prevBuckets.set(key, emptyBucket(key, dayLabel(key)))
    }
  }
  for (const e of inPrevWindow) {
    const { key, label } = bucketKeyFor(e.instant)
    let bucket = prevBuckets.get(key)
    if (!bucket) {
      bucket = emptyBucket(key, label)
      prevBuckets.set(key, bucket)
    }
    bucket.bookings += 1
    const cancelled = isCancelled(e.row.status)
    const noShow = isNoShow(e.row.status)
    if (cancelled) bucket.cancelled += 1
    if (noShow) bucket.noShows += 1
    if (!cancelled && !noShow) bucket.covers += resolvePartySize(e.row)
  }

  // ── Aggregate window rows ──
  const seenGuests = new Set<string>()
  const newGuestIds = new Set<string>()
  let covers = 0
  let cancelledCount = 0
  let noShowCount = 0
  let partySum = 0
  let partyN = 0

  const zoneAgg = new Map<string, { bookings: number; covers: number; events: { startMs: number; endMs: number }[] }>()
  const heat = new Map<string, number>()

  for (const e of inWindow) {
    const { key, label } = bucketKeyFor(e.instant)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { key, label, bookings: 0, covers: 0, cancelled: 0, noShows: 0, newGuests: 0, returningGuests: 0 }
      buckets.set(key, bucket)
    }

    bucket.bookings += 1
    const cancelled = isCancelled(e.row.status)
    const noShow = isNoShow(e.row.status)
    if (cancelled) {
      cancelledCount += 1
      bucket.cancelled += 1
    }
    if (noShow) {
      noShowCount += 1
      bucket.noShows += 1
    }

    const party = resolvePartySize(e.row)
    if (!cancelled && !noShow) {
      covers += party
      bucket.covers += party
      partySum += party
      partyN += 1
    }

    const cid = e.row.customer_id
    if (cid) {
      const isNewHere = firstSeen.get(cid) === e.ms
      if (!seenGuests.has(cid)) {
        seenGuests.add(cid)
        if (isNewHere || (firstSeen.get(cid) ?? 0) >= start) {
          newGuestIds.add(cid)
          bucket.newGuests += 1
        } else {
          bucket.returningGuests += 1
        }
      }
    }

    // Zones & heatmap count active bookings only.
    if (!cancelled && !noShow) {
      if (e.row.zone_id) {
        let z = zoneAgg.get(e.row.zone_id)
        if (!z) {
          z = { bookings: 0, covers: 0, events: [] }
          zoneAgg.set(e.row.zone_id, z)
        }
        z.bookings += 1
        z.covers += party
        const zone = zones.find((zz) => zz.id === e.row.zone_id)
        const turnover = zone?.turnover_minutes ?? 90
        z.events.push({ startMs: e.ms, endMs: e.ms + turnover * 60 * 1000 })
      }

      const parts = getCalgaryPartsFromInstant(e.instant)
      const wd = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
      const hk = `${wd}-${parts.hour}`
      heat.set(hk, (heat.get(hk) ?? 0) + 1)
    }
  }

  const bookings = inWindow.length
  const prevBookings = inPrevWindow.length
  const prevCovers = inPrevWindow.reduce((s, e) => {
    if (isCancelled(e.row.status) || isNoShow(e.row.status)) return s
    return s + resolvePartySize(e.row)
  }, 0)

  const deltaPct = (curr: number, prev: number): number | null =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null

  const kpis: AnalyticsKpis = {
    bookings,
    covers,
    avgPartySize: partyN > 0 ? partySum / partyN : null,
    cancellationRate: bookings > 0 ? Math.round((cancelledCount / bookings) * 100) : 0,
    noShowRate: bookings > 0 ? Math.round((noShowCount / bookings) * 100) : 0,
    uniqueGuests: seenGuests.size,
    newGuests: newGuestIds.size,
    returningGuests: seenGuests.size - newGuestIds.size,
    bookingsDeltaPct: deltaPct(bookings, prevBookings),
    coversDeltaPct: deltaPct(covers, prevCovers),
  }

  // ── Zone stats ──
  const activeBookingsTotal = bookings - cancelledCount - noShowCount
  const zoneStats: ZoneStat[] = zones
    .map((zone) => {
      const agg = zoneAgg.get(zone.id)
      if (!agg) {
        return {
          zoneId: zone.id,
          zoneName: zone.name,
          bookings: 0,
          covers: 0,
          sharePct: 0,
          peakUtilizationPct: null,
        }
      }
      // Peak concurrency via sweep over start/end events.
      const points = agg.events
        .flatMap((ev) => [
          { ms: ev.startMs, d: 1 },
          { ms: ev.endMs, d: -1 },
        ])
        .sort((a, b) => a.ms - b.ms || a.d - b.d)
      let curr = 0
      let peak = 0
      for (const p of points) {
        curr += p.d
        if (curr > peak) peak = curr
      }
      return {
        zoneId: zone.id,
        zoneName: zone.name,
        bookings: agg.bookings,
        covers: agg.covers,
        sharePct: activeBookingsTotal > 0 ? Math.round((agg.bookings / activeBookingsTotal) * 100) : 0,
        peakUtilizationPct:
          zone.max_concurrent_parties > 0
            ? Math.round((peak / zone.max_concurrent_parties) * 100)
            : null,
      }
    })
    .sort((a, b) => b.bookings - a.bookings)

  // ── Heatmap ──
  const heatmap: HeatmapCell[] = []
  let heatmapMax = 0
  let minHour = 24
  let maxHour = -1
  for (const [k, count] of heat) {
    const [wd, hour] = k.split('-').map(Number)
    heatmap.push({ weekday: wd, hour, count })
    if (count > heatmapMax) heatmapMax = count
    if (hour < minHour) minHour = hour
    if (hour > maxHour) maxHour = hour
  }

  return {
    kpis,
    series: [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)),
    prevSeries: [...prevBuckets.values()].sort((a, b) => a.key.localeCompare(b.key)),
    zones: zoneStats,
    heatmap,
    heatmapMax,
    heatmapHourRange: maxHour >= 0 ? { start: minHour, end: maxHour } : null,
  }
}
