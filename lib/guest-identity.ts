import { isPlausibleGuestName } from '@/lib/guest-display'

/**
 * Guest identity rules (single source of truth):
 * - PHONE (normalized to +E.164 digits) is the primary identity key.
 * - EMAIL (trimmed, lowercased) is the secondary key.
 * - NAME is display-only and NEVER used to match guests — names collide.
 *
 * Every write path that stores guest contact (chat tools, booking, waitlist)
 * must normalize through these helpers so lookups always compare equal strings.
 */

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!hasPlus && digits.length === 10) return `+1${digits}` // bare 10-digit → North America
  return `+${digits}` // already had +, or 11+ digits without + → just prepend +
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function normalizeName(raw: string): string {
  return raw
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export function phoneDigitCount(raw: string): number {
  return raw.replace(/\D/g, '').length
}

/** Normalize contact fields for customer INSERT/SELECT/UPDATE. Drops implausible values. */
export function normalizeGuestContact(fields: {
  name?: string | null
  phone?: string | null
  email?: string | null
}): { name?: string; phone?: string; email?: string } {
  const out: { name?: string; phone?: string; email?: string } = {}
  if (fields.name?.trim() && isPlausibleGuestName(fields.name)) {
    out.name = normalizeName(fields.name)
  }
  if (fields.phone?.trim() && phoneDigitCount(fields.phone) >= 7) {
    out.phone = normalizePhone(fields.phone)
  }
  if (fields.email?.trim()) out.email = normalizeEmail(fields.email)
  return out
}
