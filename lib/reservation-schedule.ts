/** Date/time helpers for appointment scheduling (wall-clock strings for Supabase). */

export function toDateIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function toWallClock(dateIso: string, time: string): string {
  return `${dateIso}T${time}:00`
}

export function timeFromDate(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}
