import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

import {
  buildAvailabilityPromptSection,
  inferDateKeyFromText,
  isSlotAvailable,
  pickZoneForSlot,
  preferredWallClockFromText,
  type ExistingBooking,
} from '@/lib/booking-availability'
import {
  formatZoneNamesList,
  resolveZoneFromConversation,
  type DiningZone,
} from '@/lib/dining-zones'
import type { BookingSettings } from '@/lib/booking-settings'
import { formatWallClock, getCalgaryNowParts, wallClockFromDate } from '@/lib/booking-wall-clock'
import { loadBusinessBookingContext } from '@/lib/booking-load'
import { isPlausibleGuestName } from '@/lib/guest-display'
import type { OperatingHours } from '@/lib/operating-hours'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessOwner } from '@/lib/verify-business-owner'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type ChatMessage = { role: string; content: string }

// ─── Conversation-flow system prompt injection ────────────────────────────────

const BOOKING_FLOW_RULES = `
RESERVATION FLOW — follow this order. Skip any step already satisfied (see RESERVATION PROGRESS below).
1. If the guest mentions wanting a table, ask for their preferred date and time first — unless they already gave both.
2. Ask how many guests will be joining — ONLY if party size is not already stated in the conversation (e.g. "table for 2", "party of 4", "2 people"). Never ask again if RESERVATION PROGRESS marks party size as already stated.
3. SEATING AREA — if RESERVATION PROGRESS lists multiple dining zones and zone is NOT yet chosen, ask where they would like to sit. Offer the zone names from DINING ZONES AVAILABLE (e.g. Patio, Bar, Main dining). If they say "no preference", "anywhere", "whatever works", etc., accept that and proceed — you will assign the best open zone at their time and tell them which area they got (e.g. "We've got you on the Patio at 7pm"). Skip this step if only one zone exists or guest already chose a specific zone or no preference.
4. Once party size is clear (and seating area when required), ask: "May I have your name for the reservation?"
5. Once you have their name, ask: "And a phone number or email so we can send a confirmation?"
   (Make clear this is optional but preferred.)
6. Only AFTER collecting name, date, time, party size, and seating area when applicable: confirm the reservation details
   back to the guest by name, including the dining area when assigned, and say it's been placed.

CANCELLATION FLOW:
- If the guest asks to cancel their reservation, confirm you have cancelled it and say goodbye warmly.
- Use the word "cancelled" explicitly in your confirmation (e.g. "Your reservation has been cancelled.").

CRITICAL RULES:
- NEVER create or confirm a reservation without first asking for the guest's name.
- Once the guest provides their name, address them by first name for the rest of the conversation.
- If the guest skips the contact step, that is fine — proceed to confirmation.
- Keep responses concise (2–4 sentences). Never repeat questions already answered.

AVAILABILITY RULES (when AVAILABLE RESERVATION TIMES are listed below):
- ONLY confirm a reservation at a time that appears in AVAILABLE RESERVATION TIMES, or marked as AVAILABLE for the requested time.
- If the guest's preferred time is NOT available, apologize briefly and offer 2–3 alternatives from the list.
- Never invent open times. If no times are listed, ask for another date or time window.
- For "around 7pm", pick the closest available slot from the list and offer it.
- Slot labels may include a zone in parentheses — use that zone only after the guest chose it (or said no preference).

RESCHEDULE FLOW:
- If the guest wants to change their reservation time, confirm the new time only if it is in AVAILABLE RESERVATION TIMES.
- Use the word "rescheduled" when confirming a moved booking.
`

type MenuEntry = { name: string; price: number | null; description: string | null; category: string | null }

function buildSystemPrompt(
  conciergeName: string,
  restaurantName: string,
  customPrompt: string | null | undefined,
  menuItems?: MenuEntry[] | null,
  menuPdfText?: string | null,
  returningGuestContext?: string | null,
  availabilitySection?: string | null,
): string {
  const base = customPrompt?.trim()
    ? customPrompt.trim()
    : `You are ${conciergeName}, the AI Concierge for ${restaurantName}. Help guests with reservations, menu inquiries, dietary requirements, and general questions. Be warm, attentive, and concise.`
  let prompt = `${base}\n\n${BOOKING_FLOW_RULES}`
  if (availabilitySection?.trim()) {
    prompt += `\n\n${availabilitySection.trim()}`
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

function toOpenAiMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }))
}

function getUserMessagesCombined(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role === 'user' && typeof m.content === 'string')
    .map((m) => m.content)
    .join('\n')
}

/** Detects restaurant reservation intent in user or assistant text. */
function hasReservationIntent(text: string) {
  return /\b(reserv\w*|book\w*|table|party|seat\w*|dining|dinner|lunch|brunch|tonight|tomorrow|guests?)\b/i.test(
    text.trim(),
  )
}

// ─── Name / contact extraction ───────────────────────────────────────────────

/**
 * Extracts a guest's full name from text.
 * Looks for explicit patterns like "my name is …", "under Smith", "for Johnson", or
 * AI confirmation phrasing "I have your reservation, Jane Doe" before falling back to
 * a bare proper-noun pair.
 */
function extractGuestName(text: string): string | null {
  const t = text.trim()
  if (!t) return null

  // High-confidence: explicit name statement from the user (supports single or multi-word names)
  const explicit: RegExp[] = [
    /\b(?:my\s+name\s+is|name\s+is|i(?:'m| am))\s+([A-Z][a-zA-Z''-]+(?:\s+[A-Z][a-zA-Z''-]+)*)/i,
    /\b(?:for|under)\s+(?:the\s+name\s+)?([A-Z][a-zA-Z''-]+(?:\s+[A-Z][a-zA-Z''-]+)*)/,
    /\b(?:it(?:'s| is)|that(?:'s| is))\s+([A-Z][a-zA-Z''-]+(?:\s+[A-Z][a-zA-Z''-]+)*)/,
    /^([A-Z][a-zA-Z''-]+(?:\s+[A-Z][a-zA-Z''-]+)*)\s*[.!,]?\s*$/m, // standalone name (single or multi-word)
  ]

  const stopWords = new Set([
    'yes', 'no', 'sure', 'ok', 'okay', 'thanks', 'thank', 'please', 'hello',
    'hi', 'hey', 'great', 'good', 'nice', 'perfect', 'awesome', 'cool',
    'right', 'fine', 'absolutely', 'definitely', 'tonight', 'tomorrow',
    'today', 'table', 'reservation', 'book', 'menu', 'price', 'check',
    'placing', 'place', 'confirm', 'confirmed', 'confirming', 'now', 'your',
    'working', 'processing', 'moment', 'soon', 'hold', 'wait',
  ])

  for (const pattern of explicit) {
    const match = t.match(pattern)
    if (match?.[1]) {
      const name = match[1].replace(/\s+/g, ' ').trim()
      if (
        name.length >= 2 &&
        name.length <= 80 &&
        !stopWords.has(name.toLowerCase()) &&
        isPlausibleGuestName(name)
      ) {
        return name
      }
    }
  }

  return null
}

/**
 * Pulls a real name from the full conversation context: checks user messages first,
 * then assistant text (AI may echo the name in a confirmation).
 */
function extractGuestNameFromConversation(
  allMessages: ChatMessage[],
  assistantText: string,
): string | null {
  // Check user messages (most recent first)
  const userTexts = allMessages.filter((m) => m.role === 'user').map((m) => m.content)
  for (const t of [...userTexts].reverse()) {
    const n = extractGuestName(t)
    if (n) return n
  }
  // Check assistant text (AI may echo the name)
  const fromAssistant = extractGuestName(assistantText)
  if (fromAssistant) return fromAssistant

  // Last resort: look for AI confirmation patterns like "reservation for Yana" / "Thank you, Yana"
  const aiNamePatterns = [
    /\breservation\s+(?:for|under)\s+([A-Z][a-zA-Z''-]+(?:\s+[A-Z][a-zA-Z''-]+)*)/,
    /\b(?:thank\s+you|thanks),?\s+([A-Z][a-zA-Z''-]+)/i,
    /\b(?:see\s+you|expect\s+you),?\s+([A-Z][a-zA-Z''-]+)/i,
  ]
  for (const pat of aiNamePatterns) {
    const m = assistantText.match(pat)
    if (m?.[1] && isPlausibleGuestName(m[1].trim())) return m[1].trim()
  }

  return null
}

function extractPhone(text: string): string | null {
  const m = text.match(/\b(\+?[\d\s\-().]{7,20}\d)\b/)
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
    'id, business_id, name, email, phone, total_bookings, last_visit' as const

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

  return `RETURNING GUEST CONTEXT:
- Name: ${customer.name?.trim() || 'Guest'}
- Phone: ${customer.phone?.trim() || 'not on file'}
- Total visits: ${history.totalBookings}
- Last visit: ${formatVisitDate(history.lastVisit)}
- Preferred party size: ${partyHint}
- Past reservations: ${servicesHint}
Use this info to personalize the conversation. Greet them by name, suggest their usual booking if appropriate.`
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
 * After every AI reply, inspect the full conversation for a name/phone/email.
 * If found, update the customers record and the conversations.customer_name so the
 * inbox shows the real name instead of "Website visitor".
 */
async function syncGuestInfo(params: {
  allMessages: ChatMessage[]
  assistantText: string
  business_id: string
  customer_id: string
  conversation_id: string
}): Promise<string> {
  const { allMessages, assistantText, business_id, customer_id, conversation_id } = params

  const rawName = extractGuestNameFromConversation(allMessages, assistantText)
  const allUserText = getUserMessagesCombined(allMessages)
  const rawPhone = extractPhone(allUserText)
  const { name, phone, email } = normalizeGuestContact({
    name: rawName,
    phone: rawPhone,
    email: extractEmail(allUserText),
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
  if (name && (!existing?.name || placeholderName.test(existing.name.trim()))) {
    customerUpdate.name = name
  }
  if (phone && !existing?.phone?.trim()) {
    customerUpdate.phone = phone
    if (rawPhone) customerUpdate.phone_raw = rawPhone.trim()
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

// ─── Special request extraction ──────────────────────────────────────────────

const SPECIAL_REQUEST_KEYWORDS =
  /\b(near|close\s+to|next\s+to|by\s+the|window|outside|patio|terrace|garden|quiet|private|corner|booth|pool\s+table|birthday|anniversary|proposal|special\s+occasion|celebrat\w*|high\s+chair|wheelchair|accessible|prefer\w*|would\s+like|can\s+we|we'?d\s+like|seat\w*|settl\w*|spot|area)\b/i

function extractSpecialRequests(messages: ChatMessage[]): string | null {
  const sentences = messages
    .filter((m) => m.role === 'user')
    .flatMap((m) =>
      m.content
        .split(/(?<=[.!?])\s+|(?<=\band\b)\s+/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 4),
    )

  const found = sentences.filter((s) => SPECIAL_REQUEST_KEYWORDS.test(s))
  if (found.length === 0) return null
  // deduplicate and join
  return [...new Set(found)].join('; ')
}

// ─── Reservation creation ─────────────────────────────────────────────────────

function extractPartySize(text: string): number | null {
  const numWords: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  }

  const tryNum = (raw: string) => {
    const n = parseInt(raw, 10)
    return n >= 1 && n <= 30 ? n : null
  }

  const patterns: RegExp[] = [
    /\b(?:party\s+of|table\s+for|reservation\s+for|book(?:ing)?\s+(?:a\s+)?table\s+for)\s+(\d{1,2})\b/i,
    /\bfor\s+(\d{1,2})\s+(?:guests?|people|persons|pax)\b/i,
    /\b(\d{1,2})\s+(?:guests?|people|persons|pax)\b/i,
    /\b(?:party\s+of|table\s+for|for)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i,
    /\ba\s+party\s+of\s+(\d{1,2})\b/i,
  ]

  for (const re of patterns) {
    const m = text.match(re)
    if (!m?.[1]) continue
    const token = m[1]
    if (/^\d{1,2}$/.test(token)) {
      const n = tryNum(token)
      if (n != null) return n
    } else {
      const w = numWords[token.toLowerCase()]
      if (w != null) return w
    }
  }

  const m4 = text.match(/^\s*(\d{1,2})\s*$/m)
  if (m4) return tryNum(m4[1])

  return null
}

function resolvePartySizeFromConversation(messages: ChatMessage[]): {
  partySize: number
  known: boolean
} {
  const allUserText = getUserMessagesCombined(messages)
  const lastUser = getLastUserMessageContent(messages) ?? ''
  const fromLast = extractPartySize(lastUser)
  if (fromLast != null) return { partySize: fromLast, known: true }
  const fromAll = extractPartySize(allUserText)
  if (fromAll != null) return { partySize: fromAll, known: true }
  return { partySize: 2, known: false }
}

function userSpecifiedReservationDate(text: string): boolean {
  const lower = text.toLowerCase()
  return (
    /\btomorrow\b/.test(lower) ||
    /\btonight\b/.test(lower) ||
    /\btoday\b/.test(lower) ||
    /\d{4}-\d{2}-\d{2}/.test(text) ||
    /\b(?:next|this)\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(
      lower,
    )
  )
}

function userSpecifiedReservationTime(text: string): boolean {
  return (
    /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(text) ||
    /\b(?:at\s+)?\d{1,2}:\d{2}\b/i.test(text)
  )
}

function buildReservationProgressSection(
  chatMessages: ChatMessage[],
  bookingCtx: BookingEngineContext,
): string {
  const allUserText = getUserMessagesCombined(chatMessages)
  const lastUser = getLastUserMessageContent(chatMessages) ?? ''
  const combined = `${allUserText}\n${lastUser}`

  const { partySize, known: partyKnown } = resolvePartySizeFromConversation(chatMessages)
  const dateKnown = userSpecifiedReservationDate(combined)
  const timeKnown = userSpecifiedReservationTime(combined)

  const assistantSnippet = chatMessages
    .filter((m) => m.role === 'assistant')
    .slice(-3)
    .map((m) => m.content)
    .join('\n')

  const zoneResolution = resolveZoneFromConversation(
    bookingCtx.zones,
    partyKnown ? partySize : 2,
    combined,
    assistantSnippet,
  )

  const lines: string[] = []

  if (partyKnown) {
    lines.push(
      `- Party size: ${partySize} guest${partySize === 1 ? '' : 's'} — ALREADY STATED. Do NOT ask "how many guests" or party size again.`,
    )
  } else {
    lines.push('- Party size: not provided yet — ask once when date/time are clear (if still needed).')
  }

  if (dateKnown) {
    lines.push('- Date: already mentioned — do not ask for the date again unless unclear.')
  } else {
    lines.push('- Date: not yet clear — ask for preferred date.')
  }

  if (timeKnown) {
    lines.push('- Time: already mentioned — do not ask for the time again unless unclear.')
  } else if (dateKnown) {
    lines.push('- Time: not yet clear — ask for preferred time.')
  }

  if (zoneResolution.eligibleZones.length <= 1) {
    if (zoneResolution.zoneName) {
      lines.push(`- Dining area: ${zoneResolution.zoneName} (only option) — no need to ask.`)
    }
  } else if (zoneResolution.known && zoneResolution.zoneId && zoneResolution.zoneName) {
    lines.push(
      `- Dining area: ${zoneResolution.zoneName} — ALREADY CHOSEN. Do NOT ask where to sit again; use slots for that zone when confirming.`,
    )
  } else if (zoneResolution.known && !zoneResolution.zoneId) {
    lines.push(
      `- Dining area: no preference (anywhere is fine) — ALREADY SETTLED. Do NOT ask again. At confirmation, state which zone they received based on availability (first open zone at their time).`,
    )
  } else {
    lines.push(
      `- Dining area: NOT chosen — you MUST ask the guest their seating preference before confirming. Offer: ${formatZoneNamesList(zoneResolution.eligibleZones)}. They may say "no preference".`,
    )
  }

  const progress = `RESERVATION PROGRESS (honor "ALREADY STATED" — skip those booking-flow steps):\n${lines.join('\n')}`

  if (zoneResolution.eligibleZones.length > 1) {
    return `${progress}\n\nDINING ZONES AVAILABLE (for party of ${partyKnown ? partySize : '?'}): ${formatZoneNamesList(zoneResolution.eligibleZones)}`
  }

  return progress
}

// Calgary is always the business timezone — dates/times are wall-clock local to Calgary
const CALGARY_TZ = 'America/Edmonton'

function getCalgaryNow(): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CALGARY_TZ,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

// Returns a Date whose getFullYear/Month/Date/Hours match the Calgary wall-clock intent.
// We use the local-time constructor so wall-clock formatting (getHours etc.) stays correct.
function calgaryDate(year: number, month: number, day: number, hour = 19, minute = 0): Date {
  const d = new Date(year, month - 1, day)
  d.setHours(hour, minute, 0, 0)
  return d
}

function parseScheduledAt(text: string): Date | null {
  if (!text.trim()) return null

  const { year: cy, month: cm, day: cd, hour: ch, minute: cmin } = getCalgaryNow()

  // ISO: 2026-05-20 or 2026-05-20T19:00
  const iso = text.match(/(\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?)/i)
  if (iso) {
    const d = new Date(iso[1])
    if (!Number.isNaN(d.getTime())) return d
  }

  // MM/DD/YYYY [H:MM AM/PM]
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M)?)?/i)
  if (slash) {
    let year = parseInt(slash[3], 10)
    if (year < 100) year += 2000
    const d = new Date(year, parseInt(slash[1], 10) - 1, parseInt(slash[2], 10))
    if (!Number.isNaN(d.getTime())) {
      if (slash[4]) {
        let h = parseInt(slash[4], 10)
        const m = parseInt(slash[5], 10)
        const ap = slash[6]?.toUpperCase()
        if (ap === 'PM' && h < 12) h += 12
        if (ap === 'AM' && h === 12) h = 0
        d.setHours(h, m, 0, 0)
      }
      return d
    }
  }

  // Month name: May 20, Jun 5th
  const monthDay = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i,
  )
  if (monthDay) {
    const tryParse = new Date(`${monthDay[1]} ${monthDay[2]}, ${monthDay[3] ?? cy}`)
    if (!Number.isNaN(tryParse.getTime())) {
      const tm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
      if (tm) {
        let h = parseInt(tm[1], 10)
        const mi = tm[2] ? parseInt(tm[2], 10) : 0
        const ap = tm[3].toUpperCase()
        if (ap === 'PM' && h < 12) h += 12
        if (ap === 'AM' && h === 12) h = 0
        tryParse.setHours(h, mi, 0, 0)
      }
      return tryParse
    }
  }

  // Weekday: Friday / next Saturday / this Thursday
  const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  const wdMatch = text.match(/\b(?:(next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)
  if (wdMatch) {
    const modifier = wdMatch[1]?.toLowerCase()
    const targetWd = WEEKDAYS.indexOf(wdMatch[2].toLowerCase())
    const todayWd = new Date(cy, cm - 1, cd).getDay()
    let daysAhead = targetWd - todayWd
    if (modifier === 'next' || daysAhead <= 0) daysAhead += 7
    const tm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    let h = 19, mi = 0
    if (tm) {
      h = parseInt(tm[1], 10)
      mi = tm[2] ? parseInt(tm[2], 10) : 0
      const ap = tm[3].toUpperCase()
      if (ap === 'PM' && h < 12) h += 12
      if (ap === 'AM' && h === 12) h = 0
    }
    return calgaryDate(cy, cm, cd + daysAhead, h, mi)
  }

  // today / tonight
  if (/\b(today|tonight)\b/i.test(text)) {
    const tm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    let h = 19, mi = 0
    if (tm) {
      h = parseInt(tm[1], 10)
      mi = tm[2] ? parseInt(tm[2], 10) : 0
      const ap = tm[3].toUpperCase()
      if (ap === 'PM' && h < 12) h += 12
      if (ap === 'AM' && h === 12) h = 0
    }
    return calgaryDate(cy, cm, cd, h, mi)
  }

  // tomorrow
  if (/\btomorrow\b/i.test(text)) {
    const tm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    let h = 19, mi = 0
    if (tm) {
      h = parseInt(tm[1], 10)
      mi = tm[2] ? parseInt(tm[2], 10) : 0
      const ap = tm[3].toUpperCase()
      if (ap === 'PM' && h < 12) h += 12
      if (ap === 'AM' && h === 12) h = 0
    }
    return calgaryDate(cy, cm, cd + 1, h, mi)
  }

  // time only: 7pm, 8:30pm — use today if not yet passed, else tomorrow (Calgary time)
  const timeOnly = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (timeOnly) {
    let h = parseInt(timeOnly[1], 10)
    const m = timeOnly[2] ? parseInt(timeOnly[2], 10) : 0
    const ap = timeOnly[3].toUpperCase()
    if (ap === 'PM' && h < 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    const pastToday = ch > h || (ch === h && cmin >= m)
    return calgaryDate(cy, cm, pastToday ? cd + 1 : cd, h, m)
  }

  return null
}

function tonightAtSevenLocal(): Date {
  const { year, month, day, hour } = getCalgaryNow()
  return calgaryDate(year, month, hour >= 19 ? day + 1 : day, 19)
}

/**
 * Creates a reservation only when we have a real guest name (not the placeholder).
 * Also checks the AI confirmation text — the AI must have confirmed the booking in
 * this turn (to prevent duplicate inserts on every subsequent message).
 */
type BookingEngineContext = {
  operatingHours: OperatingHours
  bookingSettings: BookingSettings
  existingBookings: ExistingBooking[]
  zones: DiningZone[]
}

async function tryCreateReservationFromChat(params: {
  lastUserContent: string
  chatMessages: ChatMessage[]
  assistantText: string
  business_id: string
  customer_id: string
  conversation_id: string
  bookingCtx: BookingEngineContext
}) {
  const {
    lastUserContent,
    chatMessages,
    assistantText,
    business_id,
    customer_id,
    conversation_id,
    bookingCtx,
  } = params

  const allUserText = getUserMessagesCombined(chatMessages)

  // Only create when the AI is actively confirming the reservation in THIS turn.
  const aiIsConfirming = /\b(confirm\w*|reservation\s+(?:is\s+)?(?:set|placed|confirmed|made)|booked|all\s+set|see\s+you|expect\s+you)\b/i.test(
    assistantText,
  )
  if (!aiIsConfirming) return false

  const intentFromUser = hasReservationIntent(lastUserContent) || hasReservationIntent(allUserText)
  if (!intentFromUser) return false

  if (!business_id || !customer_id) return false

  // Prevent duplicates: skip if an active (non-cancelled) reservation already exists for this conversation
  const { count } = await supabaseAdmin
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation_id)
    .not('status', 'eq', 'cancelled')
  if (count && count > 0) {
    console.log('[booking] Reservation already exists for conversation, skipping')
    return false
  }

  // Require a real name — never create a reservation for 'Website visitor' or 'Guest'
  const guestName = extractGuestNameFromConversation(chatMessages, assistantText)
  if (!guestName || /^(guest|website visitor)$/i.test(guestName.trim())) return false

  const { partySize: partyFromThread } = resolvePartySizeFromConversation(chatMessages)
  const partySize = extractPartySize(assistantText) ?? partyFromThread

  const parsedTime =
    parseScheduledAt(lastUserContent) ??
    parseScheduledAt(allUserText) ??
    parseScheduledAt(assistantText) ??
    parseScheduledAt(`${lastUserContent}\n${assistantText}`)
  const scheduledAt = parsedTime ?? tonightAtSevenLocal()
  const wallClock = formatWallClock(wallClockFromDate(scheduledAt))
  const nowParts = getCalgaryNowParts()

  const combinedText = `${lastUserContent}\n${allUserText}\n${assistantText}`
  const zoneResolution = resolveZoneFromConversation(
    bookingCtx.zones,
    partySize,
    `${lastUserContent}\n${allUserText}`,
    assistantText,
  )

  if (!zoneResolution.known && zoneResolution.eligibleZones.length > 1) {
    console.log('[booking] Seating zone not chosen yet, skipping insert')
    return false
  }

  const preferredZoneId = zoneResolution.zoneId

  const available = isSlotAvailable({
    wallClock,
    operatingHours: bookingCtx.operatingHours,
    existing: bookingCtx.existingBookings,
    settings: bookingCtx.bookingSettings,
    now: nowParts,
    zones: bookingCtx.zones,
    partySize,
    zoneId: preferredZoneId,
  })

  if (!available) {
    console.log('[booking] Slot not available, skipping insert:', wallClock)
    return false
  }

  const assignedZone = pickZoneForSlot(
    wallClock,
    bookingCtx.zones,
    partySize,
    bookingCtx.operatingHours,
    bookingCtx.existingBookings,
    bookingCtx.bookingSettings,
    preferredZoneId,
    nowParts,
  )
  const zoneId = assignedZone?.id ?? preferredZoneId ?? null

  if (!zoneId) {
    console.log('[booking] Could not assign dining zone for slot')
    return false
  }
  const durationMinutes =
    assignedZone?.turnover_minutes ?? bookingCtx.bookingSettings.default_duration_minutes

  // Pack reservation details into service_name (schema-compatible).
  const svcParts = [guestName, `Party of ${partySize}`]
  const serviceName = svcParts.join(' · ').slice(0, 500)

  console.log('[booking] Creating reservation:', {
    guestName,
    partySize,
    wallClock,
    serviceName,
    parsedTimeSource: parsedTime ? 'parsed' : 'fallback-7pm',
    scheduledAtLocal: scheduledAt.toString(),
  })

  const notes = extractSpecialRequests(chatMessages)

  const { error } = await supabaseAdmin
    .from('appointments')
    .insert({
      business_id,
      customer_id,
      conversation_id,
      service_name: serviceName,
      scheduled_at: wallClock,
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
    return false
  }

  console.log('[booking] Reservation created successfully')
  await bumpCustomerVisitStats(customer_id, business_id)
  return true
}

// ─── Reservation cancellation ────────────────────────────────────────────────

async function tryCancelReservationFromChat(params: {
  lastUserContent: string
  assistantText: string
  business_id: string
  customer_id: string
  conversation_id: string
}): Promise<boolean> {
  const { lastUserContent, assistantText, business_id, customer_id, conversation_id } = params

  const userWantsCancel = /\b(cancel|cancell?\w*|call\s+off|drop\s+(?:the\s+)?reservation|don'?t\s+(?:want|need)(?:\s+(?:the|my))?\s+reservation)\b/i.test(
    lastUserContent,
  )
  if (!userWantsCancel) return false

  const aiConfirmsCancel = /\bcancell?ed\b/i.test(assistantText)
  if (!aiConfirmsCancel) return false

  // Try to find the reservation by conversation first, then by customer
  const { data: byConv } = await supabaseAdmin
    .from('appointments')
    .select('id')
    .eq('conversation_id', conversation_id)
    .in('status', ['pending', 'confirmed', 'seated'])
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let appointmentId = byConv?.id ?? null

  if (!appointmentId) {
    const { year: ny, month: nm, day: nd, hour: nh, minute: nmin } = getCalgaryNow()
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const nowWallClock = `${ny}-${pad2(nm)}-${pad2(nd)}T${pad2(nh)}:${pad2(nmin)}:00`

    const { data: byCustomer } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('business_id', business_id)
      .eq('customer_id', customer_id)
      .in('status', ['pending', 'confirmed', 'seated'])
      .gte('scheduled_at', nowWallClock)
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    appointmentId = byCustomer?.id ?? null
  }

  if (!appointmentId) {
    console.log('[cancel] No active reservation found to cancel')
    return false
  }

  const { error } = await supabaseAdmin
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appointmentId)
    .eq('business_id', business_id)

  if (error) {
    console.error('[cancel] Update failed:', error.message)
    return false
  }

  console.log('[cancel] Reservation cancelled:', appointmentId)
  return true
}

// ─── Reservation reschedule ────────────────────────────────────────────────────

async function tryRescheduleReservationFromChat(params: {
  lastUserContent: string
  chatMessages: ChatMessage[]
  assistantText: string
  business_id: string
  customer_id: string
  conversation_id: string
  bookingCtx: BookingEngineContext
}): Promise<boolean> {
  const { lastUserContent, chatMessages, assistantText, business_id, customer_id, conversation_id, bookingCtx } =
    params

  const userWantsReschedule =
    /\b(reschedule|re-schedule|change\s+(?:the\s+)?time|move\s+(?:it|my|the)\s+reservation|different\s+time|another\s+time)\b/i.test(
      lastUserContent,
    )
  if (!userWantsReschedule) return false

  const aiConfirms =
    /\b(reschedul\w+|moved\s+your|new\s+time|see\s+you\s+(?:then|at))\b/i.test(assistantText)
  if (!aiConfirms) return false

  const { data: appt } = await supabaseAdmin
    .from('appointments')
    .select('id, scheduled_at, status, zone_id')
    .eq('conversation_id', conversation_id)
    .in('status', ['pending', 'confirmed', 'seated'])
    .order('scheduled_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let appointmentId = appt?.id ?? null

  if (!appointmentId) {
    const nowParts = getCalgaryNowParts()
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const nowWallClock = `${nowParts.year}-${pad2(nowParts.month)}-${pad2(nowParts.day)}T${pad2(nowParts.hour)}:${pad2(nowParts.minute)}:00`

    const { data: byCustomer } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('business_id', business_id)
      .eq('customer_id', customer_id)
      .in('status', ['pending', 'confirmed', 'seated'])
      .gte('scheduled_at', nowWallClock)
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    appointmentId = byCustomer?.id ?? null
  }

  if (!appointmentId) return false

  const allUserText = getUserMessagesCombined(chatMessages)
  const parsedTime =
    parseScheduledAt(lastUserContent) ??
    parseScheduledAt(allUserText) ??
    parseScheduledAt(assistantText) ??
    null

  if (!parsedTime) return false

  const wallClock = formatWallClock(wallClockFromDate(parsedTime))
  const nowParts = getCalgaryNowParts()

  const { partySize: resolvedPartySize } = resolvePartySizeFromConversation(chatMessages)
  const partyFromAssistant = extractPartySize(assistantText)
  const partySize = partyFromAssistant ?? resolvedPartySize

  const zoneResolution = resolveZoneFromConversation(
    bookingCtx.zones,
    partySize,
    `${lastUserContent}\n${allUserText}`,
    assistantText,
  )
  const existingZoneId = appt?.zone_id != null ? String(appt.zone_id) : null
  const preferredZoneId = zoneResolution.zoneId ?? existingZoneId

  const available = isSlotAvailable({
    wallClock,
    operatingHours: bookingCtx.operatingHours,
    existing: bookingCtx.existingBookings,
    settings: bookingCtx.bookingSettings,
    now: nowParts,
    excludeAppointmentId: appointmentId,
    zones: bookingCtx.zones,
    partySize,
    zoneId: preferredZoneId,
  })

  if (!available) {
    console.log('[reschedule] New slot not available:', wallClock)
    return false
  }

  const assignedZone = pickZoneForSlot(
    wallClock,
    bookingCtx.zones,
    partySize,
    bookingCtx.operatingHours,
    bookingCtx.existingBookings,
    bookingCtx.bookingSettings,
    preferredZoneId,
    nowParts,
  )
  const durationMinutes =
    assignedZone?.turnover_minutes ?? bookingCtx.bookingSettings.default_duration_minutes

  const { error } = await supabaseAdmin
    .from('appointments')
    .update({
      scheduled_at: wallClock,
      duration_minutes: durationMinutes,
      zone_id: assignedZone?.id ?? preferredZoneId,
      party_size: partySize,
    })
    .eq('id', appointmentId)
    .eq('business_id', business_id)

  if (error) {
    console.error('[reschedule] Update failed:', error.message)
    return false
  }

  console.log('[reschedule] Reservation updated:', appointmentId, wallClock)
  return true
}

function buildChatAvailabilitySection(
  chatMessages: ChatMessage[],
  bookingCtx: BookingEngineContext,
): string | null {
  const allUserText = getUserMessagesCombined(chatMessages)
  const lastUser = getLastUserMessageContent(chatMessages) ?? ''
  const combined = `${allUserText}\n${lastUser}`

  if (!hasReservationIntent(combined) && !hasReservationIntent(lastUser)) {
    return null
  }

  const { partySize, known: partySizeKnown } = resolvePartySizeFromConversation(chatMessages)

  const nowParts = getCalgaryNowParts()
  const dateKey = inferDateKeyFromText(combined, nowParts)
  const preferred = preferredWallClockFromText(combined, dateKey, nowParts)

  const assistantSnippet = chatMessages
    .filter((m) => m.role === 'assistant')
    .slice(-3)
    .map((m) => m.content)
    .join('\n')

  const zoneResolution = resolveZoneFromConversation(
    bookingCtx.zones,
    partySize,
    combined,
    assistantSnippet,
  )

  const progress = buildReservationProgressSection(chatMessages, bookingCtx)
  const availability = buildAvailabilityPromptSection({
    operatingHours: bookingCtx.operatingHours,
    existing: bookingCtx.existingBookings,
    settings: bookingCtx.bookingSettings,
    targetDateKey: dateKey,
    partySize,
    partySizeKnown,
    preferredWallClock: preferred,
    now: nowParts,
    zones: bookingCtx.zones,
    preferredZoneId: zoneResolution.zoneId,
    zoneResolution,
  })

  return `${progress}\n\n${availability}`
}

// ─── Notification email ───────────────────────────────────────────────────────

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

    const chatMessages = body.messages
    const business_id = body.business_id
    const conversation_id = body.conversation_id
    const fromDashboard = body.from_dashboard === true

    if (!Array.isArray(chatMessages)) {
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

      const ipLimit = checkRateLimit(`chat-preview:ip:${clientIp}`, 10, CHAT_RATE_WINDOW_MS)
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

    const ipLimit = checkRateLimit(`chat:ip:${clientIp}`, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_MS)
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSec ?? 60) } },
      )
    }

    const bizLimit = checkRateLimit(`chat:biz:${business_id}`, CHAT_RATE_LIMIT * 2, CHAT_RATE_WINDOW_MS)
    if (!bizLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests for this business.' },
        { status: 429, headers: { 'Retry-After': String(bizLimit.retryAfterSec ?? 60) } },
      )
    }

    // ── Fetch business ────────────────────────────────────────────────────────
    const { data: business, error: bizError } = await supabaseAdmin
      .from('businesses')
      .select('id, name, email, system_prompt, agent_name, menu_pdf_text')
      .eq('id', business_id)
      .maybeSingle()

    if (bizError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
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

    const bookingCtx = await loadBusinessBookingContext(supabaseAdmin, business_id)
    const availabilitySection = buildChatAvailabilitySection(chatMessages, bookingCtx)

    const systemPrompt = buildSystemPrompt(
      conciergeName,
      restaurantName,
      business.system_prompt,
      menuItems,
      (business as Record<string, unknown>).menu_pdf_text as string | null,
      returningGuestContext,
      availabilitySection,
    )

    if (isNewConversation && resolvedCustomerId && !returningGuestContext) {
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

    // ── AI completion ─────────────────────────────────────────────────────────
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...toOpenAiMessages(chatMessages)],
      max_tokens: 1500,
    })

    const assistantText = completion.choices[0].message?.content ?? ''

    const { error: assistantMsgErr } = await supabaseAdmin.from('messages').insert({
      conversation_id: resolvedConversationId,
      role: 'assistant',
      content: assistantText,
    })

    if (assistantMsgErr) {
      return NextResponse.json({ error: assistantMsgErr.message }, { status: 500 })
    }

    // ── Extract & persist guest name / contact info ───────────────────────────
    if (resolvedCustomerId) {
      resolvedCustomerId = await syncGuestInfo({
        allMessages: chatMessages,
        assistantText,
        business_id,
        customer_id: resolvedCustomerId,
        conversation_id: resolvedConversationId,
      })
    }

    // ── Conditionally create or cancel reservation ────────────────────────────
    let bookingCreated = false
    let bookingCancelled = false
    let bookingRescheduled = false

    if (resolvedCustomerId) {
      bookingCancelled = await tryCancelReservationFromChat({
        lastUserContent: lastUserContent.trim(),
        assistantText,
        business_id,
        customer_id: resolvedCustomerId,
        conversation_id: resolvedConversationId,
      })

      if (!bookingCancelled) {
        bookingRescheduled = await tryRescheduleReservationFromChat({
          lastUserContent: lastUserContent.trim(),
          chatMessages,
          assistantText,
          business_id,
          customer_id: resolvedCustomerId,
          conversation_id: resolvedConversationId,
          bookingCtx,
        })
      }

      if (!bookingCancelled && !bookingRescheduled) {
        bookingCreated = await tryCreateReservationFromChat({
          lastUserContent: lastUserContent.trim(),
          chatMessages,
          assistantText,
          business_id,
          customer_id: resolvedCustomerId,
          conversation_id: resolvedConversationId,
          bookingCtx,
        })
      }
    }

    return NextResponse.json({
      message: assistantText,
      conversation_id: resolvedConversationId,
      customer_id: resolvedCustomerId,
      booking_created: bookingCreated,
      booking_cancelled: bookingCancelled,
      booking_rescheduled: bookingRescheduled,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error'
    console.error(JSON.stringify({ event: 'chat_error', message }))
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
