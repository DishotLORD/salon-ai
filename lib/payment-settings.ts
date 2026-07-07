export type PaymentSettings = {
  /** Collect a Stripe deposit when the bot books a reservation. */
  deposit_enabled: boolean
  /** Deposit per guest in CAD dollars. 0 disables even when the toggle is on. */
  deposit_per_guest: number
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  deposit_enabled: false,
  deposit_per_guest: 0,
}

export function parsePaymentSettings(raw: unknown): PaymentSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PAYMENT_SETTINGS }
  const row = raw as Record<string, unknown>
  return {
    deposit_enabled:
      typeof row.deposit_enabled === 'boolean'
        ? row.deposit_enabled
        : DEFAULT_PAYMENT_SETTINGS.deposit_enabled,
    deposit_per_guest:
      typeof row.deposit_per_guest === 'number' &&
      Number.isFinite(row.deposit_per_guest) &&
      row.deposit_per_guest >= 0
        ? Math.min(10000, row.deposit_per_guest)
        : DEFAULT_PAYMENT_SETTINGS.deposit_per_guest,
  }
}

/** Whole-cent deposit for a party; null when deposits are effectively off. */
export function depositAmountCents(settings: PaymentSettings, partySize: number): number | null {
  if (!settings.deposit_enabled || settings.deposit_per_guest <= 0) return null
  const cents = Math.round(settings.deposit_per_guest * 100) * Math.max(1, partySize)
  return cents >= 50 ? cents : null // Stripe minimum charge is $0.50
}
