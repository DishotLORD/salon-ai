/**
 * Per-business Canadian IANA timezones for reservation wall-clock math.
 *
 * Appointments stay timestamptz (UTC instants). The venue timezone only
 * interprets guest/staff wall-clock digits and calendar day keys. Null in the
 * database means "legacy / unknown" and falls back to America/Edmonton so
 * existing Alberta businesses keep their current behaviour without rewriting
 * any scheduled_at rows.
 */

export const DEFAULT_BUSINESS_TIMEZONE = 'America/Edmonton' as const

/** Supported venue zones for Canadian restaurants (Phase 1 market). */
export const CANADIAN_BUSINESS_TIMEZONES = [
  'America/Vancouver',
  'America/Edmonton',
  'America/Regina',
  'America/Winnipeg',
  'America/Toronto',
  'America/Halifax',
  'America/St_Johns',
] as const

export type CanadianBusinessTimezone = (typeof CANADIAN_BUSINESS_TIMEZONES)[number]

export type BusinessTimezoneOption = {
  value: CanadianBusinessTimezone
  label: string
}

export const BUSINESS_TIMEZONE_OPTIONS: BusinessTimezoneOption[] = [
  { value: 'America/Vancouver', label: 'Pacific Time — Vancouver' },
  { value: 'America/Edmonton', label: 'Mountain Time — Calgary, Edmonton' },
  { value: 'America/Regina', label: 'Saskatchewan Time — Regina' },
  { value: 'America/Winnipeg', label: 'Central Time — Winnipeg' },
  { value: 'America/Toronto', label: 'Eastern Time — Toronto, Ottawa, Montreal' },
  { value: 'America/Halifax', label: 'Atlantic Time — Halifax' },
  { value: 'America/St_Johns', label: "Newfoundland Time — St. John's" },
]

const ALLOWED = new Set<string>(CANADIAN_BUSINESS_TIMEZONES)

export function isCanadianBusinessTimezone(value: unknown): value is CanadianBusinessTimezone {
  return typeof value === 'string' && ALLOWED.has(value)
}

/**
 * Resolve the IANA zone used for a business.
 * Invalid or missing values → America/Edmonton (never browser TZ, never fixed offsets).
 */
export function resolveBusinessTimezone(stored: string | null | undefined): CanadianBusinessTimezone {
  if (isCanadianBusinessTimezone(stored)) return stored
  return DEFAULT_BUSINESS_TIMEZONE
}

/** Server-side gate for settings/onboarding writes. */
export function parseBusinessTimezoneInput(
  raw: unknown,
): { ok: true; timezone: CanadianBusinessTimezone } | { ok: false; message: string } {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
    return { ok: false, message: 'Choose the timezone where this restaurant operates.' }
  }
  if (typeof raw !== 'string' || !isCanadianBusinessTimezone(raw.trim())) {
    return {
      ok: false,
      message: 'Choose a supported Canadian timezone from the list.',
    }
  }
  return { ok: true, timezone: raw.trim() as CanadianBusinessTimezone }
}

/**
 * Suggest Mountain Time only when the free-text address strongly indicates Alberta.
 * Never use the browser timezone. Returns null when the owner must confirm.
 */
export function suggestTimezoneFromAddress(address: string | null | undefined): CanadianBusinessTimezone | null {
  if (typeof address !== 'string') return null
  const a = address.trim()
  if (!a) return null

  // Strong province markers
  if (/\bAlberta\b/i.test(a) || /\b,\s*AB\b/i.test(a) || /\bAB\s+[A-Z]\d[A-Z]/i.test(a)) {
    return 'America/Edmonton'
  }

  // Major Alberta cities (word-boundary) — still require the owner to see the default
  if (
    /\bCalgary\b/i.test(a) ||
    /\bEdmonton\b/i.test(a) ||
    /\bRed Deer\b/i.test(a) ||
    /\bLethbridge\b/i.test(a) ||
    /\bFort McMurray\b/i.test(a) ||
    /\bMedicine Hat\b/i.test(a)
  ) {
    return 'America/Edmonton'
  }

  return null
}

export function timezoneLabel(tz: string): string {
  return BUSINESS_TIMEZONE_OPTIONS.find((o) => o.value === tz)?.label ?? tz
}

/** True when PostgREST rejects the timezone column (migration 023 not applied yet). */
export function isTimezoneSchemaError(message: string | null | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes('timezone') && (m.includes('column') || m.includes('schema cache'))
}
