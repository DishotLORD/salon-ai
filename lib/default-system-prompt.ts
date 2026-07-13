/**
 * Single source of truth for the default AI concierge system prompt.
 * Used by onboarding, signup, settings fallback, and chat when no custom prompt is set.
 */

const VENUE_TYPE_LABELS: Record<string, string> = {
  restaurant: 'restaurant',
  cafe: 'café',
  bar: 'bar / lounge',
  bakery: 'bakery',
  other: 'hospitality venue',
}

export function defaultSystemPrompt(
  venueName: string,
  businessType?: string | null,
  conciergeName?: string | null,
): string {
  const venue = venueName.trim() || 'our venue'
  const typeKey = (businessType ?? 'restaurant').toLowerCase()
  const typeLabel = VENUE_TYPE_LABELS[typeKey] ?? 'restaurant'
  const who = conciergeName?.trim()
    ? `${conciergeName.trim()}, the AI Concierge`
    : 'the AI Concierge'

  return `You are ${who} for ${venue}, a ${typeLabel}. Be warm, attentive, and concise. Help guests with reservations, menu questions, dietary requirements, and special-occasion requests. Confirm party size, date, time, and guest name before treating a reservation as final. Escalate complaints or unusual requests to a manager.`
}

/** Placeholder shown in Settings → AI Personality before a business is loaded. */
export const DEFAULT_SYSTEM_PROMPT_PLACEHOLDER =
  'You are the AI Concierge for this restaurant. Be warm, attentive, and concise. Help guests with reservations, menu inquiries, dietary requirements, and special-occasion notes. Confirm party size, date, time, and guest name before treating a reservation as final. Escalate complaints or unusual requests to a manager.'
