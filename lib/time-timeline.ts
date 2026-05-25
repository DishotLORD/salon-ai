export type TimelineRange = {
  start: number
  end: number
  step: number
  /** Treat times before `start` as next-day on an extended axis (e.g. close at 2 AM). */
  wrapAfterMidnight?: boolean
}

export type TimeSlot = {
  value: string
  label: string
  minutes: number
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minutesToTime(mins: number): string {
  const normalized = ((mins % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function timeToTimelineMinutes(value: string, range: TimelineRange): number {
  let mins = timeToMinutes(value)
  if (range.wrapAfterMidnight && mins < range.start) {
    mins += 24 * 60
  }
  return mins
}

export function timelineMinutesToTime(mins: number): string {
  return minutesToTime(mins)
}

export function buildTimeSlots(range: TimelineRange): TimeSlot[] {
  const span = range.end - range.start
  const count = Math.floor(span / range.step) + 1
  return Array.from({ length: count }, (_, i) => {
    const minutes = range.start + i * range.step
    const value = timelineMinutesToTime(minutes)
    const h = Math.floor((minutes % (24 * 60)) / 60)
    const m = minutes % 60
    const period = h < 12 ? 'AM' : 'PM'
    const dh = h > 12 ? h - 12 : h === 0 ? 12 : h
    return { value, label: `${dh}:${String(m).padStart(2, '0')} ${period}`, minutes }
  })
}

export function snapToGrid(mins: number, range: TimelineRange, slots?: TimeSlot[]): string {
  const clamped = Math.max(range.start, Math.min(range.end, mins))
  const idx = Math.round((clamped - range.start) / range.step)
  const list = slots ?? buildTimeSlots(range)
  const safeIdx = Math.max(0, Math.min(list.length - 1, idx))
  return list[safeIdx].value
}

export function timelinePercent(minutes: number, range: TimelineRange): number {
  return ((minutes - range.start) / (range.end - range.start)) * 100
}

export function formatDigitalClock(
  value: string,
  range: TimelineRange,
  slots?: TimeSlot[],
): { hm: string; period: string; label: string } {
  const list = slots ?? buildTimeSlots(range)
  const snapped = snapToGrid(timeToTimelineMinutes(value, range), range, list)
  const slot = list.find((s) => s.value === snapped)
  if (slot) {
    const parts = slot.label.split(' ')
    return { hm: parts[0] ?? snapped, period: parts[1] ?? '', label: slot.label }
  }
  const mins = timeToMinutes(snapped)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const period = h < 12 ? 'AM' : 'PM'
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h
  return { hm: `${dh}:${String(m).padStart(2, '0')}`, period, label: `${dh}:${String(m).padStart(2, '0')} ${period}` }
}

export function formatCompactTime(value: string): string {
  const mins = timeToMinutes(value)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const period = h < 12 ? 'a' : 'p'
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h
  if (m === 0) return `${dh}${period}`
  return `${dh}:${String(m).padStart(2, '0')}${period}`
}

export type PeakBand = { start: number; end: number; label: string }

export function peakBandStyle(start: number, end: number, range: TimelineRange): {
  left: string
  width: string
} {
  const left = timelinePercent(start, range)
  const width = timelinePercent(end, range) - left
  return { left: `${left}%`, width: `${width}%` }
}
