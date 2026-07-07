import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

import {
  findNearestOpenSlots,
  getOpenSlotsForDate,
  isSlotAvailable,
  pickZoneForSlot,
  type AvailableSlot,
  type ExistingBooking,
} from '@/lib/booking-availability'
import {
  activeZonesForParty,
  formatZoneNamesList,
  guestAcceptsAnyZone,
  inferZoneIdFromText,
  type DiningZone,
} from '@/lib/dining-zones'
import type { BookingSettings } from '@/lib/booking-settings'
import {
  parseNotificationSettings,
  type NotificationSettings,
} from '@/lib/notification-settings'
import {
  addDaysToDateKey,
  getCalgaryNowParts,
  scheduledAtToWallClock,
  wallClockDateKey,
  snapWallClockToSlotInterval,
  wallClockInCalgaryToUtcDate,
  type WallClockParts,
} from '@/lib/booking-wall-clock'
import { loadBusinessBookingContext } from '@/lib/booking-load'
import {
  formatGuestPreferencesForPrompt,
  mergeGuestPreferences,
  parseGuestNotes,
  serializeGuestNotes,
} from '@/lib/guest-preferences'
import { isPlausibleGuestName } from '@/lib/guest-display'
import {
  formatHoursRangeLabel,
  getDayHoursForDate,
  type OperatingHours,
} from '@/lib/operating-hours'
import {
  DEFAULT_PAYMENT_SETTINGS,
  depositAmountCents,
  parsePaymentSettings,
  type PaymentSettings,
} from '@/lib/payment-settings'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { appBaseUrl, getStripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessOwner } from '@/lib/verify-business-owner'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type ChatMessage = { role: string; content: string }

// ─── Conversation-flow system prompt injection ────────────────────────────────

const BOOKING_FLOW_RULES = `
YOUR ROLE: collect reservation details through friendly conversation. You do NOT validate or decide bookings — the reservation system does that when you call the tools. Never claim a booking is done without a successful create_reservation tool call.

COLLECT THESE 5 FIELDS, asking only for what is still missing. Never guess, infer, or invent any of them:
1. Full name — ask explicitly: "May I have your name for the reservation?" NEVER generate a name from context. If RETURNING GUEST CONTEXT is present, confirm before using it: "Shall I put this under [Name]?" A one-word reply like "Patio" or "Bar" after a seating question is a ZONE choice, not a name.
2. Date — ALWAYS resolve relative dates ("today", "tonight", "tomorrow", "next Friday") to a concrete YYYY-MM-DD using CURRENT DATE shown above before calling any tool, and keep it consistent across turns.
3. Time — reservations start every 15 minutes. If the guest says "6:50", pass the nearest slot (18:45) and explain briefly: "We book every 15 minutes — 6:45 or 7:00 works."
4. Party size — skip the question if already stated (e.g. "table for 2", "party of 4").
5. Seating zone — when more than one dining zone exists, ask where they would like to sit, offering the zone names from the system context. The guest may say "no preference". Pass the guest's stated choice to create_reservation EXACTLY as they said it — never substitute, default, or pick a zone yourself.

ALSO COLLECT (optional): phone number or email (preferred — explain it is for the confirmation; required when the system context says so), and special requests — ask once, briefly: "Any special requests? (dietary needs, allergies, an occasion, seating wishes)". If they say "no", proceed.

TOOL USAGE:
- check_availability — call BEFORE you offer or confirm any time. Never invent open times.
- create_reservation — call ONLY once the guest has stated all 5 fields, passing each exactly as the guest said it. The system validates everything: if it returns missing_fields, ask the guest for those fields and call again; if it returns not_available, apologize briefly and offer the returned alternatives. After it succeeds, confirm warmly by first name with the exact date, time, dining area, and any noted requests.
- reschedule_reservation — call when the guest wants to move an existing booking.
- cancel_reservation — call when the guest wants to cancel. Use the word "cancelled" in your reply.
- save_guest_details — call as soon as you learn the guest's name, phone, or email, even before a booking is made. ALSO call it whenever the guest mentions an allergy, dietary restriction, lasting seating/ambiance preference, or a notable occasion.
- join_waitlist — when a requested time is full and the guest declines every alternative, offer the waitlist: "I can add you to our waitlist for that time — we'll reach out the moment a table opens." Requires a phone number or email. Call it only after the guest agrees. After it succeeds, confirm they are on the list; never promise a table.

STYLE:
- NEVER say "one moment", "I'll check now", or otherwise promise future work — call the tool immediately and reply with its result in the same turn.
- The moment the guest has stated all 5 fields, call create_reservation in THAT turn. Do NOT ask "shall I proceed?" or re-confirm details the guest already gave — their request IS the consent; booking should feel effortless.
- If RETURNING GUEST CONTEXT lists allergies or dietary needs, ALWAYS include them in special_requests when booking, even if the guest does not repeat them.
- Once you know the guest's name, address them by first name.
- Keep responses concise (2–4 sentences). Never repeat questions already answered.
- Sound like a gracious host, not a form: acknowledge what the guest said before asking the next question ("Lovely, a table for four —"), and vary your phrasing instead of repeating the same sentence patterns.
- When the guest mentions an occasion (birthday, anniversary, first date), react warmly in ONE short phrase and note it in special_requests — never interrogate them about it.
- Ask for AT MOST one thing per message. If several fields are missing, ask for the most natural next one only.

RECOVERY & EDGE CASES:
- Unclear or contradictory input: do not guess. Ask one short, friendly clarifying question ("Just to be sure — Friday the 10th, or Saturday the 11th?").
- If a tool returns past_date or beyond_booking_window, relay the reason kindly and ask for a date that works.
- If the requested time is full: offer the returned alternatives first. If the guest declines them all, offer the waitlist — never just dead-end.
- Menu & dietary questions: answer ONLY from the MENU sections below. If the menu does not answer it, say you're not certain and offer to note the question for the restaurant. Never invent dishes, prices, or ingredients.
- Guest asks for something you cannot do (large event, private hire, complaint): take their contact details with save_guest_details, note it in special_requests or preferences, and let them know the team will follow up.
- If the guest switches language, reply in their language.
`

type ToolName =
  | 'check_availability'
  | 'create_reservation'
  | 'reschedule_reservation'
  | 'cancel_reservation'
  | 'save_guest_details'
  | 'join_waitlist'
  | 'escalate_to_manager'

const BOOKING_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'check_availability',
      description:
        'Get the real open reservation times for a specific date and party size. Call this before offering or confirming any time. Resolve relative dates to YYYY-MM-DD first.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Reservation date, YYYY-MM-DD' },
          party_size: { type: 'integer', description: 'Number of guests' },
          seating_area: {
            type: 'string',
            description: 'Optional preferred dining area / zone name',
          },
        },
        required: ['date', 'party_size'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_reservation',
      description:
        'Create a reservation. Only call when the guest has stated all of: name, date, time, party size, and seating zone. The system validates the fields and rejects the call if any is missing. Include any special requests, phone, and email the guest provided.',
      parameters: {
        type: 'object',
        properties: {
          guest_name: { type: 'string', description: "The guest's full name, exactly as they stated it" },
          date: { type: 'string', description: 'Reservation date, YYYY-MM-DD' },
          time: { type: 'string', description: '24-hour time, HH:MM' },
          party_size: { type: 'integer', description: 'Number of guests' },
          seating_area: {
            type: 'string',
            description:
              'The dining zone the guest chose, passed VERBATIM as they stated it (e.g. "Bar", "Patio"), or "no preference" if they said anywhere works. Never substitute a different zone or fill in a default.',
          },
          special_requests: {
            type: 'string',
            description:
              'Anything the guest wishes for: dietary needs, allergies, an occasion to celebrate, seating preferences, accessibility needs, etc.',
          },
          phone: { type: 'string', description: 'Guest phone number, if provided' },
          email: { type: 'string', description: 'Guest email, if provided' },
        },
        required: ['guest_name', 'date', 'time', 'party_size', 'seating_area'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reschedule_reservation',
      description: "Move the guest's existing reservation to a new date and time.",
      parameters: {
        type: 'object',
        properties: {
          new_date: { type: 'string', description: 'New date, YYYY-MM-DD' },
          new_time: { type: 'string', description: 'New 24-hour time, HH:MM' },
        },
        required: ['new_date', 'new_time'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'cancel_reservation',
      description: "Cancel the guest's existing reservation.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_guest_details',
      description:
        "Record the guest's name and/or contact details as soon as they share them, even before a reservation is made. Only pass `name` when the guest states their own personal name — never an occasion, party description, or seating area (e.g. \"my wife's birthday\" is NOT a name).",
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "The guest's own personal name only" },
          phone: { type: 'string', description: 'Guest phone number' },
          email: { type: 'string', description: 'Guest email' },
          allergies: {
            type: 'string',
            description:
              'Any allergies or dietary restrictions the guest mentioned (e.g. "gluten, nuts"). Saved to their profile for future visits.',
          },
          preferences: {
            type: 'string',
            description:
              'Seating, ambiance, or other lasting preferences the guest mentioned (e.g. "window seat, quiet area"). Saved to their profile.',
          },
          occasions: {
            type: 'string',
            description:
              'A recurring or notable occasion worth remembering (e.g. "anniversary on April 15"). Saved to their profile.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'escalate_to_manager',
      description:
        'Alert the restaurant team about this conversation. Call when the guest complains or is upset, asks for a manager, requests a large event or private hire you cannot book, or raises a serious allergy concern. Staff are notified by email; after calling it, reassure the guest and keep helping them normally.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['complaint', 'large_party', 'allergy', 'other'],
            description: 'What kind of attention the guest needs',
          },
          reason: {
            type: 'string',
            description: "One-sentence summary of the guest's issue or request",
          },
        },
        required: ['category', 'reason'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'join_waitlist',
      description:
        'Add the guest to the waitlist for a full slot. Only call AFTER create_reservation or check_availability showed the requested time is unavailable AND the guest declined the alternatives AND agreed to be waitlisted. Requires a phone number or email so staff can reach them.',
      parameters: {
        type: 'object',
        properties: {
          guest_name: { type: 'string', description: "The guest's full name" },
          date: { type: 'string', description: 'Requested date, YYYY-MM-DD' },
          time: { type: 'string', description: 'Requested 24-hour time, HH:MM' },
          party_size: { type: 'integer', description: 'Number of guests' },
          seating_area: {
            type: 'string',
            description: 'Preferred dining area, verbatim, or "no preference"',
          },
          phone: { type: 'string', description: 'Guest phone number' },
          email: { type: 'string', description: 'Guest email' },
          notes: { type: 'string', description: 'Special requests or context' },
        },
        required: ['guest_name', 'date', 'time', 'party_size'],
      },
    },
  },
]

type MenuEntry = { name: string; price: number | null; description: string | null; category: string | null }

/** "Sat 2026-06-13, Sun 2026-06-14, …" — so the model never does weekday math itself. */
function upcomingDatesLine(todayKey: string, days = 7): string {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const parts: string[] = []
  for (let i = 1; i <= days; i++) {
    const key = addDaysToDateKey(todayKey, i)
    const [y, m, d] = key.split('-').map(Number)
    parts.push(`${names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} = ${key}`)
  }
  return parts.join(', ')
}

function buildSystemPrompt(
  conciergeName: string,
  restaurantName: string,
  customPrompt: string | null | undefined,
  menuItems?: MenuEntry[] | null,
  menuPdfText?: string | null,
  returningGuestContext?: string | null,
  todayLabel?: string,
  todayDateKey?: string,
  diningZones?: { name: string; is_active: boolean }[] | null,
  requireContactBeforeBooking?: boolean,
  depositPerGuest?: number | null,
  language?: string | null,
  notif?: NotificationSettings | null,
): string {
  const base = customPrompt?.trim()
    ? customPrompt.trim()
    : `You are ${conciergeName}, the AI Concierge for ${restaurantName}. Help guests with reservations, menu inquiries, dietary requirements, and general questions. Be warm, attentive, and concise.`
  const todayLine = todayLabel
    ? `\nCURRENT DATE (restaurant local time): ${todayLabel}${todayDateKey ? ` (${todayDateKey})` : ''}.${
        todayDateKey
          ? ` UPCOMING DATES: tomorrow ${upcomingDatesLine(todayDateKey, 1)}, then ${upcomingDatesLine(todayDateKey, 7).split(', ').slice(1).join(', ')}.`
          : ''
      } When the guest says "today", "tonight", "tomorrow", or a weekday name, copy the matching YYYY-MM-DD from this list — do not compute dates yourself.\n`
    : ''
  let prompt = `${base}${todayLine}\n\n${BOOKING_FLOW_RULES}`
  if (language?.trim() && !/^english/i.test(language.trim())) {
    prompt += `\nLANGUAGE: default to ${language.trim()} unless the guest writes in a different language — then mirror theirs.`
  }
  const escalationTriggers: string[] = []
  if (notif?.escalate_complaint) {
    escalationTriggers.push('the guest complains, is upset, or asks for a manager (category "complaint")')
  }
  if (notif?.escalate_large_party) {
    escalationTriggers.push('the guest asks about a party of 8+ or a private event (category "large_party")')
  }
  if (notif?.escalate_allergy) {
    escalationTriggers.push('the guest describes a severe or life-threatening allergy (category "allergy")')
  }
  if (escalationTriggers.length > 0) {
    prompt += `\nESCALATION: call escalate_to_manager the moment ${escalationTriggers.join('; or ')}. It quietly alerts the staff — after calling it, tell the guest the team has been notified and keep helping them.`
  }
  if (requireContactBeforeBooking) {
    prompt += `\nCONTACT REQUIRED: a phone number OR email must be on record BEFORE create_reservation. If the guest already wrote one in this conversation, or RETURNING GUEST CONTEXT shows contact on file, that fully satisfies this — do NOT ask again. Otherwise ask once (either is fine), explaining it is for the confirmation.`
  }
  if (depositPerGuest != null && depositPerGuest > 0) {
    prompt += `\nDEPOSIT POLICY: this restaurant collects a $${depositPerGuest.toFixed(2)} CAD per-guest deposit to secure reservations. Mention this briefly BEFORE booking. When create_reservation succeeds and returns a payment_link, include that exact link in your confirmation and tell the guest the table is held and fully confirmed once the deposit is paid. Never invent a payment link.`
  }
  if (returningGuestContext?.trim()) {
    prompt += `\n\n${returningGuestContext.trim()}`
  }
  if (menuItems && menuItems.length > 0) {
    const lines = menuItems.map((item) => {
      const cat = item.category ?? 'Other'
      const price = item.price != null
        ? ` — $${Number.isInteger(item.price) ? item.price : item.price.toFixed(2)}`
        : ''
      const desc = item.description?.trim() ? ` (${item.description.trim()})` : ''
      return `- ${cat}: ${item.name}${price}${desc}`
    })
    prompt += `\n\nMENU:\n${lines.join('\n')}`
  }
  if (menuPdfText?.trim()) {
    prompt += `\n\nMENU (from uploaded PDF):\n${menuPdfText.trim()}`
  }
  const activeZones = (diningZones ?? []).filter((z) => z.is_active)
  if (activeZones.length > 1) {
    prompt += `\n\nDINING ZONES AVAILABLE: ${activeZones.map((z) => z.name).join(', ')}. You MUST ask the guest which zone they prefer before confirming (unless they already said "anywhere" or stated a zone).`
  }
  return prompt
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLastUserMessageContent(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role === 'user' && typeof m.content === 'string') {
      return m.content
    }
  }
  return null
}

/**
 * Only user/assistant roles are accepted from the client — the system prompt is
 * always built server-side. Accepting client "system" messages would let a
 * widget visitor inject instructions that override booking rules.
 */
function toOpenAiMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
}

/** Cap history length/size so a malicious client can't blow up token costs. */
function sanitizeIncomingMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null
  return raw
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as ChatMessage).role === 'string' &&
        typeof (m as ChatMessage).content === 'string',
    )
    .slice(-40)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
}

function getUserMessagesCombined(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role === 'user' && typeof m.content === 'string')
    .map((m) => m.content)
    .join('\n')
}

// ─── Contact normalization ───────────────────────────────────────────────────

function extractPhone(text: string): string | null {
  // Strip date-like tokens first so "2026-06-16" or "16/06/2026" (8 digits)
  // never register as a phone number and trigger false returning-guest matches.
  const cleaned = text
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
  const m = cleaned.match(/\b(\+?[\d\s\-().]{7,20}\d)\b/)
  if (!m) return null
  const digits = m[1].replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15 ? m[1].trim() : null
}

function extractEmail(text: string): string | null {
  const m = text.match(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/)
  return m ? m[0] : null
}

function normalizePhone(raw: string): string {
  const trimmed = raw.trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!hasPlus && digits.length === 10) return `+1${digits}` // bare 10-digit → North America
  return `+${digits}` // already had +, or 11+ digits without + → just prepend +
}

function normalizeName(raw: string): string {
  return raw
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function phoneDigitCount(raw: string): number {
  return raw.replace(/\D/g, '').length
}

/** Normalize extracted contact fields for customer INSERT/SELECT/UPDATE. */
function normalizeGuestContact(fields: {
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

function extractContactFromMessages(messages: ChatMessage[]) {
  const allUserText = getUserMessagesCombined(messages)
  return normalizeGuestContact({
    phone: extractPhone(allUserText),
    email: extractEmail(allUserText),
  })
}

type CustomerRow = {
  id: string
  business_id: string
  name: string
  email: string | null
  phone: string | null
  total_bookings: number | null
  last_visit: string | null
  notes: string | null
}

type GuestHistory = {
  totalBookings: number
  lastVisit: string | null
  services: string[]
  preferredPartySize: number | null
}

function parsePartySizeFromServiceName(serviceName: string | null): number | null {
  if (!serviceName) return null
  const parts = serviceName.split('·').map((p) => p.trim())
  const partyPart = parts.find((p) => /^party of/i.test(p)) ?? parts[1]
  if (!partyPart) return null
  const n = parseInt(partyPart.replace(/\D/g, ''), 10)
  return n >= 1 && n <= 30 ? n : null
}

function mostCommonPartySize(sizes: number[]): number | null {
  if (sizes.length === 0) return null
  const counts = new Map<number, number>()
  for (const n of sizes) {
    counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  let best: number | null = null
  let bestCount = 0
  for (const [size, count] of counts) {
    if (count > bestCount) {
      best = size
      bestCount = count
    }
  }
  return best
}

function formatVisitDate(iso: string | null): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'unknown'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

async function lookupReturningGuest(
  business_id: string,
  phone: string | null,
  email: string | null,
): Promise<CustomerRow | null> {
  const { phone: normalizedPhone, email: normalizedEmail } = normalizeGuestContact({ phone, email })
  if (!normalizedPhone && !normalizedEmail) return null

  const select =
    'id, business_id, name, email, phone, total_bookings, last_visit, notes' as const

  if (normalizedEmail) {
    const { data } = await supabaseAdmin
      .from('customers')
      .select(select)
      .eq('business_id', business_id)
      .eq('email', normalizedEmail)
      .maybeSingle()
    if (data) return data as CustomerRow
  }

  if (normalizedPhone) {
    const { data } = await supabaseAdmin
      .from('customers')
      .select(select)
      .eq('business_id', business_id)
      .eq('phone', normalizedPhone)
      .maybeSingle()
    if (data) return data as CustomerRow
  }

  return null
}

async function fetchGuestHistory(customer_id: string): Promise<GuestHistory> {
  const { data: appointments } = await supabaseAdmin
    .from('appointments')
    .select('service_name, scheduled_at')
    .eq('customer_id', customer_id)
    .order('scheduled_at', { ascending: false })

  const rows = appointments ?? []
  const services = rows
    .map((r) => r.service_name)
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)

  const partySizes = services
    .map((s) => parsePartySizeFromServiceName(s))
    .filter((n): n is number => n != null)

  return {
    totalBookings: rows.length,
    lastVisit: rows[0]?.scheduled_at ?? null,
    services,
    preferredPartySize: mostCommonPartySize(partySizes),
  }
}

function buildReturningGuestContext(customer: CustomerRow, history: GuestHistory): string {
  const partyHint =
    history.preferredPartySize != null
      ? String(history.preferredPartySize)
      : 'unknown'
  const servicesHint =
    history.services.length > 0
      ? history.services.slice(0, 5).join('; ')
      : 'none on record'

  const prefLines = formatGuestPreferencesForPrompt(parseGuestNotes(customer.notes))
  const prefSection = prefLines ? `\n${prefLines}` : ''
  const allergyReminder = /Allergies \/ dietary:/.test(prefLines ?? '')
    ? '\nIMPORTANT: this guest has known allergies/dietary needs on file — include them in special_requests when you book.'
    : ''

  return `RETURNING GUEST CONTEXT:
- Name: ${customer.name?.trim() || 'Guest'}
- Phone: ${customer.phone?.trim() || 'not on file'}
- Email: ${customer.email?.trim() || 'not on file'}
- Contact on file: ${customer.phone?.trim() || customer.email?.trim() ? 'YES — do NOT ask for a phone or email again' : 'no'}
- Total visits: ${history.totalBookings}
- Last visit: ${formatVisitDate(history.lastVisit)}
- Preferred party size: ${partyHint}
- Past reservations: ${servicesHint}${prefSection}
Use this info to personalize the conversation. Greet them by name, suggest their usual booking if appropriate.${allergyReminder}`
}

async function linkConversationToCustomer(params: {
  conversation_id: string
  business_id: string
  customer_id: string
  customer_name: string
}) {
  const { conversation_id, business_id, customer_id, customer_name } = params
  await supabaseAdmin
    .from('conversations')
    .update({
      customer_id,
      customer_name: normalizeName(customer_name),
    })
    .eq('id', conversation_id)
    .eq('business_id', business_id)
}

async function bumpCustomerVisitStats(customer_id: string, business_id: string) {
  const { data: cust } = await supabaseAdmin
    .from('customers')
    .select('total_bookings')
    .eq('id', customer_id)
    .eq('business_id', business_id)
    .maybeSingle()

  await supabaseAdmin
    .from('customers')
    .update({
      last_visit: new Date().toISOString(),
      total_bookings: (cust?.total_bookings ?? 0) + 1,
    })
    .eq('id', customer_id)
    .eq('business_id', business_id)
}

// ─── Guest info persistence ───────────────────────────────────────────────────

/**
 * Persist structured guest details (from a tool call). Updates the customers record
 * and the conversations.customer_name so the inbox shows the real name instead of
 * "Website visitor". Merges into an existing returning-guest record when phone/email match.
 * Returns the (possibly re-pointed) customer id.
 */
async function persistGuest(params: {
  business_id: string
  customer_id: string
  conversation_id: string
  rawName?: string | null
  rawPhone?: string | null
  rawEmail?: string | null
  /** When true, the name is the canonical reservation name and overrides any earlier guess. */
  authoritativeName?: boolean
}): Promise<string> {
  const { business_id, customer_id, conversation_id } = params

  const { name, phone, email } = normalizeGuestContact({
    name: params.rawName ?? null,
    phone: params.rawPhone ?? null,
    email: params.rawEmail ?? null,
  })

  if (!name && !phone && !email) return customer_id

  let targetCustomerId = customer_id

  const returningGuest = await lookupReturningGuest(business_id, phone ?? null, email ?? null)
  if (returningGuest && returningGuest.id !== customer_id) {
    targetCustomerId = returningGuest.id
    await linkConversationToCustomer({
      conversation_id,
      business_id,
      customer_id: returningGuest.id,
      customer_name: name ?? returningGuest.name ?? 'Guest',
    })

    // Re-point records that still reference the placeholder customer. The FKs
    // are ON DELETE SET NULL, so deleting the placeholder without this would
    // orphan any booking made earlier in the conversation (lost from CRM).
    await supabaseAdmin
      .from('appointments')
      .update({ customer_id: returningGuest.id })
      .eq('customer_id', customer_id)
      .eq('business_id', business_id)
    await supabaseAdmin
      .from('waitlist_entries')
      .update({ customer_id: returningGuest.id })
      .eq('customer_id', customer_id)
      .eq('business_id', business_id)

    // Delete the placeholder customer created for this session if it's now
    // fully orphaned (no remaining conversations linked to it).
    const { count: remainingConvs } = await supabaseAdmin
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer_id)
      .eq('business_id', business_id)
    if (!remainingConvs || remainingConvs === 0) {
      await supabaseAdmin
        .from('customers')
        .delete()
        .eq('id', customer_id)
        .eq('business_id', business_id)
    }
  }

  const { data: existing } = await supabaseAdmin
    .from('customers')
    .select('name, phone, email')
    .eq('id', targetCustomerId)
    .eq('business_id', business_id)
    .maybeSingle()

  const customerUpdate: Record<string, string> = {}
  const placeholderName = /^(guest|website visitor)$/i
  if (
    name &&
    (params.authoritativeName || !existing?.name || placeholderName.test(existing.name.trim()))
  ) {
    customerUpdate.name = name
  }
  if (phone && !existing?.phone?.trim()) {
    customerUpdate.phone = phone
    if (params.rawPhone?.trim()) customerUpdate.phone_raw = params.rawPhone.trim()
  }
  if (email && !existing?.email?.trim()) customerUpdate.email = email

  if (Object.keys(customerUpdate).length > 0) {
    await supabaseAdmin
      .from('customers')
      .update(customerUpdate)
      .eq('id', targetCustomerId)
      .eq('business_id', business_id)
  }

  const displayName = name ?? existing?.name ?? returningGuest?.name
  if (displayName && !placeholderName.test(displayName.trim()) && isPlausibleGuestName(displayName)) {
    await supabaseAdmin
      .from('conversations')
      .update({ customer_name: normalizeName(displayName) })
      .eq('id', conversation_id)
      .eq('business_id', business_id)
  }

  return targetCustomerId
}

/**
 * Additively merge bot-discovered allergies/preferences into customers.notes.
 * Owner-written free text is preserved. Never throws — booking flow must not
 * break if the notes update fails; failures are logged and swallowed.
 */
async function persistGuestPreferences(params: {
  business_id: string
  customer_id: string
  allergies?: string | null
  preferences?: string | null
  occasions?: string | null
}): Promise<void> {
  const { business_id, customer_id } = params
  const allergies = params.allergies?.trim() || null
  const preferences = params.preferences?.trim() || null
  const occasions = params.occasions?.trim() || null
  if (!allergies && !preferences && !occasions) return

  try {
    const { data: existing } = await supabaseAdmin
      .from('customers')
      .select('notes')
      .eq('id', customer_id)
      .eq('business_id', business_id)
      .maybeSingle()

    const current = parseGuestNotes(
      (existing as { notes?: string | null } | null)?.notes ?? null,
    )
    const merged = mergeGuestPreferences(current, { allergies, preferences, occasions })
    const serialized = serializeGuestNotes(merged)
    if (serialized === serializeGuestNotes(current)) return

    await supabaseAdmin
      .from('customers')
      .update({ notes: serialized })
      .eq('id', customer_id)
      .eq('business_id', business_id)
  } catch (err) {
    console.error('[guest-prefs] Failed to persist preferences:', err)
  }
}

/** True if the customer record already has a phone or email on file. */
async function customerHasContact(customer_id: string, business_id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('customers')
    .select('phone, email')
    .eq('id', customer_id)
    .eq('business_id', business_id)
    .maybeSingle()
  if (!data) return false
  return Boolean(data.phone?.trim() || data.email?.trim())
}

type BookingEngineContext = {
  operatingHours: OperatingHours
  bookingSettings: BookingSettings
  existingBookings: ExistingBooking[]
  zones: DiningZone[]
}

// ─── Tool execution ───────────────────────────────────────────────────────────

type ToolContext = {
  business_id: string
  conversation_id: string
  customer_id: string
  bookingCtx: BookingEngineContext
  nowParts: WallClockParts
  chatMessages: ChatMessage[]
  ownerEmail: string | null
  ownerName: string | null
  notifSettings: NotificationSettings
  paymentSettings: PaymentSettings
  /** Base URL for guest-facing payment redirect pages. */
  baseUrl: string
  /** Escalation categories already alerted in this request (dedupe). */
  escalated: Set<string>
}

type ToolOutcome = {
  result: Record<string, unknown>
  created?: boolean
  cancelled?: boolean
  rescheduled?: boolean
  /** customer_id may change if persistGuest merges into a returning guest */
  customerId?: string
}

/** Build a Calgary wall-clock string from a YYYY-MM-DD date and HH:MM time. */
function buildWallClock(date: unknown, time: unknown): string | null {
  if (typeof date !== 'string' || typeof time !== 'string') return null
  const d = date.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const t = time.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!d || !t) return null
  const pad = (s: string) => s.padStart(2, '0')
  const hh = parseInt(t[1], 10)
  if (hh > 23 || parseInt(t[2], 10) > 59) return null
  return `${d[1]}-${pad(d[2])}-${pad(d[3])}T${pad(t[1])}:${t[2]}:00`
}

/**
 * Re-load active bookings for the Calgary day of `wallClock` straight from the DB.
 * Used for a fresh availability re-check right before insert to shrink the race
 * window where two concurrent chats book the last seats in the same slot.
 */
async function loadFreshBookingsForDay(
  business_id: string,
  wallClock: string,
): Promise<ExistingBooking[]> {
  const dateKey = wallClock.slice(0, 10)
  const fromIso = wallClockInCalgaryToUtcDate(`${dateKey}T00:00:00`).toISOString()
  const toIso = wallClockInCalgaryToUtcDate(`${addDaysToDateKey(dateKey, 1)}T00:00:00`).toISOString()

  const { data } = await supabaseAdmin
    .from('appointments')
    .select('id, scheduled_at, status, duration_minutes, zone_id, party_size')
    .eq('business_id', business_id)
    .gte('scheduled_at', fromIso)
    .lt('scheduled_at', toIso)

  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>
    const raw = String(row.scheduled_at ?? '')
    return {
      id: row.id != null ? String(row.id) : undefined,
      scheduled_at: scheduledAtToWallClock(raw) ?? raw,
      status: row.status != null ? String(row.status) : null,
      duration_minutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
      zone_id: row.zone_id != null ? String(row.zone_id) : null,
      party_size: row.party_size != null ? Number(row.party_size) : null,
    }
  })
}

type SeatingResolution =
  | { kind: 'zone'; zone: DiningZone }
  | { kind: 'any' }
  | { kind: 'unknown' }

/**
 * Resolve the seating_area tool arg to a concrete zone, "no preference", or
 * unknown. This is the ONLY place a zone is derived for booking — straight from
 * what the guest stated (passed verbatim by the model), never from defaults.
 */
function resolveSeatingArea(seatingArea: unknown, zones: DiningZone[]): SeatingResolution {
  if (typeof seatingArea !== 'string' || !seatingArea.trim()) return { kind: 'unknown' }
  const text = seatingArea.trim()
  if (
    guestAcceptsAnyZone(text) ||
    /\b(any(?:where)?|no\s*pref(?:erence)?|whatever|doesn'?t matter|surprise)\b/i.test(text)
  ) {
    return { kind: 'any' }
  }
  const active = zones.filter((z) => z.is_active)
  const exact = active.find((z) => z.name.toLowerCase() === text.toLowerCase())
  if (exact) return { kind: 'zone', zone: exact }
  const inferredId = inferZoneIdFromText(text, active)
  const inferred = inferredId ? active.find((z) => z.id === inferredId) : undefined
  if (inferred) return { kind: 'zone', zone: inferred }
  return { kind: 'unknown' }
}

/**
 * Collapse multi-zone slots into unique time labels so GPT sees the full day.
 * collectSlotsForZone appends " (ZoneName)" to each label, so the same time
 * looks different across zones and a label-based dedup won't merge them.
 * We deduplicate by wallClock (which is zone-agnostic) instead.
 */
function formatSlotsForTool(slots: AvailableSlot[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const s of slots) {
    if (!seen.has(s.wallClock)) {
      seen.add(s.wallClock)
      // Strip the " (ZoneName)" suffix that collectSlotsForZone appends.
      // Use a literal string check — never build a RegExp from a zone name,
      // since names may contain regex metacharacters (e.g. "Bar (Patio)").
      const suffix = s.zoneName ? ` (${s.zoneName})` : ''
      const cleanLabel =
        suffix && s.label.endsWith(suffix)
          ? s.label.slice(0, -suffix.length)
          : s.label
      result.push(cleanLabel)
    }
    if (result.length >= 60) break   // cap at 60 unique times (~15 hrs at 15-min intervals)
  }
  return result
}

/**
 * Explicit guard for dates the slot engine would silently return [] for.
 * Gives the model a *reason* it can relay, instead of "fully booked".
 */
function checkDateInBookableWindow(
  dateKey: string,
  ctx: ToolContext,
): Record<string, unknown> | null {
  const todayKey = wallClockDateKey(ctx.nowParts)
  if (dateKey < todayKey) {
    return {
      ok: false,
      error: 'past_date',
      message: `That date is in the past — today is ${todayKey}. Gently point this out and ask the guest for a future date. Do not offer alternatives for past dates.`,
    }
  }
  const maxDays = ctx.bookingCtx.bookingSettings.max_advance_days
  const horizonKey = addDaysToDateKey(todayKey, maxDays)
  if (dateKey > horizonKey) {
    return {
      ok: false,
      error: 'beyond_booking_window',
      message: `Reservations open up to ${maxDays} days ahead (through ${horizonKey}). Let the guest know and invite them to book within that window.`,
    }
  }
  return null
}

async function runCheckAvailability(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const wallClock = buildWallClock(args.date, '12:00')
  if (!wallClock) {
    return { result: { ok: false, error: 'invalid_date', message: 'Date must be YYYY-MM-DD.' } }
  }
  const dateKey = wallClock.slice(0, 10)
  const windowError = checkDateInBookableWindow(dateKey, ctx)
  if (windowError) return { result: windowError }
  const partySize =
    typeof args.party_size === 'number' && args.party_size > 0 ? Math.round(args.party_size) : 2
  const seating = resolveSeatingArea(args.seating_area, ctx.bookingCtx.zones)
  const zoneId = seating.kind === 'zone' ? seating.zone.id : null

  const slots = getOpenSlotsForDate({
    dateKey,
    operatingHours: ctx.bookingCtx.operatingHours,
    existing: ctx.bookingCtx.existingBookings,
    settings: ctx.bookingCtx.bookingSettings,
    now: ctx.nowParts,
    zones: ctx.bookingCtx.zones,
    partySize,
    zoneId,
  })

  if (slots.length === 0) {
    const alternatives = findNearestOpenSlots({
      targetWallClock: `${dateKey}T19:00:00`,
      operatingHours: ctx.bookingCtx.operatingHours,
      existing: ctx.bookingCtx.existingBookings,
      settings: ctx.bookingCtx.bookingSettings,
      now: ctx.nowParts,
      zones: ctx.bookingCtx.zones,
      partySize,
      zoneId,
      limit: 6,
    })
    const dayHours = getDayHoursForDate(ctx.bookingCtx.operatingHours, dateKey)
    return {
      result: {
        ok: true,
        date: dateKey,
        available_times: [],
        nearby_alternatives: formatSlotsForTool(alternatives),
        message: dayHours.closed
          ? 'The restaurant is CLOSED that day. Say so, then offer the nearby alternatives.'
          : 'No open times on that date. Offer the nearby alternatives, and mention the waitlist if the guest declines them all.',
      },
    }
  }

  const dayHours = getDayHoursForDate(ctx.bookingCtx.operatingHours, dateKey)
  const hoursLabel = dayHours.closed ? 'Closed' : formatHoursRangeLabel(dayHours)

  return {
    result: {
      ok: true,
      date: dateKey,
      hours: hoursLabel,
      available_times: formatSlotsForTool(slots),
      slot_count: slots.length,
    },
  }
}

/**
 * Guard against fabricated names: the guest_name (or at least its first word)
 * must appear somewhere in the conversation. This allows the returning-guest
 * confirmation flow (the assistant proposed the name and the guest agreed) while
 * blocking names the model invented from nowhere.
 */
function guestNameMentionedInConversation(name: string, messages: ChatMessage[]): boolean {
  const firstName = name.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  if (firstName.length < 2) return false
  const allText = messages.map((m) => m.content).join(' ').toLowerCase()
  return allText.includes(firstName)
}

async function runCreateReservation(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const activeZones = ctx.bookingCtx.zones.filter((z) => z.is_active)
  const multiZone = activeZones.length > 1

  // ── Field validation: ALL booking data must arrive via the tool args. ──────
  // The prompt's only job is to collect these from the guest; nothing here is
  // inferred from conversation text or defaulted.
  const guestName = typeof args.guest_name === 'string' ? args.guest_name.trim() : ''
  const date = typeof args.date === 'string' ? args.date.trim() : ''
  const time = typeof args.time === 'string' ? args.time.trim() : ''
  const partySize =
    typeof args.party_size === 'number' && args.party_size >= 1 ? Math.round(args.party_size) : null
  const seating = resolveSeatingArea(args.seating_area, ctx.bookingCtx.zones)

  const missing: string[] = []
  if (!guestName || !isPlausibleGuestName(guestName)) missing.push('guest_name')
  if (!date) missing.push('date')
  if (!time) missing.push('time')
  if (partySize == null) missing.push('party_size')
  if (multiZone && seating.kind === 'unknown') missing.push('seating_area')

  if (missing.length > 0 || partySize == null) {
    const zoneHint = missing.includes('seating_area')
      ? ` Seating options: ${formatZoneNamesList(activeZonesForParty(activeZones, partySize ?? 2))} (the guest may also say "no preference").`
      : ''
    return {
      result: {
        ok: false,
        error: 'missing_fields',
        missing_fields: missing,
        message: `Booking refused — ask the guest for: ${missing.join(', ')}. Do not guess or invent any field.${zoneHint}`,
      },
    }
  }

  if (!guestNameMentionedInConversation(guestName, ctx.chatMessages)) {
    return {
      result: {
        ok: false,
        error: 'missing_fields',
        missing_fields: ['guest_name'],
        message: 'Ask the guest for their name explicitly before booking. Do not invent or assume a name.',
      },
    }
  }

  // Anti-fabrication guard for the zone, mirroring the name guard above: the
  // chosen zone (or "no preference") must appear in the guest's OWN messages.
  // Otherwise the model invented it — refuse and force it to ask.
  if (multiZone) {
    const guestText = getUserMessagesCombined(ctx.chatMessages)
    const guestStatedZone =
      seating.kind === 'zone' &&
      inferZoneIdFromText(guestText, [seating.zone]) === seating.zone.id
    const guestStatedAny = seating.kind === 'any' && guestAcceptsAnyZone(guestText)
    if (!guestStatedZone && !guestStatedAny) {
      return {
        result: {
          ok: false,
          error: 'missing_fields',
          missing_fields: ['seating_area'],
          message: `The guest has NOT chosen a seating area yet — do not pick one for them. Ask which they prefer: ${formatZoneNamesList(activeZonesForParty(activeZones, partySize))} (they may also say "no preference").`,
        },
      }
    }
  }

  if (ctx.bookingCtx.bookingSettings.require_contact_before_booking) {
    const argContact = normalizeGuestContact({
      phone: typeof args.phone === 'string' ? args.phone : null,
      email: typeof args.email === 'string' ? args.email : null,
    })
    let hasContact = Boolean(argContact.phone || argContact.email)
    if (!hasContact) {
      const fromMsgs = extractContactFromMessages(ctx.chatMessages)
      hasContact = Boolean(fromMsgs.phone || fromMsgs.email)
    }
    if (!hasContact) {
      hasContact = await customerHasContact(ctx.customer_id, ctx.business_id)
    }
    if (!hasContact) {
      return {
        result: {
          ok: false,
          error: 'missing_contact',
          message:
            'Ask for a phone number or email before booking — it is required to send the confirmation and recognize the guest next time.',
        },
      }
    }
  }

  let wallClock = buildWallClock(date, time)
  if (!wallClock) {
    return { result: { ok: false, error: 'invalid_datetime', message: 'Provide date as YYYY-MM-DD and time as HH:MM.' } }
  }

  const windowError = checkDateInBookableWindow(wallClock.slice(0, 10), ctx)
  if (windowError) return { result: windowError }

  const interval = ctx.bookingCtx.bookingSettings.slot_interval_minutes
  const snapped = snapWallClockToSlotInterval(wallClock, interval)
  const requestedTime = wallClock.slice(11, 16)
  if (snapped && snapped !== wallClock) {
    wallClock = snapped
  }

  // The guest's chosen zone is FINAL. "no preference" leaves it null so the
  // system may assign any zone with room; a named zone is never substituted.
  const chosenZone = seating.kind === 'zone' ? seating.zone : null
  const preferredZoneId = chosenZone?.id ?? null

  console.log('[booking] seating from tool args:', {
    seatingArea: args.seating_area ?? null,
    resolved: seating.kind,
    zoneName: chosenZone?.name ?? null,
  })

  // Prevent duplicates for this conversation.
  const { count } = await supabaseAdmin
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', ctx.conversation_id)
    .not('status', 'eq', 'cancelled')
  if (count && count > 0) {
    return { result: { ok: false, error: 'already_booked', message: 'A reservation already exists for this guest.' } }
  }

  const available = isSlotAvailable({
    wallClock,
    operatingHours: ctx.bookingCtx.operatingHours,
    existing: ctx.bookingCtx.existingBookings,
    settings: ctx.bookingCtx.bookingSettings,
    now: ctx.nowParts,
    zones: ctx.bookingCtx.zones,
    partySize,
    zoneId: preferredZoneId,
  })

  if (!available) {
    const alternatives = findNearestOpenSlots({
      targetWallClock: wallClock,
      operatingHours: ctx.bookingCtx.operatingHours,
      existing: ctx.bookingCtx.existingBookings,
      settings: ctx.bookingCtx.bookingSettings,
      now: ctx.nowParts,
      zones: ctx.bookingCtx.zones,
      partySize,
      zoneId: preferredZoneId,
      limit: 5,
    })
    const bookedTime = wallClock.slice(11, 16)
    return {
      result: {
        ok: false,
        error: 'not_available',
        message:
          requestedTime !== bookedTime
            ? `Only ${interval}-minute start times. Nearest slot ${bookedTime} is full — offer alternatives.`
            : 'That time is not available. Offer the alternatives.',
        booked_time: bookedTime,
        nearby_alternatives: formatSlotsForTool(alternatives),
      },
    }
  }

  // Zone assignment: a guest-chosen zone is saved EXACTLY as stated. Only when
  // the guest said "no preference" (or a single zone exists) does the system
  // pick a zone with room at that slot.
  const assignedZone =
    chosenZone ??
    (multiZone
      ? pickZoneForSlot(
          wallClock,
          ctx.bookingCtx.zones,
          partySize,
          ctx.bookingCtx.operatingHours,
          ctx.bookingCtx.existingBookings,
          ctx.bookingCtx.bookingSettings,
          null,
          ctx.nowParts,
        )
      : activeZones[0] ?? null)
  const zoneId = assignedZone?.id ?? null
  if (!zoneId) {
    return { result: { ok: false, error: 'no_zone', message: 'Could not assign a dining area for that slot.' } }
  }

  const durationMinutes =
    assignedZone?.turnover_minutes ?? ctx.bookingCtx.bookingSettings.default_duration_minutes
  const zoneLabel = assignedZone?.name ?? null
  const notes = typeof args.special_requests === 'string' && args.special_requests.trim()
    ? args.special_requests.trim()
    : null

  // Fresh availability re-check against the latest DB state (shrinks the race
  // window where another guest grabbed the last seats since context was loaded).
  const freshBookings = await loadFreshBookingsForDay(ctx.business_id, wallClock)
  const stillAvailable = isSlotAvailable({
    wallClock,
    operatingHours: ctx.bookingCtx.operatingHours,
    existing: freshBookings,
    settings: ctx.bookingCtx.bookingSettings,
    now: ctx.nowParts,
    zones: ctx.bookingCtx.zones,
    partySize,
    zoneId,
  })
  if (!stillAvailable) {
    const alternatives = findNearestOpenSlots({
      targetWallClock: wallClock,
      operatingHours: ctx.bookingCtx.operatingHours,
      existing: freshBookings,
      settings: ctx.bookingCtx.bookingSettings,
      now: ctx.nowParts,
      zones: ctx.bookingCtx.zones,
      partySize,
      zoneId,
      limit: 5,
    })
    return {
      result: {
        ok: false,
        error: 'not_available',
        message: 'That time was just taken. Offer the alternatives.',
        nearby_alternatives: formatSlotsForTool(alternatives),
      },
    }
  }

  const scheduledAtIso = wallClockInCalgaryToUtcDate(wallClock).toISOString()
  const svcParts = [guestName, `Party of ${partySize}`]
  if (zoneLabel) svcParts.push(zoneLabel)
  const serviceName = svcParts.join(' · ').slice(0, 500)

  // Persist guest details first (may merge into a returning guest record).
  const targetCustomerId = await persistGuest({
    business_id: ctx.business_id,
    customer_id: ctx.customer_id,
    conversation_id: ctx.conversation_id,
    rawName: guestName,
    rawPhone: typeof args.phone === 'string' ? args.phone : null,
    rawEmail: typeof args.email === 'string' ? args.email : null,
    authoritativeName: true,
  })

  const { data: inserted, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      business_id: ctx.business_id,
      customer_id: targetCustomerId,
      conversation_id: ctx.conversation_id,
      service_name: serviceName,
      scheduled_at: scheduledAtIso,
      status: 'pending' as const,
      notes,
      duration_minutes: durationMinutes,
      party_size: partySize,
      zone_id: zoneId,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[booking] Insert failed:', error.message)
    return { result: { ok: false, error: 'db_error', message: 'Could not save the reservation. Try again.' } }
  }

  await bumpCustomerVisitStats(targetCustomerId, ctx.business_id)
  console.log('[booking] Reservation created via tool:', { guestName, partySize, wallClock, zoneLabel })

  // The model doesn't reliably call save_guest_details for allergies mentioned
  // inline while booking — persist dietary special requests to the guest
  // profile here so returning-guest recognition always knows about them.
  if (notes && /\b(allerg|gluten|vegan|vegetarian|dairy|lactose|nut|peanut|shellfish|celiac|coeliac|kosher|halal|intoleran)/i.test(notes)) {
    await persistGuestPreferences({
      business_id: ctx.business_id,
      customer_id: targetCustomerId,
      allergies: notes,
    })
    triggerEscalation(
      ctx,
      'allergy',
      `${guestName} (party of ${partySize}, ${wallClock.slice(0, 10)} ${wallClock.slice(11, 16)}) noted: ${notes}`,
    )
  }

  if (partySize >= 8) {
    triggerEscalation(
      ctx,
      'large_party',
      `${guestName} booked a party of ${partySize} for ${wallClock.slice(0, 10)} at ${wallClock.slice(11, 16)}${zoneLabel ? ` (${zoneLabel})` : ''}.`,
    )
  }

  // Deposit link (best effort — the booking stands even if Stripe is down).
  const paymentLink = inserted?.id
    ? await createDepositCheckoutLink({
        appointmentId: inserted.id,
        partySize,
        businessName: ctx.ownerName ?? 'the restaurant',
        businessId: ctx.business_id,
        settings: ctx.paymentSettings,
        baseUrl: ctx.baseUrl,
      })
    : null

  if (ctx.notifSettings.email_on_reservation) {
    queueReservationBookedEmail(ctx.ownerEmail, ctx.ownerName, {
      guestName,
      partySize,
      date: wallClock.slice(0, 10),
      time: wallClock.slice(11, 16),
      zone: zoneLabel ?? null,
      notes: notes ?? null,
    })
  }

  // Guest-facing confirmation, when we know their email.
  if (ctx.notifSettings.email_guest_confirmation) {
    let guestEmail =
      normalizeGuestContact({ email: typeof args.email === 'string' ? args.email : null }).email ??
      extractContactFromMessages(ctx.chatMessages).email ??
      null
    if (!guestEmail) {
      const { data: custRow } = await supabaseAdmin
        .from('customers')
        .select('email')
        .eq('id', targetCustomerId)
        .eq('business_id', ctx.business_id)
        .maybeSingle()
      guestEmail = custRow?.email?.trim() || null
    }
    if (guestEmail) {
      queueGuestConfirmationEmail(guestEmail, ctx.ownerName ?? 'the restaurant', {
        guestName,
        partySize,
        date: wallClock.slice(0, 10),
        time: wallClock.slice(11, 16),
        zone: zoneLabel ?? null,
        notes: notes ?? null,
        paymentLink: paymentLink?.url ?? null,
        depositAmount: paymentLink?.amountLabel ?? null,
      })
    }
  }

  return {
    created: true,
    customerId: targetCustomerId,
    result: {
      ok: true,
      guest_name: guestName,
      party_size: partySize,
      date: wallClock.slice(0, 10),
      time: wallClock.slice(11, 16),
      dining_area: zoneLabel,
      special_requests: notes,
      ...(paymentLink
        ? {
            deposit_required: true,
            deposit_amount: paymentLink.amountLabel,
            payment_link: paymentLink.url,
          }
        : {}),
    },
  }
}

/**
 * Creates a Stripe Checkout link for a reservation deposit.
 * Returns null when deposits are off, Stripe is unconfigured, or Stripe errors.
 */
async function createDepositCheckoutLink(params: {
  appointmentId: string
  partySize: number
  businessName: string
  businessId: string
  settings: PaymentSettings
  baseUrl: string
}): Promise<{ url: string; amountLabel: string } | null> {
  const amountCents = depositAmountCents(params.settings, params.partySize)
  if (amountCents == null) return null
  const stripe = getStripe()
  if (!stripe) return null

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: params.partySize,
          price_data: {
            currency: 'cad',
            unit_amount: Math.round(amountCents / params.partySize),
            product_data: {
              name: `Reservation deposit — ${params.businessName}`,
              description: `Party of ${params.partySize}`,
            },
          },
        },
      ],
      metadata: {
        appointment_id: params.appointmentId,
        business_id: params.businessId,
      },
      success_url: `${params.baseUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${params.baseUrl}/pay/cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    })
    if (!session.url) return null

    await supabaseAdmin
      .from('appointments')
      .update({
        deposit_status: 'pending',
        deposit_amount_cents: amountCents,
        stripe_checkout_session_id: session.id,
      })
      .eq('id', params.appointmentId)

    return { url: session.url, amountLabel: `$${(amountCents / 100).toFixed(2)} CAD` }
  } catch (err) {
    console.error('[payments] Deposit link failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Find the guest's current active reservation (by conversation, then by customer). */
async function findActiveAppointment(ctx: ToolContext): Promise<{ id: string; zone_id: string | null } | null> {
  const { data: byConv } = await supabaseAdmin
    .from('appointments')
    .select('id, zone_id')
    .eq('conversation_id', ctx.conversation_id)
    .in('status', ['pending', 'confirmed', 'seated'])
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (byConv?.id) return { id: byConv.id, zone_id: byConv.zone_id != null ? String(byConv.zone_id) : null }

  const nowIso = new Date().toISOString()
  const { data: byCustomer } = await supabaseAdmin
    .from('appointments')
    .select('id, zone_id')
    .eq('business_id', ctx.business_id)
    .eq('customer_id', ctx.customer_id)
    .in('status', ['pending', 'confirmed', 'seated'])
    .gte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (byCustomer?.id) return { id: byCustomer.id, zone_id: byCustomer.zone_id != null ? String(byCustomer.zone_id) : null }

  return null
}

async function runCancelReservation(ctx: ToolContext): Promise<ToolOutcome> {
  const appt = await findActiveAppointment(ctx)
  if (!appt) {
    return { result: { ok: false, error: 'not_found', message: 'No active reservation found to cancel.' } }
  }
  const { error } = await supabaseAdmin
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appt.id)
    .eq('business_id', ctx.business_id)
  if (error) {
    return { result: { ok: false, error: 'db_error', message: 'Could not cancel. Try again.' } }
  }
  console.log('[cancel] Reservation cancelled via tool:', appt.id)
  return { cancelled: true, result: { ok: true } }
}

async function runRescheduleReservation(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const appt = await findActiveAppointment(ctx)
  if (!appt) {
    return { result: { ok: false, error: 'not_found', message: 'No active reservation found to move.' } }
  }

  let wallClock = buildWallClock(args.new_date, args.new_time)
  if (!wallClock) {
    return { result: { ok: false, error: 'invalid_datetime', message: 'Provide new_date as YYYY-MM-DD and new_time as HH:MM.' } }
  }

  // Snap to the configured slot grid, same as create_reservation.
  const snappedReschedule = snapWallClockToSlotInterval(
    wallClock,
    ctx.bookingCtx.bookingSettings.slot_interval_minutes,
  )
  if (snappedReschedule && snappedReschedule !== wallClock) {
    wallClock = snappedReschedule
  }

  // Read the current party size off the existing appointment.
  const { data: apptRow } = await supabaseAdmin
    .from('appointments')
    .select('party_size')
    .eq('id', appt.id)
    .maybeSingle()
  const partySize = apptRow?.party_size && apptRow.party_size > 0 ? apptRow.party_size : 2
  const preferredZoneId = appt.zone_id

  const available = isSlotAvailable({
    wallClock,
    operatingHours: ctx.bookingCtx.operatingHours,
    existing: ctx.bookingCtx.existingBookings,
    settings: ctx.bookingCtx.bookingSettings,
    now: ctx.nowParts,
    excludeAppointmentId: appt.id,
    zones: ctx.bookingCtx.zones,
    partySize,
    zoneId: preferredZoneId,
  })

  if (!available) {
    const alternatives = findNearestOpenSlots({
      targetWallClock: wallClock,
      operatingHours: ctx.bookingCtx.operatingHours,
      existing: ctx.bookingCtx.existingBookings,
      settings: ctx.bookingCtx.bookingSettings,
      now: ctx.nowParts,
      zones: ctx.bookingCtx.zones,
      partySize,
      zoneId: preferredZoneId,
      limit: 5,
    })
    return {
      result: {
        ok: false,
        error: 'not_available',
        message: 'That new time is not available. Offer the alternatives.',
        nearby_alternatives: formatSlotsForTool(alternatives),
      },
    }
  }

  // Fresh availability re-check against the latest DB state, mirroring
  // create_reservation (context bookings may be minutes old by now).
  const freshBookings = await loadFreshBookingsForDay(ctx.business_id, wallClock)
  const stillAvailable = isSlotAvailable({
    wallClock,
    operatingHours: ctx.bookingCtx.operatingHours,
    existing: freshBookings,
    settings: ctx.bookingCtx.bookingSettings,
    now: ctx.nowParts,
    excludeAppointmentId: appt.id,
    zones: ctx.bookingCtx.zones,
    partySize,
    zoneId: preferredZoneId,
  })
  if (!stillAvailable) {
    const alternatives = findNearestOpenSlots({
      targetWallClock: wallClock,
      operatingHours: ctx.bookingCtx.operatingHours,
      existing: freshBookings,
      settings: ctx.bookingCtx.bookingSettings,
      now: ctx.nowParts,
      zones: ctx.bookingCtx.zones,
      partySize,
      zoneId: preferredZoneId,
      limit: 5,
    })
    return {
      result: {
        ok: false,
        error: 'not_available',
        message: 'That new time was just taken. Offer the alternatives.',
        nearby_alternatives: formatSlotsForTool(alternatives),
      },
    }
  }

  const assignedZone = pickZoneForSlot(
    wallClock,
    ctx.bookingCtx.zones,
    partySize,
    ctx.bookingCtx.operatingHours,
    ctx.bookingCtx.existingBookings,
    ctx.bookingCtx.bookingSettings,
    preferredZoneId,
    ctx.nowParts,
  )
  const durationMinutes =
    assignedZone?.turnover_minutes ?? ctx.bookingCtx.bookingSettings.default_duration_minutes

  const { error } = await supabaseAdmin
    .from('appointments')
    .update({
      scheduled_at: wallClockInCalgaryToUtcDate(wallClock).toISOString(),
      duration_minutes: durationMinutes,
      zone_id: assignedZone?.id ?? preferredZoneId,
      party_size: partySize,
    })
    .eq('id', appt.id)
    .eq('business_id', ctx.business_id)

  if (error) {
    return { result: { ok: false, error: 'db_error', message: 'Could not reschedule. Try again.' } }
  }
  console.log('[reschedule] Reservation moved via tool:', appt.id, wallClock)
  return {
    rescheduled: true,
    result: { ok: true, date: wallClock.slice(0, 10), time: wallClock.slice(11, 16) },
  }
}

async function runSaveGuestDetails(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const customerId = await persistGuest({
    business_id: ctx.business_id,
    customer_id: ctx.customer_id,
    conversation_id: ctx.conversation_id,
    rawName: typeof args.name === 'string' ? args.name : null,
    rawPhone: typeof args.phone === 'string' ? args.phone : null,
    rawEmail: typeof args.email === 'string' ? args.email : null,
  })

  await persistGuestPreferences({
    business_id: ctx.business_id,
    customer_id: customerId,
    allergies: typeof args.allergies === 'string' ? args.allergies : null,
    preferences: typeof args.preferences === 'string' ? args.preferences : null,
    occasions: typeof args.occasions === 'string' ? args.occasions : null,
  })

  if (typeof args.allergies === 'string' && args.allergies.trim()) {
    const who = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : 'A guest'
    triggerEscalation(ctx, 'allergy', `${who} mentioned: ${args.allergies.trim().slice(0, 200)}`)
  }

  return { customerId, result: { ok: true } }
}

async function runJoinWaitlist(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const guestName = typeof args.guest_name === 'string' ? args.guest_name.trim() : ''
  const date = typeof args.date === 'string' ? args.date.trim() : ''
  const time = typeof args.time === 'string' ? args.time.trim() : ''
  const partySize =
    typeof args.party_size === 'number' && args.party_size >= 1 ? Math.round(args.party_size) : 0
  const phone = typeof args.phone === 'string' ? args.phone.trim() : ''
  const email = typeof args.email === 'string' ? args.email.trim() : ''

  const timeParts = time.match(/^(\d{1,2}):(\d{2})$/)
  const timeValid =
    timeParts != null && parseInt(timeParts[1], 10) <= 23 && parseInt(timeParts[2], 10) <= 59

  const missing: string[] = []
  if (!guestName) missing.push('guest_name')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) missing.push('date')
  if (!timeValid) missing.push('time')
  if (partySize < 1) missing.push('party_size')
  if (!phone && !email) missing.push('phone_or_email')
  if (missing.length > 0) {
    return {
      result: {
        ok: false,
        error: 'missing_fields',
        missing_fields: missing,
        message: 'Ask the guest for the missing fields, then call join_waitlist again.',
      },
    }
  }

  // Best-effort zone match from the guest's stated preference.
  const seatingArea = typeof args.seating_area === 'string' ? args.seating_area : ''
  const zoneId = guestAcceptsAnyZone(seatingArea)
    ? null
    : inferZoneIdFromText(seatingArea, ctx.bookingCtx.zones)

  const targetCustomerId = await persistGuest({
    business_id: ctx.business_id,
    customer_id: ctx.customer_id,
    conversation_id: ctx.conversation_id,
    rawName: guestName,
    rawPhone: phone || null,
    rawEmail: email || null,
  })

  const { error } = await supabaseAdmin.from('waitlist_entries').insert({
    business_id: ctx.business_id,
    customer_id: targetCustomerId,
    conversation_id: ctx.conversation_id,
    guest_name: guestName,
    phone: phone || null,
    email: email || null,
    requested_date: date,
    requested_time: time.padStart(5, '0'),
    party_size: partySize,
    zone_id: zoneId,
    notes: typeof args.notes === 'string' && args.notes.trim() ? args.notes.trim() : null,
  })

  if (error) {
    console.error('[waitlist] Insert failed:', error.message)
    return { result: { ok: false, error: 'db_error', message: 'Could not join the waitlist. Try again.' } }
  }

  console.log('[waitlist] Guest waitlisted:', { guestName, date, time, partySize })
  return {
    customerId: targetCustomerId,
    result: {
      ok: true,
      message:
        'Guest added to the waitlist. Tell them the restaurant will reach out as soon as a table for that time frees up.',
      date,
      time,
      party_size: partySize,
    },
  }
}

type EscalationCategory = 'complaint' | 'large_party' | 'allergy' | 'other'

function escalationEnabled(category: EscalationCategory, settings: NotificationSettings): boolean {
  if (category === 'complaint') return settings.escalate_complaint
  if (category === 'large_party') return settings.escalate_large_party
  if (category === 'allergy') return settings.escalate_allergy
  return true
}

/**
 * Alert the owner about a conversation that needs human attention. Deduped per
 * category within a request; honors the per-category toggles in Settings.
 */
function triggerEscalation(ctx: ToolContext, category: EscalationCategory, reason: string): void {
  if (!escalationEnabled(category, ctx.notifSettings)) return
  if (ctx.escalated.has(category)) return
  ctx.escalated.add(category)
  queueEscalationOwnerEmail(ctx.ownerEmail, ctx.ownerName, {
    category,
    reason,
    conversationId: ctx.conversation_id,
    baseUrl: ctx.baseUrl,
  })
}

async function runEscalateToManager(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const rawCategory = typeof args.category === 'string' ? args.category : 'other'
  const category: EscalationCategory = (
    ['complaint', 'large_party', 'allergy', 'other'] as const
  ).includes(rawCategory as EscalationCategory)
    ? (rawCategory as EscalationCategory)
    : 'other'
  const reason =
    typeof args.reason === 'string' && args.reason.trim()
      ? args.reason.trim().slice(0, 300)
      : 'Guest needs staff attention'

  triggerEscalation(ctx, category, reason)
  return {
    result: {
      ok: true,
      message:
        'The team has been alerted and will follow up. Reassure the guest briefly and continue helping them normally.',
    },
  }
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  switch (name as ToolName) {
    case 'check_availability':
      return runCheckAvailability(args, ctx)
    case 'create_reservation':
      return runCreateReservation(args, ctx)
    case 'reschedule_reservation':
      return runRescheduleReservation(args, ctx)
    case 'cancel_reservation':
      return runCancelReservation(ctx)
    case 'save_guest_details':
      return runSaveGuestDetails(args, ctx)
    case 'join_waitlist':
      return runJoinWaitlist(args, ctx)
    case 'escalate_to_manager':
      return runEscalateToManager(args, ctx)
    default:
      return { result: { ok: false, error: 'unknown_tool' } }
  }
}

// ─── Notification email ───────────────────────────────────────────────────────

/** Guest-supplied strings go into owner emails — escape them so a guest can't inject HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Fire-and-forget; never throws. Sends a notification when a new guest opens a chat. */
function queueNewConversationOwnerEmail(
  ownerEmail: string | null | undefined,
  businessName: string | null | undefined,
) {
  const to = typeof ownerEmail === 'string' ? ownerEmail.trim() : ''
  if (!to) return

  void (async () => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return
    try {
      const resend = new Resend(apiKey)
      const from = process.env.RESEND_FROM_EMAIL?.trim() || 'onboarding@resend.dev'
      await resend.emails.send({
        from,
        to,
        subject: `New guest started a chat — ${businessName ?? 'Your restaurant'}`,
        text: `A new guest just started chatting with your AI Concierge.\n\nReview the conversation in your OceanCore inbox.`,
      })
    } catch {
      // Swallow notification failures so they never affect the chat response.
    }
  })()
}

/** Fire-and-forget; never throws. Alerts the owner that a chat needs human attention. */
function queueEscalationOwnerEmail(
  ownerEmail: string | null,
  businessName: string | null,
  details: {
    category: string
    reason: string
    conversationId: string
    baseUrl: string
  },
) {
  const to = typeof ownerEmail === 'string' ? ownerEmail.trim() : ''
  if (!to) return

  void (async () => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return
    try {
      const resend = new Resend(apiKey)
      const from = process.env.RESEND_FROM_EMAIL?.trim() || 'onboarding@resend.dev'
      const categoryLabel: Record<string, string> = {
        complaint: 'Guest complaint',
        large_party: 'Large party request',
        allergy: 'Allergy / dietary risk',
        other: 'Needs attention',
      }
      const label = categoryLabel[details.category] ?? 'Needs attention'
      const chatUrl = `${details.baseUrl}/dashboard/chats?conversation=${details.conversationId}`
      const reasonHtml = escapeHtml(details.reason)

      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(label)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
  <tr><td style="background:#7c2d12;border-radius:14px 14px 0 0;padding:24px 32px;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.14em;color:#fdba74;text-transform:uppercase;">OceanCore · Escalation</p>
    <p style="margin:0;font-size:20px;font-weight:700;color:#fff7ed;">${escapeHtml(label)}</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:26px 32px;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;">What the guest needs</p>
    <p style="margin:0 0 22px;font-size:15px;color:#0f172a;line-height:1.6;">${reasonHtml}</p>
    <a href="${chatUrl}" style="display:block;text-align:center;background:#0c1a2e;color:#f8fafc;text-decoration:none;font-size:13px;font-weight:600;padding:13px 24px;border-radius:9px;">Open the conversation →</a>
  </td></tr>
  <tr><td style="padding:14px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">Sent by OceanCore for ${escapeHtml(businessName ?? 'your restaurant')}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

      const result = await resend.emails.send({
        from,
        to,
        subject: `⚠ ${label} — a guest needs attention`,
        html,
        text: `${label}\n\n${details.reason}\n\nOpen the conversation: ${chatUrl}`,
      })
      if (result.error) {
        console.error('[email] Escalation email error:', result.error)
      } else {
        console.log(`[email] Escalation alert sent (${details.category}), id:`, result.data?.id)
      }
    } catch (err) {
      console.error('[email] Unexpected error sending escalation email:', err)
    }
  })()
}

/** Fire-and-forget; never throws. Sends the GUEST a warm booking confirmation. */
function queueGuestConfirmationEmail(
  guestEmail: string,
  restaurantName: string,
  details: {
    guestName: string
    partySize: number
    date: string
    time: string
    zone: string | null
    notes: string | null
    paymentLink?: string | null
    depositAmount?: string | null
  },
) {
  const to = guestEmail.trim()
  if (!to) return

  void (async () => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) return
    try {
      const resend = new Resend(apiKey)
      const from = process.env.RESEND_FROM_EMAIL?.trim() || 'onboarding@resend.dev'
      const restaurant = escapeHtml(restaurantName)
      const firstName = escapeHtml(details.guestName.split(/\s+/)[0] || 'there')

      const dateObj = new Date(`${details.date}T12:00:00`)
      const formattedDate = dateObj.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      })
      const [h, m] = details.time.split(':').map(Number)
      const formattedTime = `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`

      const rows = [
        ['When', `${formattedDate} · ${formattedTime}`],
        ['Party', `${details.partySize} ${details.partySize === 1 ? 'guest' : 'guests'}`],
        ...(details.zone ? [['Seating', details.zone]] : []),
        ...(details.notes ? [['Requests', details.notes]] : []),
      ]
        .map(
          ([k, v]) => `<tr>
            <td style="padding:9px 0;font-size:12px;color:#94a3b8;width:88px;vertical-align:top;">${escapeHtml(k)}</td>
            <td style="padding:9px 0;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(v)}</td>
          </tr>`,
        )
        .join('')

      const depositBlock =
        details.paymentLink && details.depositAmount
          ? `<div style="margin-top:20px;padding:14px 16px;border-radius:10px;background:#fefce8;border:1px solid #fde68a;">
              <p style="margin:0 0 10px;font-size:13px;color:#713f12;line-height:1.5;">A ${escapeHtml(details.depositAmount)} deposit secures your table. Your reservation is fully confirmed once it's paid.</p>
              <a href="${details.paymentLink}" style="display:inline-block;background:#0c1a2e;color:#f8fafc;text-decoration:none;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;">Pay deposit</a>
            </div>`
          : ''

      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Your reservation at ${restaurant}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
  <tr><td style="background:#0c1a2e;border-radius:14px 14px 0 0;padding:28px 32px;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.14em;color:#38bdf8;text-transform:uppercase;">${restaurant}</p>
    <p style="margin:0;font-size:22px;font-weight:700;color:#f8fafc;letter-spacing:-0.01em;">You're booked, ${firstName}!</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:24px 32px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">${rows}</table>
    ${depositBlock}
    <p style="margin:22px 0 0;font-size:13px;color:#475569;line-height:1.6;">Plans changed? Just reply in the chat where you booked and we'll move or cancel it for you.</p>
  </td></tr>
  <tr><td style="padding:14px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">Sent by ${restaurant} via OceanCore</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

      const text = [
        `You're booked at ${restaurantName}, ${details.guestName.split(/\s+/)[0]}!`,
        '',
        `When: ${formattedDate} at ${formattedTime}`,
        `Party: ${details.partySize}`,
        details.zone ? `Seating: ${details.zone}` : '',
        details.notes ? `Requests: ${details.notes}` : '',
        details.paymentLink ? `Deposit (${details.depositAmount}): ${details.paymentLink}` : '',
      ].filter(Boolean).join('\n')

      const result = await resend.emails.send({
        from,
        to,
        subject: `Your table at ${restaurantName} — ${formattedDate}, ${formattedTime}`,
        html,
        text,
      })
      if (result.error) console.error('[email] Guest confirmation error:', result.error)
    } catch (err) {
      console.error('[email] Unexpected error sending guest confirmation:', err)
    }
  })()
}

/** Fire-and-forget; never throws. Sends owner an email when a reservation is confirmed. */
function queueReservationBookedEmail(
  ownerEmail: string | null,
  ownerName: string | null,
  details: {
    guestName: string
    partySize: number
    date: string
    time: string
    zone: string | null
    notes: string | null
  },
) {
  const to = typeof ownerEmail === 'string' ? ownerEmail.trim() : ''
  if (!to) return

  void (async () => {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn('[email] RESEND_API_KEY not set — skipping reservation email')
      return
    }
    try {
      const resend = new Resend(apiKey)
      const from = process.env.RESEND_FROM_EMAIL?.trim() || 'onboarding@resend.dev'
      const restaurant = escapeHtml(ownerName ?? 'Your restaurant')
      const zoneLabel = escapeHtml(details.zone ?? 'Main dining')
      const guestNameHtml = escapeHtml(details.guestName)
      const notesHtml = details.notes ? escapeHtml(details.notes) : null
      const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings`
        : 'https://app.oceancore.co/dashboard/bookings'

      // Format date: 2026-06-16 → Mon, Jun 16 2026
      const dateObj = new Date(`${details.date}T12:00:00`)
      const formattedDate = dateObj.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      })
      // Format time: 19:00 → 7:00 PM
      const [h, m] = details.time.split(':').map(Number)
      const formattedTime = `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>New Reservation</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">

  <!-- Header bar -->
  <tr><td style="background:#0c1a2e;border-radius:14px 14px 0 0;padding:28px 32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td>
          <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.14em;color:#38bdf8;text-transform:uppercase;">OceanCore</p>
          <p style="margin:0;font-size:20px;font-weight:700;color:#f8fafc;letter-spacing:-0.01em;">New Reservation</p>
        </td>
        <td align="right" valign="top">
          <span style="display:inline-block;background:#1e3a5f;border:1px solid #2d5a8e;border-radius:20px;padding:5px 12px;font-size:11px;font-weight:600;color:#7dd3fc;white-space:nowrap;">${restaurant}</span>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- White card body -->
  <tr><td style="background:#ffffff;padding:28px 32px 24px;">

    <!-- Guest name -->
    <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;">Guest</p>
    <p style="margin:0 0 24px;font-size:24px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">${guestNameHtml}</p>

    <!-- Divider -->
    <div style="height:1px;background:#f1f5f9;margin-bottom:24px;"></div>

    <!-- Details row -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px;">
      <tr>
        <td style="padding-right:6px;vertical-align:top;width:25%;">
          <p style="margin:0 0 3px;font-size:9px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;">Date</p>
          <p style="margin:0;font-size:13px;font-weight:600;color:#1e293b;line-height:1.4;">${formattedDate}</p>
        </td>
        <td style="padding:0 6px;vertical-align:top;width:20%;">
          <p style="margin:0 0 3px;font-size:9px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;">Time</p>
          <p style="margin:0;font-size:13px;font-weight:600;color:#1e293b;">${formattedTime}</p>
        </td>
        <td style="padding:0 6px;vertical-align:top;width:25%;">
          <p style="margin:0 0 3px;font-size:9px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;">Guests</p>
          <p style="margin:0;font-size:13px;font-weight:600;color:#1e293b;">${details.partySize} ${details.partySize === 1 ? 'person' : 'people'}</p>
        </td>
        <td style="padding-left:6px;vertical-align:top;width:30%;">
          <p style="margin:0 0 3px;font-size:9px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;">Area</p>
          <p style="margin:0;font-size:13px;font-weight:600;color:#1e293b;">${zoneLabel}</p>
        </td>
      </tr>
    </table>

    ${notesHtml ? `
    <!-- Special requests -->
    <div style="background:#fefce8;border-left:3px solid #facc15;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:24px;">
      <p style="margin:0 0 3px;font-size:9px;font-weight:700;letter-spacing:0.1em;color:#a16207;text-transform:uppercase;">Special requests</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.55;">${notesHtml}</p>
    </div>` : ''}

    <!-- CTA button -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr><td>
        <a href="${dashboardUrl}" style="display:block;text-align:center;background:#0c1a2e;color:#f8fafc;text-decoration:none;font-size:13px;font-weight:600;padding:13px 24px;border-radius:9px;letter-spacing:0.01em;">View in Dashboard →</a>
      </td></tr>
    </table>

  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">
      Sent by OceanCore &nbsp;·&nbsp;
      <a href="${dashboardUrl}" style="color:#64748b;text-decoration:underline;">Manage notifications</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`

      const text = [
        `New reservation at ${restaurant}`,
        '',
        `Guest: ${details.guestName}`,
        `Party size: ${details.partySize}`,
        `Date: ${formattedDate}`,
        `Time: ${formattedTime} · ${zoneLabel}`,
        details.notes ? `Special requests: ${details.notes}` : '',
        '',
        `Dashboard: ${dashboardUrl}`,
      ].filter(Boolean).join('\n')

      console.log(`[email] Sending reservation notification → ${to} from ${from}`)
      const result = await resend.emails.send({
        from,
        to,
        subject: `New reservation — ${details.guestName}, ${formattedDate} at ${formattedTime}`,
        html,
        text,
      })
      if (result.error) {
        console.error('[email] Resend error:', result.error)
      } else {
        console.log('[email] Reservation email sent, id:', result.data?.id)
      }
    } catch (err) {
      console.error('[email] Unexpected error sending reservation email:', err)
    }
  })()
}

// ─── Route handler ────────────────────────────────────────────────────────────

const CHAT_RATE_LIMIT = 40
const CHAT_RATE_WINDOW_MS = 60_000

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[]
      business_id?: string
      conversation_id?: string
      from_dashboard?: boolean
    }

    const chatMessages = sanitizeIncomingMessages(body.messages)
    const business_id = body.business_id
    const conversation_id = body.conversation_id
    const fromDashboard = body.from_dashboard === true

    if (!chatMessages) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 })
    }

    const clientIp = getClientIp(request)

    // ── Preview mode (gated) — landing demos only ─────────────────────────────
    if (!business_id) {
      const previewSecret = process.env.CHAT_PREVIEW_SECRET
      const headerSecret = request.headers.get('x-chat-preview-secret')
      if (!previewSecret || headerSecret !== previewSecret) {
        return NextResponse.json({ error: 'business_id required' }, { status: 400 })
      }

      const ipLimit = await checkRateLimit(`chat-preview:ip:${clientIp}`, 10, CHAT_RATE_WINDOW_MS)
      if (!ipLimit.allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again shortly.' },
          { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSec ?? 60) } },
        )
      }

      const systemPrompt = buildSystemPrompt('AI Concierge', 'this restaurant', null)
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...toOpenAiMessages(chatMessages)],
        max_tokens: 500,
      })
      return NextResponse.json({ message: response.choices[0].message.content })
    }

    if (fromDashboard) {
      const owns = await verifyBusinessOwner(business_id)
      if (!owns) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }
    }

    const ipLimit = await checkRateLimit(`chat:ip:${clientIp}`, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_MS)
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSec ?? 60) } },
      )
    }

    const bizLimit = await checkRateLimit(`chat:biz:${business_id}`, CHAT_RATE_LIMIT * 2, CHAT_RATE_WINDOW_MS)
    if (!bizLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests for this business.' },
        { status: 429, headers: { 'Retry-After': String(bizLimit.retryAfterSec ?? 60) } },
      )
    }

    // ── Fetch business ────────────────────────────────────────────────────────
    const { data: business, error: bizError } = await supabaseAdmin
      .from('businesses')
      .select('id, name, email, system_prompt, agent_name, language, menu_pdf_text, notification_settings')
      .eq('id', business_id)
      .maybeSingle()

    if (bizError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Deposits (tolerates the payment_settings column not existing yet).
    let paymentSettings = { ...DEFAULT_PAYMENT_SETTINGS }
    {
      const { data: payRow, error: payErr } = await supabaseAdmin
        .from('businesses')
        .select('payment_settings')
        .eq('id', business_id)
        .maybeSingle()
      if (!payErr && payRow) {
        paymentSettings = parsePaymentSettings((payRow as { payment_settings?: unknown }).payment_settings)
      }
    }

    // Fetch menu; fall back to name+price only if description/category columns haven't been added yet
    const { data: menuItemsFull, error: menuErr } = await supabaseAdmin
      .from('services')
      .select('name, price, description, category')
      .eq('business_id', business_id)
      .order('name')
    let menuItems: MenuEntry[] | null = menuItemsFull
    if (menuErr) {
      const { data: menuBasic } = await supabaseAdmin
        .from('services')
        .select('name, price')
        .eq('business_id', business_id)
        .order('name')
      menuItems = menuBasic?.map((r) => ({ ...r, description: null, category: null })) ?? null
    }

    const restaurantName = business.name?.trim() || 'this restaurant'
    const conciergeName = business.agent_name?.trim() || 'AI Concierge'

    const lastUserContent = getLastUserMessageContent(chatMessages)
    if (!lastUserContent?.trim()) {
      return NextResponse.json({ error: 'No user message to save' }, { status: 400 })
    }

    // ── Resolve (or create) conversation + customer ───────────────────────────
    let resolvedConversationId: string
    let resolvedCustomerId: string | null = null
    let isNewConversation = false

    if (conversation_id) {
      const { data: existing, error: convErr } = await supabaseAdmin
        .from('conversations')
        .select('id, customer_id, business_id, status')
        .eq('id', conversation_id)
        .eq('business_id', business_id)
        .maybeSingle()

      if (convErr || !existing) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }

      resolvedConversationId = existing.id
      resolvedCustomerId = existing.customer_id ?? null
    } else {
      isNewConversation = true
      const { data: newConv, error: convInsErr } = await supabaseAdmin
        .from('conversations')
        .insert({
          business_id,
          customer_id: null,
          customer_name: 'Website visitor',
          status: 'active',
        })
        .select('id')
        .maybeSingle()

      if (convInsErr || !newConv?.id) {
        return NextResponse.json(
          { error: convInsErr?.message ?? 'Failed to create conversation' },
          { status: 500 },
        )
      }

      resolvedConversationId = newConv.id
    }

    // ── Returning guest recognition (before creating a placeholder customer) ──
    let returningGuestContext: string | null = null
    const { phone: contactPhone, email: contactEmail } = extractContactFromMessages(chatMessages)

    if (contactPhone || contactEmail) {
      const returningGuest = await lookupReturningGuest(
        business_id,
        contactPhone ?? null,
        contactEmail ?? null,
      )
      if (returningGuest) {
        const history = await fetchGuestHistory(returningGuest.id)
        returningGuestContext = buildReturningGuestContext(returningGuest, history)
        resolvedCustomerId = returningGuest.id

        await linkConversationToCustomer({
          conversation_id: resolvedConversationId,
          business_id,
          customer_id: returningGuest.id,
          customer_name: returningGuest.name?.trim() || 'Guest',
        })
      }
    }

    if (!resolvedCustomerId) {
      const { data: newCustomer, error: custErr } = await supabaseAdmin
        .from('customers')
        .insert({
          business_id,
          name: normalizeName('Website visitor'),
          email: '',
          phone: '',
          tags: ['New'],
        })
        .select('id, name')
        .maybeSingle()

      if (custErr || !newCustomer?.id) {
        return NextResponse.json(
          { error: custErr?.message ?? 'Failed to create customer' },
          { status: 500 },
        )
      }

      resolvedCustomerId = newCustomer.id

      const { error: linkErr } = await supabaseAdmin
        .from('conversations')
        .update({
          customer_id: resolvedCustomerId,
          customer_name: newCustomer.name ?? normalizeName('Website visitor'),
        })
        .eq('id', resolvedConversationId)
        .eq('business_id', business_id)

      if (linkErr) {
        return NextResponse.json({ error: linkErr.message }, { status: 500 })
      }
    }

    const bookingCtx: BookingEngineContext = await loadBusinessBookingContext(
      supabaseAdmin,
      business_id,
    )

    const nowParts = getCalgaryNowParts()
    const todayLabel = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day))
      .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

    const notifSettings = parseNotificationSettings(
      (business as Record<string, unknown>).notification_settings,
    )

    const systemPrompt = buildSystemPrompt(
      conciergeName,
      restaurantName,
      business.system_prompt,
      menuItems,
      (business as Record<string, unknown>).menu_pdf_text as string | null,
      returningGuestContext,
      todayLabel,
      wallClockDateKey(nowParts),
      bookingCtx.zones,
      bookingCtx.bookingSettings.require_contact_before_booking,
      paymentSettings.deposit_enabled ? paymentSettings.deposit_per_guest : null,
      (business as Record<string, unknown>).language as string | null,
      notifSettings,
    )
    if (
      isNewConversation &&
      resolvedCustomerId &&
      !returningGuestContext &&
      notifSettings.email_on_new_chat
    ) {
      queueNewConversationOwnerEmail(business.email, business.name)
    }

    // ── Save the user's message ───────────────────────────────────────────────
    const { error: userMsgErr } = await supabaseAdmin.from('messages').insert({
      conversation_id: resolvedConversationId,
      role: 'user',
      content: lastUserContent.trim(),
    })

    if (userMsgErr) {
      return NextResponse.json({ error: userMsgErr.message }, { status: 500 })
    }

    // Keep the inbox honest: updated_at drives conversation ordering and the
    // stale-conversation auto-close, so it must track the latest message.
    await supabaseAdmin
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', resolvedConversationId)
      .eq('business_id', business_id)

    // ── Human takeover check ──────────────────────────────────────────────────
    const { data: convForAi } = await supabaseAdmin
      .from('conversations')
      .select('status')
      .eq('id', resolvedConversationId)
      .eq('business_id', business_id)
      .maybeSingle()

    const statusLower = (convForAi?.status ?? '').toString().trim().toLowerCase()
    if (statusLower === 'human') {
      return NextResponse.json({
        message: null,
        skipped: true,
        reason: 'human_takeover',
        conversation_id: resolvedConversationId,
        customer_id: resolvedCustomerId,
        booking_created: false,
      })
    }

    // ── AI completion with tools (function calling) ───────────────────────────
    const convoMessages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...toOpenAiMessages(chatMessages),
    ]

    const escalatedCategories = new Set<string>()
    let bookingCreated = false
    let bookingCancelled = false
    let bookingRescheduled = false
    let bookingDetails: { guest_name: string; party_size: number; date: string; time: string; dining_area: string | null } | null = null
    let assistantText = ''

    const MAX_TOOL_ROUNDS = 4
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const isLastRound = round === MAX_TOOL_ROUNDS - 1
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: convoMessages,
        // Stop offering tools on the final round so the model must answer in words.
        tools: isLastRound ? undefined : BOOKING_TOOLS,
        max_tokens: 1500,
      })

      const choice = completion.choices[0].message
      const toolCalls = choice.tool_calls ?? []

      if (toolCalls.length === 0) {
        assistantText = choice.content ?? ''
        break
      }

      // Record the assistant's tool-call turn, then execute each tool.
      convoMessages.push({
        role: 'assistant',
        content: choice.content ?? '',
        tool_calls: choice.tool_calls,
      })

      for (const call of toolCalls) {
        if (call.type !== 'function') continue
        let parsedArgs: Record<string, unknown> = {}
        try {
          parsedArgs = JSON.parse(call.function.arguments || '{}')
        } catch {
          parsedArgs = {}
        }

        const outcome = await executeTool(call.function.name, parsedArgs, {
          business_id,
          conversation_id: resolvedConversationId,
          customer_id: resolvedCustomerId ?? '',
          bookingCtx,
          nowParts,
          chatMessages,
          ownerEmail: business.email ?? null,
          ownerName: business.name ?? null,
          notifSettings,
          paymentSettings,
          baseUrl: appBaseUrl(request),
          escalated: escalatedCategories,
        })

        if (outcome.created) {
          bookingCreated = true
          bookingDetails = outcome.result as {
            guest_name: string
            party_size: number
            date: string
            time: string
            dining_area: string | null
          }
        }
        if (outcome.cancelled) bookingCancelled = true
        if (outcome.rescheduled) bookingRescheduled = true
        if (outcome.customerId) resolvedCustomerId = outcome.customerId

        convoMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(outcome.result),
        })
      }
    }

    // The model occasionally returns empty content (or the tool-round budget is
    // exhausted) — never send/store an empty bubble.
    if (!assistantText.trim()) {
      assistantText = bookingCreated
        ? 'Wonderful — your reservation is all set! We look forward to seeing you.'
        : "Sorry, I didn't quite catch that — could you tell me once more?"
    }

    const { error: assistantMsgErr } = await supabaseAdmin.from('messages').insert({
      conversation_id: resolvedConversationId,
      role: 'assistant',
      content: assistantText,
    })

    if (assistantMsgErr) {
      // Don't fail the request — a booking may already exist; the guest still
      // needs the confirmation text even if transcript persistence hiccuped.
      console.error('[chat] Failed to save assistant message:', assistantMsgErr.message)
    }

    return NextResponse.json({
      message: assistantText,
      conversation_id: resolvedConversationId,
      customer_id: resolvedCustomerId,
      booking_created: bookingCreated,
      booking_cancelled: bookingCancelled,
      booking_rescheduled: bookingRescheduled,
      booking_details: bookingDetails,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error'
    console.error(JSON.stringify({ event: 'chat_error', message }))
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
