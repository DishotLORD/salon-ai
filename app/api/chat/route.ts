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
  isAffirmativeReply,
  singleZoneMentioned,
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
import { normalizeGuestContact, normalizeName } from '@/lib/guest-identity'
import {
  DAY_ORDER,
  formatHoursRangeLabel,
  getDayHoursForDate,
  timelineRangeFromDayHours,
  type OperatingHours,
} from '@/lib/operating-hours'
import {
  DEFAULT_PAYMENT_SETTINGS,
  depositAmountCents,
  parsePaymentSettings,
  type PaymentSettings,
} from '@/lib/payment-settings'
import { defaultSystemPrompt } from '@/lib/default-system-prompt'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { appBaseUrl, getStripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessOwner } from '@/lib/verify-business-owner'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/** Override with OPENAI_CHAT_MODEL to upgrade the concierge model without a deploy-time code change. */
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-4o-mini'

type ChatMessage = { role: string; content: string }

// ─── Conversation-flow system prompt injection ────────────────────────────────

const BOOKING_FLOW_RULES = `
YOUR ROLE: collect reservation details through friendly conversation. You do NOT validate or decide bookings — the reservation system does that when you call the tools. Never claim a booking is done without a successful create_reservation tool call.

COLLECT THESE 5 FIELDS, asking only for what is still missing. Never guess, infer, or invent any of them:
1. Full name — ask explicitly: "May I have your name for the reservation?" NEVER generate a name from context. If RETURNING GUEST CONTEXT is present, confirm before using it: "Shall I put this under [Name]?" A one-word reply like "Patio" or "Bar" after a seating question is a ZONE choice, not a name.
2. Date — ALWAYS resolve relative dates ("today", "tonight", "tomorrow", "next Friday") to a concrete YYYY-MM-DD using the DATE MAP above before calling any tool, and keep it consistent across turns. NEVER write a weekday + date pair that is not literally in the DATE MAP (no mental date arithmetic — copy from the map or from a tool result).
3. Time — reservations start every 15 minutes. If the guest says "6:50", pass the nearest slot (18:45) and explain briefly: "We book every 15 minutes — 6:45 or 7:00 works."
4. Party size — skip the question if already stated (e.g. "table for 2", "party of 4").
5. Seating zone — when more than one dining zone exists, ask where they would like to sit, offering the zone names from the system context. The guest may say "no preference". Pass the guest's stated choice to create_reservation EXACTLY as they said it — never substitute, default, or pick a zone yourself.

ALSO COLLECT (optional): phone number or email (preferred — explain it is for the confirmation; required when the system context says so), and special requests — ask once, briefly: "Any special requests? (dietary needs, allergies, an occasion, seating wishes)". If they say "no", proceed.

TOOL USAGE:
- check_availability — call BEFORE you offer or confirm any time; never invent open times or claim a time is unavailable without checking. Pass the guest's requested time when they stated one — the result then says definitively whether that exact time is open (requested_time_available). You may call it before knowing party size. Trust its result over any earlier assumption.
- create_reservation — call ONLY once the guest has stated all 5 fields, passing each exactly as the guest said it. The system validates everything: if it returns missing_fields, ask the guest for those fields and call again; if it returns not_available, apologize briefly and offer the returned alternatives. After it succeeds, confirm warmly by first name with the exact date, time, dining area, and any noted requests.
- get_my_reservation — call whenever the guest asks about their existing booking ("when is my reservation?", "do I have a table?", "is my deposit paid?") and BEFORE cancelling or moving a booking, so you can confirm which reservation you are changing. Relay the exact details it returns — never answer from memory.
- reschedule_reservation — call when the guest wants to move an existing booking to a new date/time, or change how many people are coming (pass new_party_size; keep the same date/time by passing the current ones from get_my_reservation).
- cancel_reservation — call when the guest wants to cancel. It returns the details of the cancelled booking — repeat them back using the word "cancelled".
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
- When check_availability returns many open times, NEVER list them all. Say the open range ("We have tables from 11 AM to 9:45 PM") and either propose 2-3 sensible options or ask what time suits them. Only list exact times when 6 or fewer remain or the guest asked for nearby options.

RECOVERY & EDGE CASES:
- If the guest references a previous booking ("same table", "my usual", "same as last time", "как в прошлый раз") and there is NO "RETURNING GUEST CONTEXT" section in this prompt, say you'd love to pull up their details and ask for the phone number or email they booked with. Once RETURNING GUEST CONTEXT is present, use "Their usual" from it instead of re-asking.
- Unclear or contradictory input: do not guess. Ask one short, friendly clarifying question ("Just to be sure — Friday the 10th, or Saturday the 11th?").
- If a tool returns past_date or beyond_booking_window, relay the reason kindly and ask for a date that works.
- If the requested time is full: offer the returned alternatives first. If the guest declines them all, offer the waitlist — never just dead-end.
- Menu & dietary questions: answer ONLY from the MENU sections below. If the menu does not answer it, say you're not certain and offer to note the question for the restaurant. Never invent dishes, prices, or ingredients.
- Guest asks for something you cannot do (large event, private hire, complaint): the team follows up by PHONE, so ask for a phone number first ("What's the best number for the team to reach you?") — accept email only if they have no phone or prefer it — then call escalate_to_manager with that contact, and let them know the team will follow up. Do not promise a callback without capturing a way to reach them.
- If the guest switches language, reply in their language.
`

type ToolName =
  | 'check_availability'
  | 'create_reservation'
  | 'get_my_reservation'
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
        'Get the real open reservation times for a specific date. Call this before offering or confirming any time — the result states definitively whether a requested time is open. Resolve relative dates to YYYY-MM-DD first. Call it as soon as the guest names a date; do not wait for party size.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Reservation date, YYYY-MM-DD' },
          time: {
            type: 'string',
            description:
              "The guest's requested time in 24-hour HH:MM, when they stated one (e.g. 17:00 for 5 PM). The result will say whether exactly this time is open.",
          },
          party_size: {
            type: 'integer',
            description: 'Number of guests, if already stated. Omit if unknown — 2 is assumed.',
          },
          seating_area: {
            type: 'string',
            description: 'Optional preferred dining area / zone name',
          },
        },
        required: ['date'],
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
      name: 'get_my_reservation',
      description:
        "Look up the guest's current active reservation — date, time, party size, seating area, special requests, and deposit status. Call before answering any question about an existing booking, and before cancelling or rescheduling.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reschedule_reservation',
      description:
        "Update the guest's existing reservation: move it to a new date/time and/or change the party size. To change only the party size, pass the booking's current date and time unchanged.",
      parameters: {
        type: 'object',
        properties: {
          new_date: { type: 'string', description: 'New date, YYYY-MM-DD' },
          new_time: { type: 'string', description: 'New 24-hour time, HH:MM' },
          new_party_size: {
            type: 'integer',
            description: 'New number of guests, only when the guest asked to change it',
          },
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
        'Alert the restaurant team about this conversation so a human can follow up. Call when the guest complains or is upset, asks for a manager, requests a large event or private hire you cannot book, or raises a serious allergy concern. The team follows up by PHONE, not chat — so FIRST ask for a phone number (preferred; email is a fallback) unless one is already on record, then pass it here. Call it at most ONCE per issue — if you already told the guest the team was notified about this issue, never call it again in this conversation.',
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
          guest_name: {
            type: 'string',
            description: "The guest's name, if known, so staff know who to ask for",
          },
          phone: {
            type: 'string',
            description:
              'A phone number the team can call the guest back on. Ask for this before escalating unless one is already on record.',
          },
          email: {
            type: 'string',
            description: 'Guest email, if they prefer email follow-up or gave no phone',
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

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function weekdayNameFromDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/**
 * Weekday → date map for today plus the next 7 days, so the model never does
 * weekday math itself. Today's own weekday MUST be in the map: without it, a
 * guest saying "Sunday" on a Sunday gets silently booked a week ahead.
 */
function dateResolutionMap(todayKey: string): string {
  const parts: string[] = [`today/tonight (${weekdayNameFromDateKey(todayKey)}) = ${todayKey}`]
  for (let i = 1; i <= 7; i++) {
    const key = addDaysToDateKey(todayKey, i)
    const prefix = i === 1 ? 'tomorrow, ' : i === 7 ? 'next ' : ''
    parts.push(`${prefix}${weekdayNameFromDateKey(key)} = ${key}`)
  }
  return parts.join('; ')
}

/** Next non-closed day after `fromKey`, for suggesting real alternatives. */
function nextOpenDayLine(hours: OperatingHours, fromKey: string, maxDays = 7): string {
  for (let i = 1; i <= maxDays; i++) {
    const key = addDaysToDateKey(fromKey, i)
    const day = getDayHoursForDate(hours, key)
    if (!day.closed) {
      const when = i === 1 ? 'tomorrow, ' : ''
      return `${when}${weekdayNameFromDateKey(key)} ${key} (${formatHoursRangeLabel(day)})`
    }
  }
  return ''
}

/**
 * Weekly schedule for the system prompt, plus an open/closed-right-now line so
 * the model can answer "what are your hours?" and reason about "tonight"
 * without calling a tool (check_availability only covers a single date).
 */
function buildHoursPromptSection(
  hours: OperatingHours,
  now?: WallClockParts | null,
  slotIntervalMinutes = 15,
): string {
  const lines = DAY_ORDER.map(
    ({ key, label }) => `- ${label}: ${formatHoursRangeLabel(hours[key])}`,
  )
  let section = `\n\nOPERATING HOURS (restaurant local time). Answer any hours question by copying each day's line EXACTLY as written below — never merge days into ranges, never alter a time:\n${lines.join('\n')}`

  if (now) {
    const todayKey = wallClockDateKey(now)
    const day = getDayHoursForDate(hours, todayKey)
    const range = timelineRangeFromDayHours(day)
    const nowMin = now.hour * 60 + now.minute
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const nowLabel = `${pad2(now.hour)}:${pad2(now.minute)}`
    const nextOpen = (fromKey: string) => {
      const line = nextOpenDayLine(hours, fromKey)
      return line ? ` The next open day is ${line}.` : ''
    }

    if (!range) {
      section += `\nRIGHT NOW (${nowLabel}): the restaurant is CLOSED today (${weekdayNameFromDateKey(todayKey)}). "Today"/"tonight" reservations are not possible — say so and suggest the next open day.${nextOpen(todayKey)}`
    } else {
      const effectiveNow =
        range.wrapAfterMidnight && nowMin < range.start ? nowMin + 24 * 60 : nowMin
      const lastStartMin = range.end - slotIntervalMinutes
      const lastStartLabel = formatClock12hFromWallClock(
        `${todayKey}T${String(Math.floor((lastStartMin % 1440) / 60)).padStart(2, '0')}:${String(lastStartMin % 60).padStart(2, '0')}:00`,
      )
      const lastStartLine = lastStartLabel
        ? ` The LAST bookable start time today is ${lastStartLabel} — never offer or accept a later time for today.`
        : ''
      if (effectiveNow >= range.end) {
        section += `\nRIGHT NOW (${nowLabel}): today's hours (${formatHoursRangeLabel(day)}) are already over — the restaurant is CLOSED for tonight. Never call this "fully booked"; say the kitchen has closed for the day and suggest the next open day.${nextOpen(todayKey)}`
      } else if (effectiveNow < range.start) {
        section += `\nRIGHT NOW (${nowLabel}): doors have not opened yet at this hour, but today IS an open day — hours today are ${formatHoursRangeLabel(day)}, and reservations for later today are fully bookable right now. If asked "are you open right now?", say doors are closed at the moment and open later today at ${formatHoursRangeLabel(day).split(' – ')[0]}. NEVER tell the guest "we are closed today"; check availability and offer today's times normally.${lastStartLine}`
      } else {
        section += `\nRIGHT NOW (${nowLabel}): the restaurant is currently OPEN (today's hours: ${formatHoursRangeLabel(day)}).${lastStartLine}`
      }
    }

    // Spell tomorrow out explicitly — "are you open tomorrow?" is the #1
    // hours question and weekday→schedule lookup is where models slip.
    const tomorrowKey = addDaysToDateKey(todayKey, 1)
    const tomorrow = getDayHoursForDate(hours, tomorrowKey)
    section += `\nTOMORROW (${weekdayNameFromDateKey(tomorrowKey)} ${tomorrowKey}): ${
      tomorrow.closed ? 'CLOSED — no reservations possible tomorrow.' : `open ${formatHoursRangeLabel(tomorrow)}.`
    }`
  }
  return section
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
  diningZones?: { name: string; is_active: boolean; max_party_size?: number }[] | null,
  requireContactBeforeBooking?: boolean,
  depositPerGuest?: number | null,
  language?: string | null,
  notif?: NotificationSettings | null,
  operatingHours?: OperatingHours | null,
  nowParts?: WallClockParts | null,
  slotIntervalMinutes?: number,
): string {
  const custom = customPrompt?.trim()
  const identityLine = `IDENTITY: You are ${conciergeName}, the AI Concierge for ${restaurantName}. Always introduce and refer to yourself as ${conciergeName}.`
  const base = custom
    ? `${custom}\n\n${identityLine}`
    : defaultSystemPrompt(restaurantName, null, conciergeName)
  const todayLine = todayLabel
    ? `\nCURRENT DATE (restaurant local time): ${todayLabel}${todayDateKey ? ` (${todayDateKey})` : ''}.${
        todayDateKey ? ` DATE MAP: ${dateResolutionMap(todayDateKey)}.` : ''
      } When the guest says "today", "tonight", "tomorrow", or a weekday name, copy the matching YYYY-MM-DD from this map — do not compute dates yourself. A bare weekday name that matches today's weekday means TODAY, not next week — say "today" when confirming it, and only use the "next …" date when the guest explicitly says "next" or today no longer works.\n`
    : ''
  let prompt = `${base}${todayLine}\n\n${BOOKING_FLOW_RULES}`
  if (operatingHours) {
    prompt += buildHoursPromptSection(operatingHours, nowParts, slotIntervalMinutes ?? 15)
  }
  if (language?.trim() && !/^english/i.test(language.trim())) {
    prompt += `\nLANGUAGE: default to ${language.trim()} unless the guest writes in a different language — then mirror theirs.`
  }
  const escalationTriggers: string[] = []
  if (notif?.escalate_complaint) {
    escalationTriggers.push('the guest complains, is upset, or asks for a manager (category "complaint")')
  }
  if (notif?.escalate_large_party) {
    escalationTriggers.push(
      'the guest asks about a large party (8 or more) or a private event (category "large_party") — escalating is a notification, NOT a refusal: still book them normally when a zone seats the group',
    )
  }
  if (notif?.escalate_allergy) {
    escalationTriggers.push('the guest describes a severe or life-threatening allergy (category "allergy")')
  }
  if (escalationTriggers.length > 0) {
    prompt += `\nESCALATION: call escalate_to_manager the moment ${escalationTriggers.join('; or ')}. Because staff follow up by phone, ask for a phone number first (email only if they have none) unless a contact is already on record, and pass it to the tool. It quietly alerts the staff — after calling it, tell the guest the team has been notified and will reach out, and keep helping them.`
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
  if (activeZones.length > 0) {
    const maxSeatable = Math.max(
      ...activeZones.map((z) => (typeof z.max_party_size === 'number' ? z.max_party_size : 12)),
    )
    prompt += `\nLARGEST BOOKABLE PARTY: ${maxSeatable} guests. Never quote any other size limit. For bigger groups, get the guest's name and a phone number the team can call back (email only if they have no phone), call escalate_to_manager (category "large_party") with that contact, and say the team will follow up personally.`
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

function getLastAssistantMessageContent(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m?.role === 'assistant' && typeof m.content === 'string') {
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
  /** From the most recent active booking — the "usual" the guest may ask to repeat. */
  usualZone: string | null
  usualPartySize: number | null
  usualTimeLabel: string | null
}

function parsePartySizeFromServiceName(serviceName: string | null): number | null {
  if (!serviceName) return null
  const parts = serviceName.split('·').map((p) => p.trim())
  const partyPart = parts.find((p) => /^party of/i.test(p)) ?? parts[1]
  if (!partyPart) return null
  const n = parseInt(partyPart.replace(/\D/g, ''), 10)
  return n >= 1 && n <= 30 ? n : null
}

/** service_name is "Guest · Party of N · Zone" — the 3rd segment is the seating zone. */
function parseZoneFromServiceName(serviceName: string | null | undefined): string | null {
  if (!serviceName) return null
  const parts = serviceName.split('·').map((p) => p.trim())
  const zone = parts[2]?.trim()
  return zone && zone.length > 0 ? zone : null
}

/** "2026-07-07T19:00:00" → "7 PM" / "7:30 PM". */
function formatClock12hFromWallClock(wallClock: string): string | null {
  const mt = wallClock.slice(11, 16).match(/^(\d{2}):(\d{2})$/)
  if (!mt) return null
  const h = parseInt(mt[1], 10)
  const min = parseInt(mt[2], 10)
  const period = h < 12 ? 'AM' : 'PM'
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h
  return min === 0 ? `${dh} ${period}` : `${dh}:${String(min).padStart(2, '0')} ${period}`
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

/**
 * Recognition by id (device-remembered guest or the conversation's linked
 * customer). Placeholder rows — no contact AND no real name — never count,
 * so an anonymous "Website visitor" can't masquerade as a returning guest.
 */
async function loadRecognizedGuest(
  business_id: string,
  customer_id: string,
): Promise<CustomerRow | null> {
  const { data } = await supabaseAdmin
    .from('customers')
    .select('id, business_id, name, email, phone, total_bookings, last_visit, notes')
    .eq('id', customer_id)
    .eq('business_id', business_id)
    .maybeSingle()
  if (!data) return null
  const row = data as CustomerRow
  const hasContact = Boolean(row.phone?.trim() || row.email?.trim())
  const hasRealName = isPlausibleGuestName(row.name ?? '')
  return hasContact || hasRealName ? row : null
}

async function fetchGuestHistory(customer_id: string): Promise<GuestHistory> {
  const { data: appointments } = await supabaseAdmin
    .from('appointments')
    .select('service_name, scheduled_at, status')
    .eq('customer_id', customer_id)
    .order('scheduled_at', { ascending: false })

  const rows = appointments ?? []
  const services = rows
    .map((r) => r.service_name)
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)

  const partySizes = services
    .map((s) => parsePartySizeFromServiceName(s))
    .filter((n): n is number => n != null)

  // "The usual" = the most recent booking that wasn't cancelled or a no-show.
  const lastActive = rows.find((r) => {
    const s = (r.status ?? '').toString().trim().toLowerCase()
    return !['cancelled', 'canceled', 'no-show', 'noshow', 'no_show'].includes(s)
  })
  const lastActiveWallClock = lastActive
    ? scheduledAtToWallClock(String(lastActive.scheduled_at))
    : null

  return {
    totalBookings: rows.length,
    lastVisit: rows[0]?.scheduled_at ?? null,
    services,
    preferredPartySize: mostCommonPartySize(partySizes),
    usualZone: lastActive ? parseZoneFromServiceName(lastActive.service_name) : null,
    usualPartySize: lastActive ? parsePartySizeFromServiceName(lastActive.service_name) : null,
    usualTimeLabel: lastActiveWallClock ? formatClock12hFromWallClock(lastActiveWallClock) : null,
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

  const usualParts: string[] = []
  if (history.usualPartySize != null) usualParts.push(`party of ${history.usualPartySize}`)
  if (history.usualZone) usualParts.push(`${history.usualZone} seating`)
  if (history.usualTimeLabel) usualParts.push(`around ${history.usualTimeLabel}`)
  const usualLine =
    usualParts.length > 0
      ? `\n- Their usual: ${usualParts.join(', ')} (from their last booking). If they ask for "the same table", "my usual", "same as last time", propose exactly this — confirm only the DATE, then book. Do not re-ask party size or seating they always use.`
      : ''

  return `RETURNING GUEST CONTEXT:
- Name: ${customer.name?.trim() || 'Guest'}
- Phone: ${customer.phone?.trim() || 'not on file'}
- Email: ${customer.email?.trim() || 'not on file'}
- Contact on file: ${customer.phone?.trim() || customer.email?.trim() ? 'YES — do NOT ask for a phone or email again' : 'no'}
- Total visits: ${history.totalBookings}
- Last visit: ${formatVisitDate(history.lastVisit)}
- Preferred party size: ${partyHint}
- Past reservations: ${servicesHint}${usualLine}${prefSection}
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
  /** Recognized returning guest's usual seating zone ("my usual" bookings). */
  usualZoneName?: string | null
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
 *
 * `timeOnly` drops the repeated "Sun, Jul 12 at" prefix — used for single-date
 * results where the date is already stated once at the top level.
 */
function formatSlotsForTool(slots: AvailableSlot[], timeOnly = false): string[] {
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
      result.push(
        timeOnly ? formatClock12hFromWallClock(s.wallClock) ?? cleanLabel : cleanLabel,
      )
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
      message: `Reservations open up to ${maxDays} days ahead — the latest bookable date is ${horizonKey}. Relay exactly these numbers (do not convert to months or years yourself) and invite the guest to book within that window.`,
    }
  }
  return null
}

/** Why no zone can seat this party — null when at least one active zone fits. */
function partySizeZoneError(
  partySize: number,
  zones: DiningZone[],
): Record<string, unknown> | null {
  const active = zones.filter((z) => z.is_active)
  if (active.length === 0) return null
  if (activeZonesForParty(active, partySize).length > 0) return null
  const maxSeatable = Math.max(...active.map((z) => z.max_party_size))
  if (partySize > maxSeatable) {
    return {
      ok: false,
      error: 'party_too_large',
      max_party_size: maxSeatable,
      message: `No dining area seats a party of ${partySize} — the largest bookable party is ${maxSeatable}. Do NOT quote any other limit. Offer to alert the team about a large-group/private booking: get the guest's name and a phone number (staff call these back; email only if no phone), then call escalate_to_manager (category "large_party") with that contact and tell them the team will follow up. Suggest splitting into smaller tables only if the guest prefers.`,
    }
  }
  return {
    ok: false,
    error: 'party_size_not_accepted',
    message: `No dining area accepts a party of ${partySize}. Ask the guest whether the size can change, or offer to alert the team (escalate_to_manager).`,
  }
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
  // Party size only narrows zone eligibility — never block an availability
  // answer on it. Assume 2 and tell the model to confirm before booking.
  const partySizeKnown = typeof args.party_size === 'number' && args.party_size >= 1
  const partySize = partySizeKnown ? Math.round(args.party_size as number) : 2
  if (partySizeKnown) {
    const partyError = partySizeZoneError(partySize, ctx.bookingCtx.zones)
    if (partyError) return { result: partyError }
  }
  const seating = resolveSeatingArea(args.seating_area, ctx.bookingCtx.zones)
  const zoneId = seating.kind === 'zone' ? seating.zone.id : null

  // The guest's requested time, when stated — lets the result answer
  // "is 5 PM open?" definitively and centers alternatives on their time.
  let requestedWallClock: string | null = null
  if (typeof args.time === 'string' && args.time.trim()) {
    requestedWallClock = buildWallClock(args.date, args.time)
    if (requestedWallClock) {
      requestedWallClock =
        snapWallClockToSlotInterval(
          requestedWallClock,
          ctx.bookingCtx.bookingSettings.slot_interval_minutes,
        ) ?? requestedWallClock
    }
  }

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

  const weekday = weekdayNameFromDateKey(dateKey)

  if (slots.length === 0) {
    const alternatives = findNearestOpenSlots({
      targetWallClock: requestedWallClock ?? `${dateKey}T19:00:00`,
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

    // Tell the model WHY there are no slots — "fully booked" is only true when
    // capacity is exhausted, never when the day is closed or service has ended.
    let message: string
    if (dayHours.closed) {
      message = `The restaurant is CLOSED on ${weekday} ${dateKey}. Say so, then offer the nearby alternatives (they are on other days).`
    } else {
      const todayKey = wallClockDateKey(ctx.nowParts)
      const range = timelineRangeFromDayHours(dayHours)
      let serviceOverToday = false
      if (dateKey === todayKey && range) {
        const settings = ctx.bookingCtx.bookingSettings
        const nowMinRaw = ctx.nowParts.hour * 60 + ctx.nowParts.minute
        const nowMin =
          range.wrapAfterMidnight && nowMinRaw < range.start ? nowMinRaw + 24 * 60 : nowMinRaw
        const lastBookableStart = range.end - settings.slot_interval_minutes
        serviceOverToday =
          nowMin + Math.max(0, settings.min_notice_minutes) > lastBookableStart
      }
      message = serviceOverToday
        ? `Today's service has ended (hours today: ${formatHoursRangeLabel(dayHours)}) — it is past the last seating, NOT fully booked. Say the kitchen has closed for tonight and offer the nearby alternatives.`
        : 'All tables for that date are taken. Offer the nearby alternatives, and mention the waitlist if the guest declines them all.'
    }
    message += ' Offer ONLY times copied verbatim from nearby_alternatives — never adjust or invent times.'

    return {
      result: {
        ok: true,
        date: dateKey,
        day_of_week: weekday,
        available_times: [],
        nearby_alternatives: formatSlotsForTool(alternatives),
        message,
      },
    }
  }

  const dayHours = getDayHoursForDate(ctx.bookingCtx.operatingHours, dateKey)
  const hoursLabel = dayHours.closed ? 'Closed' : formatHoursRangeLabel(dayHours)
  const times = formatSlotsForTool(slots, true)
  const todayKey = wallClockDateKey(ctx.nowParts)
  const beforeOpeningNote =
    dateKey === todayKey &&
    ctx.nowParts.hour * 60 + ctx.nowParts.minute < (timelineRangeFromDayHours(dayHours)?.start ?? 0)
      ? ' Doors have not opened yet this morning, but every time listed is bookable — today is an open day, never say "closed today".'
      : ''
  const partySizeNote = partySizeKnown
    ? ''
    : ' (Party size not stated yet — times assume 2; ask how many guests before booking.)'

  const result: Record<string, unknown> = {
    ok: true,
    date: dateKey,
    day_of_week: weekday,
    hours: hoursLabel,
    available_times: times,
    slot_count: times.length,
  }

  // Definitive verdict for the guest's requested time, so the model can never
  // misreport an open time as unavailable (or vice versa).
  let requestedNote = ''
  if (requestedWallClock && requestedWallClock.slice(0, 10) === dateKey) {
    const requestedLabel = formatClock12hFromWallClock(requestedWallClock)
    const isOpen = slots.some((s) => s.wallClock === requestedWallClock)
    result.requested_time = requestedLabel
    result.requested_time_available = isOpen
    requestedNote = isOpen
      ? ` The guest's requested time (${requestedLabel}) IS AVAILABLE — offer to confirm it.`
      : ` The guest's requested time (${requestedLabel}) is NOT available — offer the closest open times instead.`
  }

  result.message = `${weekday} ${dateKey} is open ${hoursLabel}; ${times.length} start times are free (${times[0]}–${times[times.length - 1]}).${requestedNote}${beforeOpeningNote}${partySizeNote} Summarize the open range and suggest 2-3 options — do not list every time.`

  return { result }
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

  const createPartyError = partySizeZoneError(partySize, ctx.bookingCtx.zones)
  if (createPartyError) return { result: createPartyError }

  // Anti-fabrication guard for the zone, mirroring the name guard above: the
  // chosen zone (or "no preference") must appear in the guest's OWN messages.
  // Otherwise the model invented it — refuse and force it to ask.
  if (multiZone) {
    const guestText = getUserMessagesCombined(ctx.chatMessages)
    // "My usual table" from a recognized returning guest counts as choosing
    // their usual zone — do not re-ask what they always book.
    const guestAskedUsual =
      /usual|same table|same as last|как обычно|прошлый раз|як минулого разу/i.test(guestText)
    const guestStatedZone =
      seating.kind === 'zone' &&
      (inferZoneIdFromText(guestText, activeZones) === seating.zone.id ||
        (guestAskedUsual &&
          !!ctx.usualZoneName &&
          seating.zone.name.toLowerCase() === ctx.usualZoneName.toLowerCase()))
    const guestStatedAny = seating.kind === 'any' && guestAcceptsAnyZone(guestText)

    // The guest may confirm a zone the assistant proposed with a bare "yes" /
    // "correct" instead of retyping its name. Accept that only when the
    // assistant's last message named exactly ONE zone (so "yes" to the
    // "Main dining, Patio, or Bar?" question never auto-picks a zone).
    let guestConfirmedProposal = false
    if (!guestStatedZone && !guestStatedAny && seating.kind === 'zone') {
      const lastUser = getLastUserMessageContent(ctx.chatMessages) ?? ''
      const lastAssistant = getLastAssistantMessageContent(ctx.chatMessages) ?? ''
      guestConfirmedProposal =
        isAffirmativeReply(lastUser) &&
        singleZoneMentioned(lastAssistant, activeZones) === seating.zone.id
    }

    if (!guestStatedZone && !guestStatedAny && !guestConfirmedProposal) {
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

  // Prevent duplicates for this conversation — same active-future filter as
  // get/cancel/reschedule, so past visits and no-shows do not block rebooking.
  const existingAppt = await findActiveAppointment(ctx)
  if (existingAppt) {
    const d = describeAppointment(existingAppt, ctx.bookingCtx.zones)
    return {
      result: {
        ok: false,
        error: 'already_booked',
        existing_reservation: {
          date: d.date,
          time: d.time,
          party_size: d.partySize,
          dining_area: d.zone,
        },
        message:
          'This chat already has an active reservation (details above). Tell the guest about it and offer to move it (reschedule_reservation) or cancel it — do not create a duplicate.',
      },
    }
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
            ? `Only ${interval}-minute start times. Nearest slot ${bookedTime} is full — offer the alternatives verbatim.`
            : 'That time is not available. Offer the nearby_alternatives times verbatim — never adjust or invent times.',
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
  // Contact from the conversation text is the fallback: the model often omits
  // args.phone/email even when the guest typed them — losing them here is what
  // used to create duplicate customer profiles for returning guests.
  const msgContact = extractContactFromMessages(ctx.chatMessages)
  const targetCustomerId = await persistGuest({
    business_id: ctx.business_id,
    customer_id: ctx.customer_id,
    conversation_id: ctx.conversation_id,
    rawName: guestName,
    rawPhone:
      typeof args.phone === 'string' && args.phone.trim()
        ? args.phone
        : msgContact.phone ?? null,
    rawEmail:
      typeof args.email === 'string' && args.email.trim()
        ? args.email
        : msgContact.email ?? null,
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

  // Persist dietary notes to the guest profile; escalate only for real allergy /
  // intolerance signals — not lifestyle choices like vegan/kosher/halal.
  // Cyrillic roots match bare (JS \b is ASCII-only and never fires on them).
  const allergySignal =
    /\b(allerg|gluten|dairy|lactose|nut|peanut|shellfish|celiac|coeliac|intoleran)|аллерг|глютен|лактоз|орех|арахис|морепрод|целиак|непереносим/i
  if (notes && allergySignal.test(notes)) {
    await persistGuestPreferences({
      business_id: ctx.business_id,
      customer_id: targetCustomerId,
      allergies: notes,
    })
    triggerEscalation(
      ctx,
      'allergy',
      `${guestName} (party of ${partySize}, ${wallClock.slice(0, 10)} ${wallClock.slice(11, 16)}) noted: ${notes}`,
      {
        name: guestName,
        phone: (typeof args.phone === 'string' && args.phone.trim()) || msgContact.phone || null,
        email: (typeof args.email === 'string' && args.email.trim()) || msgContact.email || null,
      },
    )
  } else if (notes && /\b(vegan|vegetarian|kosher|halal)|веган|вегетариан|кошер|халял/i.test(notes)) {
    await persistGuestPreferences({
      business_id: ctx.business_id,
      customer_id: targetCustomerId,
      preferences: notes,
    })
  }

  if (partySize >= 8) {
    triggerEscalation(
      ctx,
      'large_party',
      `${guestName} booked a party of ${partySize} for ${wallClock.slice(0, 10)} at ${wallClock.slice(11, 16)}${zoneLabel ? ` (${zoneLabel})` : ''}.`,
      {
        name: guestName,
        phone: (typeof args.phone === 'string' && args.phone.trim()) || msgContact.phone || null,
        email: (typeof args.email === 'string' && args.email.trim()) || msgContact.email || null,
      },
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

type ActiveAppointment = {
  id: string
  zone_id: string | null
  scheduled_at: string
  party_size: number | null
  service_name: string | null
  status: string | null
  notes: string | null
}

const ACTIVE_APPT_SELECT = 'id, zone_id, scheduled_at, party_size, service_name, status, notes' as const

function toActiveAppointment(row: Record<string, unknown>): ActiveAppointment {
  return {
    id: String(row.id),
    zone_id: row.zone_id != null ? String(row.zone_id) : null,
    scheduled_at: String(row.scheduled_at ?? ''),
    party_size: row.party_size != null ? Number(row.party_size) : null,
    service_name: row.service_name != null ? String(row.service_name) : null,
    status: row.status != null ? String(row.status) : null,
    notes: row.notes != null ? String(row.notes) : null,
  }
}

/** Find the guest's current active reservation (by conversation, then by customer). */
async function findActiveAppointment(ctx: ToolContext): Promise<ActiveAppointment | null> {
  const { data: byConv } = await supabaseAdmin
    .from('appointments')
    .select(ACTIVE_APPT_SELECT)
    .eq('conversation_id', ctx.conversation_id)
    .in('status', ['pending', 'confirmed', 'seated'])
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (byConv?.id) return toActiveAppointment(byConv as Record<string, unknown>)

  const nowIso = new Date().toISOString()
  const { data: byCustomer } = await supabaseAdmin
    .from('appointments')
    .select(ACTIVE_APPT_SELECT)
    .eq('business_id', ctx.business_id)
    .eq('customer_id', ctx.customer_id)
    .in('status', ['pending', 'confirmed', 'seated'])
    .gte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (byCustomer?.id) return toActiveAppointment(byCustomer as Record<string, unknown>)

  return null
}

/** service_name is "Guest · Party of N · Zone" — the 1st segment is the guest's name. */
function parseGuestNameFromServiceName(serviceName: string | null): string | null {
  const first = serviceName?.split('·')[0]?.trim()
  return first && first.length > 0 ? first : null
}

function zoneNameById(zoneId: string | null, zones: DiningZone[]): string | null {
  if (!zoneId) return null
  return zones.find((z) => z.id === zoneId)?.name ?? null
}

/** Wall-clock date/time/label snapshot of an appointment, for tool results and emails. */
function describeAppointment(appt: ActiveAppointment, zones: DiningZone[]) {
  const wallClock = scheduledAtToWallClock(appt.scheduled_at) ?? appt.scheduled_at
  return {
    date: wallClock.slice(0, 10),
    time: wallClock.slice(11, 16),
    partySize: appt.party_size ?? parsePartySizeFromServiceName(appt.service_name),
    zone: zoneNameById(appt.zone_id, zones) ?? parseZoneFromServiceName(appt.service_name),
    guestName: parseGuestNameFromServiceName(appt.service_name),
  }
}

/** Email on the guest's customer record, for change confirmations. */
async function getCustomerEmail(customer_id: string, business_id: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('customers')
    .select('email')
    .eq('id', customer_id)
    .eq('business_id', business_id)
    .maybeSingle()
  return data?.email?.trim() || null
}

async function runGetMyReservation(ctx: ToolContext): Promise<ToolOutcome> {
  const appt = await findActiveAppointment(ctx)
  if (!appt) {
    return {
      result: {
        ok: false,
        error: 'not_found',
        message:
          'No active reservation found for this guest. If they believe they have one, ask for the phone number or email they booked with so the system can recognize them.',
      },
    }
  }

  const d = describeAppointment(appt, ctx.bookingCtx.zones)
  // Guest-friendly status wording — "pending" is internal and reads like doubt.
  const statusLabel =
    appt.status === 'pending' ? 'reserved' : appt.status === 'seated' ? 'seated now' : appt.status
  const result: Record<string, unknown> = {
    ok: true,
    date: d.date,
    time: d.time,
    party_size: d.partySize,
    dining_area: d.zone,
    status: statusLabel,
    special_requests: appt.notes,
  }

  // Deposit info is optional schema — tolerate the columns not existing yet.
  const { data: dep, error: depErr } = await supabaseAdmin
    .from('appointments')
    .select('deposit_status, deposit_amount_cents')
    .eq('id', appt.id)
    .maybeSingle()
  if (!depErr && dep?.deposit_status) {
    result.deposit_status = dep.deposit_status
    if (dep.deposit_amount_cents != null) {
      result.deposit_amount = `$${(Number(dep.deposit_amount_cents) / 100).toFixed(2)} CAD`
    }
  }

  return { result }
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

  const d = describeAppointment(appt, ctx.bookingCtx.zones)
  if (ctx.notifSettings.email_on_reservation) {
    queueBookingChangeOwnerEmail(ctx.ownerEmail, ctx.ownerName, {
      kind: 'cancelled',
      guestName: d.guestName ?? 'A guest',
      partySize: d.partySize,
      date: d.date,
      time: d.time,
      zone: d.zone,
    })
  }
  if (ctx.notifSettings.email_guest_confirmation) {
    const guestEmail =
      extractContactFromMessages(ctx.chatMessages).email ??
      (await getCustomerEmail(ctx.customer_id, ctx.business_id))
    if (guestEmail) {
      queueGuestCancellationEmail(guestEmail, ctx.ownerName ?? 'the restaurant', {
        guestName: d.guestName ?? 'there',
        date: d.date,
        time: d.time,
      })
    }
  }

  return {
    cancelled: true,
    result: {
      ok: true,
      cancelled_reservation: {
        date: d.date,
        time: d.time,
        party_size: d.partySize,
        dining_area: d.zone,
      },
      message: 'Confirm the cancellation to the guest, repeating the exact date and time that were cancelled.',
    },
  }
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

  // Same date-window guard as create_reservation — never move a booking into
  // the past or beyond the advance-booking horizon.
  const windowError = checkDateInBookableWindow(wallClock.slice(0, 10), ctx)
  if (windowError) return { result: windowError }

  // Snap to the configured slot grid, same as create_reservation.
  const snappedReschedule = snapWallClockToSlotInterval(
    wallClock,
    ctx.bookingCtx.bookingSettings.slot_interval_minutes,
  )
  if (snappedReschedule && snappedReschedule !== wallClock) {
    wallClock = snappedReschedule
  }

  const currentPartySize = appt.party_size && appt.party_size > 0 ? appt.party_size : 2
  const requestedPartySize =
    typeof args.new_party_size === 'number' && args.new_party_size >= 1 && args.new_party_size <= 30
      ? Math.round(args.new_party_size)
      : null
  const partySize = requestedPartySize ?? currentPartySize
  if (requestedPartySize != null) {
    const partyError = partySizeZoneError(partySize, ctx.bookingCtx.zones)
    if (partyError) return { result: partyError }
  }
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
        message: 'That new time is not available. Offer the nearby_alternatives times verbatim.',
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

  // Keep service_name ("Guest · Party of N · Zone") in sync — guest history and
  // the dashboard both parse party size and zone out of it.
  const zoneLabel =
    assignedZone?.name ?? zoneNameById(preferredZoneId, ctx.bookingCtx.zones)
  const guestName = parseGuestNameFromServiceName(appt.service_name)
  const update: Record<string, unknown> = {
    scheduled_at: wallClockInCalgaryToUtcDate(wallClock).toISOString(),
    duration_minutes: durationMinutes,
    zone_id: assignedZone?.id ?? preferredZoneId,
    party_size: partySize,
  }
  if (guestName) {
    const svcParts = [guestName, `Party of ${partySize}`]
    if (zoneLabel) svcParts.push(zoneLabel)
    update.service_name = svcParts.join(' · ').slice(0, 500)
  }

  const { error } = await supabaseAdmin
    .from('appointments')
    .update(update)
    .eq('id', appt.id)
    .eq('business_id', ctx.business_id)

  if (error) {
    return { result: { ok: false, error: 'db_error', message: 'Could not reschedule. Try again.' } }
  }
  console.log('[reschedule] Reservation moved via tool:', appt.id, wallClock, `party ${partySize}`)

  const previous = describeAppointment(appt, ctx.bookingCtx.zones)
  if (ctx.notifSettings.email_on_reservation) {
    queueBookingChangeOwnerEmail(ctx.ownerEmail, ctx.ownerName, {
      kind: 'rescheduled',
      guestName: guestName ?? 'A guest',
      partySize,
      date: wallClock.slice(0, 10),
      time: wallClock.slice(11, 16),
      zone: zoneLabel,
      previousDate: previous.date,
      previousTime: previous.time,
    })
  }
  if (ctx.notifSettings.email_guest_confirmation) {
    const guestEmail =
      extractContactFromMessages(ctx.chatMessages).email ??
      (await getCustomerEmail(ctx.customer_id, ctx.business_id))
    if (guestEmail) {
      queueGuestConfirmationEmail(guestEmail, ctx.ownerName ?? 'the restaurant', {
        guestName: guestName ?? 'there',
        partySize,
        date: wallClock.slice(0, 10),
        time: wallClock.slice(11, 16),
        zone: zoneLabel,
        notes: appt.notes,
        variant: 'updated',
      })
    }
  }

  return {
    rescheduled: true,
    result: {
      ok: true,
      date: wallClock.slice(0, 10),
      time: wallClock.slice(11, 16),
      party_size: partySize,
      dining_area: zoneLabel,
    },
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
    const msgContact = extractContactFromMessages(ctx.chatMessages)
    triggerEscalation(ctx, 'allergy', `${who} mentioned: ${args.allergies.trim().slice(0, 200)}`, {
      name: typeof args.name === 'string' ? args.name : null,
      phone: (typeof args.phone === 'string' && args.phone.trim()) || msgContact.phone || null,
      email: (typeof args.email === 'string' && args.email.trim()) || msgContact.email || null,
    })
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
  const waitlistMsgContact = extractContactFromMessages(ctx.chatMessages)
  const phone =
    (typeof args.phone === 'string' ? args.phone.trim() : '') || waitlistMsgContact.phone || ''
  const email =
    (typeof args.email === 'string' ? args.email.trim() : '') || waitlistMsgContact.email || ''

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

  const windowError = checkDateInBookableWindow(date, ctx)
  if (windowError) return { result: windowError }

  // Never waitlist a closed day — no table can ever free up on it.
  const waitlistDayHours = getDayHoursForDate(ctx.bookingCtx.operatingHours, date)
  if (waitlistDayHours.closed) {
    return {
      result: {
        ok: false,
        error: 'closed_day',
        message: `The restaurant is closed on ${weekdayNameFromDateKey(date)} ${date}, so a waitlist for that day is not possible. Offer an open day instead.`,
      },
    }
  }

  // Avoid duplicate waitlist rows for the same conversation + slot.
  const normalizedTime = time.padStart(5, '0')
  const { data: existingWait } = await supabaseAdmin
    .from('waitlist_entries')
    .select('id')
    .eq('conversation_id', ctx.conversation_id)
    .eq('requested_date', date)
    .eq('requested_time', normalizedTime)
    .in('status', ['waiting', 'contacted'])
    .limit(1)
    .maybeSingle()
  if (existingWait?.id) {
    return {
      result: {
        ok: true,
        already_waitlisted: true,
        message:
          'Guest is already on the waitlist for this date and time. Confirm that briefly — do not add them again.',
        date,
        time: normalizedTime,
        party_size: partySize,
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
    requested_time: normalizedTime,
    party_size: partySize,
    zone_id: zoneId,
    notes: typeof args.notes === 'string' && args.notes.trim() ? args.notes.trim() : null,
  })

  if (error) {
    console.error('[waitlist] Insert failed:', error.message)
    return { result: { ok: false, error: 'db_error', message: 'Could not join the waitlist. Try again.' } }
  }

  console.log('[waitlist] Guest waitlisted:', { guestName, date, time: normalizedTime, partySize })
  return {
    customerId: targetCustomerId,
    result: {
      ok: true,
      message:
        'Guest added to the waitlist. Tell them the restaurant will reach out as soon as a table for that time frees up.',
      date,
      time: normalizedTime,
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
 * category across the whole conversation (ctx.escalated is seeded from
 * conversations.escalated_categories and persisted back after each alert);
 * honors the per-category toggles in Settings.
 * Returns true when an email was queued, false when skipped (toggle off / already sent).
 */
type EscalationContact = { name?: string | null; phone?: string | null; email?: string | null }

function triggerEscalation(
  ctx: ToolContext,
  category: EscalationCategory,
  reason: string,
  contact?: EscalationContact,
): boolean {
  if (!escalationEnabled(category, ctx.notifSettings)) return false
  if (ctx.escalated.has(category)) return false
  ctx.escalated.add(category)
  queueEscalationOwnerEmail(ctx.ownerEmail, ctx.ownerName, {
    category,
    reason,
    conversationId: ctx.conversation_id,
    baseUrl: ctx.baseUrl,
    guestName: contact?.name?.trim() || null,
    phone: contact?.phone?.trim() || null,
    email: contact?.email?.trim() || null,
  })
  // Persist the dedupe marker; best effort — the column may not exist until
  // migration 018 runs, and a failed write must never break the chat.
  void supabaseAdmin
    .from('conversations')
    .update({ escalated_categories: [...ctx.escalated] })
    .eq('id', ctx.conversation_id)
    .eq('business_id', ctx.business_id)
    .then(({ error }) => {
      if (error && !/escalated_categories/.test(error.message)) {
        console.error('[escalation] Failed to persist dedupe marker:', error.message)
      }
    })
  return true
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

  // Resolve the best contact so staff can call the guest back: tool args first,
  // then anything the guest typed in the conversation, then their saved record.
  const argContact = normalizeGuestContact({
    name: typeof args.guest_name === 'string' ? args.guest_name : null,
    phone: typeof args.phone === 'string' ? args.phone : null,
    email: typeof args.email === 'string' ? args.email : null,
  })
  const msgContact = extractContactFromMessages(ctx.chatMessages)
  let contactPhone = argContact.phone ?? msgContact.phone ?? null
  let contactEmail = argContact.email ?? msgContact.email ?? null
  if (!contactPhone || !contactEmail) {
    const { data: custRow } = await supabaseAdmin
      .from('customers')
      .select('name, phone, email')
      .eq('id', ctx.customer_id)
      .eq('business_id', ctx.business_id)
      .maybeSingle()
    if (custRow) {
      contactPhone = contactPhone || (custRow.phone?.trim() || null)
      contactEmail = contactEmail || (custRow.email?.trim() || null)
    }
  }

  // Persist a phone/name captured only in this escalation so it lands in the CRM
  // (best effort — never block the alert on it).
  if (argContact.phone || argContact.email || argContact.name) {
    await persistGuest({
      business_id: ctx.business_id,
      customer_id: ctx.customer_id,
      conversation_id: ctx.conversation_id,
      rawName: typeof args.guest_name === 'string' ? args.guest_name : null,
      rawPhone: typeof args.phone === 'string' ? args.phone : null,
      rawEmail: typeof args.email === 'string' ? args.email : null,
    })
  }

  const sent = triggerEscalation(ctx, category, reason, {
    name: typeof args.guest_name === 'string' ? args.guest_name : null,
    phone: contactPhone,
    email: contactEmail,
  })
  if (!sent) {
    return {
      result: {
        ok: false,
        error: 'escalation_disabled',
        message:
          'This escalation category is turned off in the restaurant settings, or the team was already alerted for it in this conversation. Continue helping the guest normally — do not claim the team was just notified.',
      },
    }
  }
  const hasContact = Boolean(contactPhone || contactEmail)
  return {
    result: {
      ok: true,
      contact_on_file: hasContact,
      message: hasContact
        ? 'The team has been alerted and will follow up by phone. Reassure the guest the team will reach out on the number provided, and keep helping them normally.'
        : 'The team has been alerted, but NO phone or email is on file for this guest. Ask them for the best phone number to call them back on, then call save_guest_details with it. Do not claim the team can reach them until you have a contact.',
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
    case 'get_my_reservation':
      return runGetMyReservation(ctx)
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
      const result = await resend.emails.send({
        from,
        to,
        subject: `New guest started a chat — ${businessName ?? 'Your restaurant'}`,
        text: `A new guest just started chatting with your AI Concierge.\n\nReview the conversation in your OceanCore inbox.`,
      })
      if (result.error) {
        console.error('[email] New-chat alert error:', result.error)
      } else {
        console.log('[email] New-chat alert sent, id:', result.data?.id)
      }
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
    guestName?: string | null
    phone?: string | null
    email?: string | null
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

      // Contact block — the whole point of an escalation is that staff can reach
      // the guest directly. Phone is rendered as a tel: link for one-tap calling.
      const phone = details.phone?.trim() || null
      const email = details.email?.trim() || null
      const guestName = details.guestName?.trim() || null
      const telHref = phone ? phone.replace(/[^\d+]/g, '') : null
      const contactRows: string[] = []
      if (guestName) {
        contactRows.push(
          `<p style="margin:0 0 4px;font-size:14px;color:#0f172a;"><strong>${escapeHtml(guestName)}</strong></p>`,
        )
      }
      if (phone) {
        contactRows.push(
          `<p style="margin:0 0 4px;font-size:14px;color:#0f172a;">📞 <a href="tel:${escapeHtml(telHref ?? '')}" style="color:#0c1a2e;font-weight:600;text-decoration:none;">${escapeHtml(phone)}</a></p>`,
        )
      }
      if (email) {
        contactRows.push(
          `<p style="margin:0 0 4px;font-size:14px;color:#0f172a;">✉ <a href="mailto:${escapeHtml(email)}" style="color:#0c1a2e;font-weight:600;text-decoration:none;">${escapeHtml(email)}</a></p>`,
        )
      }
      const contactBlock =
        contactRows.length > 0
          ? `<p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;text-transform:uppercase;">Reach the guest</p>
    <div style="margin:0 0 22px;padding:12px 14px;border-radius:10px;background:#f0f9ff;border:1px solid #bae6fd;">${contactRows.join('')}</div>`
          : `<p style="margin:0 0 22px;padding:12px 14px;border-radius:10px;background:#fef2f2;border:1px solid #fecaca;font-size:13px;color:#991b1b;line-height:1.5;">No phone or email was captured — reply in the conversation to reach this guest.</p>`

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
    ${contactBlock}
    <a href="${chatUrl}" style="display:block;text-align:center;background:#0c1a2e;color:#f8fafc;text-decoration:none;font-size:13px;font-weight:600;padding:13px 24px;border-radius:9px;">Open the conversation →</a>
  </td></tr>
  <tr><td style="padding:14px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">Sent by OceanCore for ${escapeHtml(businessName ?? 'your restaurant')}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

      const contactText = [
        guestName ? `Guest: ${guestName}` : '',
        phone ? `Phone: ${phone}` : '',
        email ? `Email: ${email}` : '',
      ].filter(Boolean).join('\n')

      const result = await resend.emails.send({
        from,
        to,
        subject: `⚠ ${label} — a guest needs attention`,
        html,
        text: `${label}\n\n${details.reason}\n${contactText ? `\n${contactText}\n` : '\nNo phone or email captured — reply in the conversation.\n'}\nOpen the conversation: ${chatUrl}`,
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

/** Fire-and-forget; never throws. Sends the GUEST a warm booking confirmation (or update). */
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
    /** 'updated' switches the copy from "You're booked" to "Your reservation is updated". */
    variant?: 'new' | 'updated'
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
      const isUpdate = details.variant === 'updated'
      const heading = isUpdate ? `Reservation updated, ${firstName}` : `You're booked, ${firstName}!`

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
    <p style="margin:0;font-size:22px;font-weight:700;color:#f8fafc;letter-spacing:-0.01em;">${heading}</p>
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
        isUpdate
          ? `Your reservation at ${restaurantName} has been updated, ${details.guestName.split(/\s+/)[0]}.`
          : `You're booked at ${restaurantName}, ${details.guestName.split(/\s+/)[0]}!`,
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
        subject: isUpdate
          ? `Updated: your table at ${restaurantName} — ${formattedDate}, ${formattedTime}`
          : `Your table at ${restaurantName} — ${formattedDate}, ${formattedTime}`,
        html,
        text,
      })
      if (result.error) console.error('[email] Guest confirmation error:', result.error)
    } catch (err) {
      console.error('[email] Unexpected error sending guest confirmation:', err)
    }
  })()
}

/** Fire-and-forget; never throws. Tells the GUEST their reservation was cancelled. */
function queueGuestCancellationEmail(
  guestEmail: string,
  restaurantName: string,
  details: { guestName: string; date: string; time: string },
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

      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Reservation cancelled — ${restaurant}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
  <tr><td style="background:#0c1a2e;border-radius:14px 14px 0 0;padding:28px 32px;">
    <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.14em;color:#38bdf8;text-transform:uppercase;">${restaurant}</p>
    <p style="margin:0;font-size:22px;font-weight:700;color:#f8fafc;letter-spacing:-0.01em;">Reservation cancelled</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:24px 32px 28px;">
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a;line-height:1.6;">Hi ${firstName} — your reservation for <strong>${escapeHtml(formattedDate)} at ${escapeHtml(formattedTime)}</strong> has been cancelled as requested.</p>
    <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">Changed your mind? Just open the chat again and we'll happily find you a new table.</p>
  </td></tr>
  <tr><td style="padding:14px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">Sent by ${restaurant} via OceanCore</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

      const result = await resend.emails.send({
        from,
        to,
        subject: `Cancelled: your table at ${restaurantName} — ${formattedDate}, ${formattedTime}`,
        html,
        text: `Hi ${details.guestName.split(/\s+/)[0] || 'there'} — your reservation at ${restaurantName} for ${formattedDate} at ${formattedTime} has been cancelled as requested.\n\nChanged your mind? Open the chat again and we'll find you a new table.`,
      })
      if (result.error) console.error('[email] Guest cancellation error:', result.error)
    } catch (err) {
      console.error('[email] Unexpected error sending guest cancellation:', err)
    }
  })()
}

/** Fire-and-forget; never throws. Alerts the OWNER that a booking was cancelled or moved. */
function queueBookingChangeOwnerEmail(
  ownerEmail: string | null,
  ownerName: string | null,
  details: {
    kind: 'cancelled' | 'rescheduled'
    guestName: string
    partySize: number | null
    date: string
    time: string
    zone: string | null
    previousDate?: string
    previousTime?: string
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
      const restaurant = escapeHtml(ownerName ?? 'Your restaurant')
      const isCancel = details.kind === 'cancelled'
      const title = isCancel ? 'Reservation cancelled' : 'Reservation rescheduled'
      const headerBg = isCancel ? '#7c2d12' : '#0c1a2e'
      const accent = isCancel ? '#fdba74' : '#38bdf8'
      const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/bookings`
        : 'https://app.oceancore.co/dashboard/bookings'

      const fmtDate = (dateKey: string) =>
        new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
        })
      const fmtTime = (time: string) => {
        const [h, m] = time.split(':').map(Number)
        return `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
      }

      const summaryLines = [
        `Guest: ${details.guestName}`,
        details.partySize != null ? `Party: ${details.partySize}` : '',
        isCancel
          ? `Was: ${fmtDate(details.date)} at ${fmtTime(details.time)}`
          : `Now: ${fmtDate(details.date)} at ${fmtTime(details.time)}`,
        !isCancel && details.previousDate && details.previousTime
          ? `Was: ${fmtDate(details.previousDate)} at ${fmtTime(details.previousTime)}`
          : '',
        details.zone ? `Seating: ${details.zone}` : '',
      ].filter(Boolean)

      const summaryHtml = summaryLines
        .map((line) => `<p style="margin:0 0 6px;font-size:14px;color:#0f172a;line-height:1.5;">${escapeHtml(line)}</p>`)
        .join('')

      const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;">
<tr><td align="center" style="padding:40px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
  <tr><td style="background:${headerBg};border-radius:14px 14px 0 0;padding:24px 32px;">
    <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.14em;color:${accent};text-transform:uppercase;">OceanCore · ${restaurant}</p>
    <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">${escapeHtml(title)}</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:26px 32px;">
    ${summaryHtml}
    <a href="${dashboardUrl}" style="display:block;margin-top:20px;text-align:center;background:#0c1a2e;color:#f8fafc;text-decoration:none;font-size:13px;font-weight:600;padding:13px 24px;border-radius:9px;">View in Dashboard →</a>
  </td></tr>
  <tr><td style="padding:14px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">Sent by OceanCore for ${restaurant}</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

      const result = await resend.emails.send({
        from,
        to,
        subject: `${title} — ${details.guestName}, ${fmtDate(details.date)} at ${fmtTime(details.time)}`,
        html,
        text: `${title}\n\n${summaryLines.join('\n')}\n\nDashboard: ${dashboardUrl}`,
      })
      if (result.error) {
        console.error(`[email] ${details.kind} owner email error:`, result.error)
      }
    } catch (err) {
      console.error(`[email] Unexpected error sending ${details.kind} owner email:`, err)
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
      /** Device-remembered guest id (widget localStorage) — candidate only, validated server-side. */
      guest_customer_id?: string
      from_dashboard?: boolean
    }

    const chatMessages = sanitizeIncomingMessages(body.messages)
    const business_id = body.business_id
    const conversation_id = body.conversation_id
    const guest_customer_id =
      typeof body.guest_customer_id === 'string' && body.guest_customer_id.trim()
        ? body.guest_customer_id.trim()
        : null
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
        model: CHAT_MODEL,
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
    let resolvedConversationId: string | null = null
    let resolvedCustomerId: string | null = null
    let isNewConversation = false

    if (conversation_id) {
      const { data: existing } = await supabaseAdmin
        .from('conversations')
        .select('id, customer_id, business_id, status')
        .eq('id', conversation_id)
        .eq('business_id', business_id)
        .maybeSingle()

      // A stale id (the device remembers a conversation the owner deleted or a
      // retention job removed) must NOT brick the widget with a 404 on every
      // message — fall through and start a fresh conversation instead; the
      // response carries the new conversation_id, so the client heals itself.
      if (existing) {
        resolvedConversationId = existing.id
        resolvedCustomerId = existing.customer_id ?? null
      }
    }

    if (!resolvedConversationId) {
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

    if (!resolvedConversationId) {
      return NextResponse.json({ error: 'Failed to resolve conversation' }, { status: 500 })
    }

    // ── Returning guest recognition (before creating a placeholder customer) ──
    // Identity sources, strongest first:
    //   1. phone/email typed in THIS conversation (guest proved who they are)
    //   2. guest id remembered by the device (widget localStorage, validated
    //      server-side against this business — placeholders never qualify)
    //   3. the conversation's already-linked customer (restored session)
    let returningGuest: CustomerRow | null = null
    const { phone: contactPhone, email: contactEmail } = extractContactFromMessages(chatMessages)

    if (contactPhone || contactEmail) {
      returningGuest = await lookupReturningGuest(
        business_id,
        contactPhone ?? null,
        contactEmail ?? null,
      )
    }
    if (!returningGuest && guest_customer_id) {
      returningGuest = await loadRecognizedGuest(business_id, guest_customer_id)
    }
    if (!returningGuest && resolvedCustomerId) {
      returningGuest = await loadRecognizedGuest(business_id, resolvedCustomerId)
    }

    let returningGuestContext: string | null = null
    let returningGuestUsualZone: string | null = null
    if (returningGuest) {
      const history = await fetchGuestHistory(returningGuest.id)
      returningGuestContext = buildReturningGuestContext(returningGuest, history)
      returningGuestUsualZone = history.usualZone
      resolvedCustomerId = returningGuest.id

      await linkConversationToCustomer({
        conversation_id: resolvedConversationId,
        business_id,
        customer_id: returningGuest.id,
        customer_name: returningGuest.name?.trim() || 'Guest',
      })
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
      // Only advertise a deposit the system can actually collect — with Stripe
      // unconfigured the bot would promise a payment link that never arrives.
      paymentSettings.deposit_enabled && getStripe() ? paymentSettings.deposit_per_guest : null,
      (business as Record<string, unknown>).language as string | null,
      notifSettings,
      bookingCtx.operatingHours,
      nowParts,
      bookingCtx.bookingSettings.slot_interval_minutes,
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
    // escalated_categories dedupes owner alerts across turns; tolerate the
    // column not existing yet (migration 018) by falling back to status-only.
    let convForAi: { status?: string | null; escalated_categories?: string[] | null } | null = null
    {
      const full = await supabaseAdmin
        .from('conversations')
        .select('status, escalated_categories')
        .eq('id', resolvedConversationId)
        .eq('business_id', business_id)
        .maybeSingle()
      if (!full.error) {
        convForAi = full.data
      } else {
        const { data: statusOnly } = await supabaseAdmin
          .from('conversations')
          .select('status')
          .eq('id', resolvedConversationId)
          .eq('business_id', business_id)
          .maybeSingle()
        convForAi = statusOnly
      }
    }

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

    const escalatedCategories = new Set<string>(
      Array.isArray(convForAi?.escalated_categories)
        ? convForAi.escalated_categories.filter((c): c is string => typeof c === 'string')
        : [],
    )
    let bookingCreated = false
    let bookingCancelled = false
    let bookingRescheduled = false
    let bookingDetails: { guest_name: string; party_size: number; date: string; time: string; dining_area: string | null } | null = null
    let assistantText = ''

    // 5 rounds fits the longest legitimate chain (get_my_reservation →
    // check_availability → reschedule → save_guest_details → final answer).
    const MAX_TOOL_ROUNDS = 5
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const isLastRound = round === MAX_TOOL_ROUNDS - 1
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
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
        console.log('[chat] tool call:', call.function.name, (call.function.arguments || '{}').slice(0, 300))

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
          usualZoneName: returningGuestUsualZone,
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
