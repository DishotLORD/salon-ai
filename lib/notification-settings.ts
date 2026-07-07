export type NotificationSettings = {
  /** Send owner an email when a new reservation is confirmed via the bot. */
  email_on_reservation: boolean
  /** Send owner an email when a new guest opens a chat for the first time. */
  email_on_new_chat: boolean
  /** Send the guest a confirmation email when the bot books and their email is known. */
  email_guest_confirmation: boolean
  /** How often to send digest summary emails. */
  digest_frequency: 'daily' | 'weekly' | 'off'
  /** Alert the owner when a guest complains or asks for a manager. */
  escalate_complaint: boolean
  /** Alert the owner on large-party requests (8+ guests). */
  escalate_large_party: boolean
  /** Alert the owner when a guest mentions an allergy or dietary risk. */
  escalate_allergy: boolean
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  email_on_reservation: true,
  email_on_new_chat: false,
  email_guest_confirmation: true,
  digest_frequency: 'daily',
  escalate_complaint: true,
  escalate_large_party: true,
  escalate_allergy: true,
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function parseNotificationSettings(raw: unknown): NotificationSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NOTIFICATION_SETTINGS }
  const r = raw as Record<string, unknown>
  const d = DEFAULT_NOTIFICATION_SETTINGS
  return {
    email_on_reservation: boolOr(r.email_on_reservation, d.email_on_reservation),
    email_on_new_chat: boolOr(r.email_on_new_chat, d.email_on_new_chat),
    email_guest_confirmation: boolOr(r.email_guest_confirmation, d.email_guest_confirmation),
    digest_frequency: (['daily', 'weekly', 'off'] as const).includes(
      r.digest_frequency as 'daily',
    )
      ? (r.digest_frequency as 'daily' | 'weekly' | 'off')
      : d.digest_frequency,
    escalate_complaint: boolOr(r.escalate_complaint, d.escalate_complaint),
    escalate_large_party: boolOr(r.escalate_large_party, d.escalate_large_party),
    escalate_allergy: boolOr(r.escalate_allergy, d.escalate_allergy),
  }
}
