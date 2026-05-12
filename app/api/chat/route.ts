import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

import { supabaseAdmin } from '@/lib/supabase-admin'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type ChatMessage = { role: string; content: string }

// ─── Conversation-flow system prompt injection ────────────────────────────────

const BOOKING_FLOW_RULES = `
RESERVATION FLOW — follow this order strictly. Never skip a step.
1. If the guest mentions wanting a table, ask for their preferred date and time first.
2. Once date/time is clear, ask: "How many guests will be joining you?"
3. Once party size is clear, ask: "May I have your name for the reservation?"
4. Once you have their name, ask: "And a phone number or email so we can send a confirmation?"
   (Make clear this is optional but preferred.)
5. Only AFTER collecting name, date, time, and party size: confirm the reservation details
   back to the guest by name and say it's been placed.

CRITICAL RULES:
- NEVER create or confirm a reservation without first asking for the guest's name.
- Once the guest provides their name, address them by first name for the rest of the conversation.
- If the guest skips the contact step, that is fine — proceed to confirmation.
- Keep responses concise (2–4 sentences). Never repeat questions already answered.
`

type MenuEntry = { name: string; price: number | null; description: string | null; category: string | null }

function buildSystemPrompt(
  conciergeName: string,
  restaurantName: string,
  customPrompt: string | null | undefined,
  menuItems?: MenuEntry[] | null,
  menuPdfText?: string | null,
): string {
  const base = customPrompt?.trim()
    ? customPrompt.trim()
    : `You are ${conciergeName}, the AI Concierge for ${restaurantName}. Help guests with reservations, menu inquiries, dietary requirements, and general questions. Be warm, attentive, and concise.`
  let prompt = `${base}\n\n${BOOKING_FLOW_RULES}`
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
  ])

  for (const pattern of explicit) {
    const match = t.match(pattern)
    if (match?.[1]) {
      const name = match[1].replace(/\s+/g, ' ').trim()
      if (name.length >= 2 && name.length <= 80 && !stopWords.has(name.toLowerCase())) return name
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
    if (m?.[1] && m[1].length >= 2 && m[1].length <= 80) return m[1].trim()
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
}) {
  const { allMessages, assistantText, business_id, customer_id, conversation_id } = params

  const name = extractGuestNameFromConversation(allMessages, assistantText)
  const allUserText = getUserMessagesCombined(allMessages)
  const phone = extractPhone(allUserText)
  const email = extractEmail(allUserText)

  if (!name && !phone && !email) return

  const customerUpdate: Record<string, string> = {}
  if (name) customerUpdate.name = name
  if (phone) customerUpdate.phone = phone
  if (email) customerUpdate.email = email

  if (Object.keys(customerUpdate).length > 0) {
    await supabaseAdmin
      .from('customers')
      .update(customerUpdate)
      .eq('id', customer_id)
      .eq('business_id', business_id)
  }

  if (name) {
    await supabaseAdmin
      .from('conversations')
      .update({ customer_name: name })
      .eq('id', conversation_id)
      .eq('business_id', business_id)
  }
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
  const m1 = text.match(/\b(?:party\s+of|table\s+for|for)\s+(\d{1,2})\b/i)
  if (m1) {
    const n = parseInt(m1[1], 10)
    if (n >= 1 && n <= 30) return n
  }
  const m2 = text.match(
    /\b(?:party\s+of|table\s+for|for)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i,
  )
  if (m2) return numWords[m2[1].toLowerCase()] ?? null
  const m3 = text.match(/\b(\d{1,2})\s+(?:people|guests|persons|pax)\b/i)
  if (m3) {
    const n = parseInt(m3[1], 10)
    if (n >= 1 && n <= 30) return n
  }
  const m4 = text.match(/^\s*(\d{1,2})\s*$/m)
  if (m4) {
    const n = parseInt(m4[1], 10)
    if (n >= 1 && n <= 20) return n
  }
  return null
}

function parseScheduledAt(text: string): Date | null {
  if (!text.trim()) return null

  const iso = text.match(/(\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?)/i)
  if (iso) {
    const d = new Date(iso[1])
    if (!Number.isNaN(d.getTime())) return d
  }
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M)?)?/i)
  if (slash) {
    let year = parseInt(slash[3], 10)
    if (year < 100) year += 2000
    const month = parseInt(slash[1], 10) - 1
    const day = parseInt(slash[2], 10)
    const d = new Date(year, month, day)
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
  const monthDay = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i,
  )
  if (monthDay) {
    const tryParse = new Date(`${monthDay[1]} ${monthDay[2]}, ${monthDay[3] ?? new Date().getFullYear()}`)
    if (!Number.isNaN(tryParse.getTime())) return tryParse
  }
  if (/\btoday\b/i.test(text)) {
    const d = new Date()
    const tm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    if (tm) {
      let h = parseInt(tm[1], 10)
      const mi = tm[2] ? parseInt(tm[2], 10) : 0
      const ap = tm[3].toUpperCase()
      if (ap === 'PM' && h < 12) h += 12
      if (ap === 'AM' && h === 12) h = 0
      d.setHours(h, mi, 0, 0)
    } else {
      d.setHours(19, 0, 0, 0)
    }
    return d
  }
  if (/\btonight\b/i.test(text)) {
    const d = new Date()
    d.setHours(19, 0, 0, 0)
    return d
  }
  if (/\btomorrow\b/i.test(text)) {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(19, 0, 0, 0)
    return d
  }
  const timeOnly = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (timeOnly) {
    let h = parseInt(timeOnly[1], 10)
    const m = timeOnly[2] ? parseInt(timeOnly[2], 10) : 0
    const ap = timeOnly[3].toUpperCase()
    if (ap === 'PM' && h < 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    const d = new Date()
    if (d.getHours() > h || (d.getHours() === h && d.getMinutes() > m)) {
      d.setDate(d.getDate() + 1)
    }
    d.setHours(h, m, 0, 0)
    return d
  }
  return null
}

function tonightAtSevenLocal(): Date {
  const d = new Date()
  if (d.getHours() >= 19) d.setDate(d.getDate() + 1)
  d.setHours(19, 0, 0, 0)
  return d
}

/**
 * Creates a reservation only when we have a real guest name (not the placeholder).
 * Also checks the AI confirmation text — the AI must have confirmed the booking in
 * this turn (to prevent duplicate inserts on every subsequent message).
 */
async function tryCreateReservationFromChat(params: {
  lastUserContent: string
  chatMessages: ChatMessage[]
  assistantText: string
  business_id: string
  customer_id: string
  conversation_id: string
}) {
  const { lastUserContent, chatMessages, assistantText, business_id, customer_id, conversation_id } = params

  const allUserText = getUserMessagesCombined(chatMessages)

  // Only create when the AI is actively confirming the reservation in THIS turn.
  const aiIsConfirming = /\b(confirm\w*|reservation\s+(?:is\s+)?(?:set|placed|confirmed|made)|booked|all\s+set|see\s+you|expect\s+you)\b/i.test(
    assistantText,
  )
  if (!aiIsConfirming) return false

  const intentFromUser = hasReservationIntent(lastUserContent) || hasReservationIntent(allUserText)
  if (!intentFromUser) return false

  if (!business_id || !customer_id) return false

  // Require a real name — never create a reservation for 'Website visitor' or 'Guest'
  const guestName = extractGuestNameFromConversation(chatMessages, assistantText)
  if (!guestName || /^(guest|website visitor)$/i.test(guestName.trim())) return false

  const partySize =
    extractPartySize(lastUserContent) ??
    extractPartySize(allUserText) ??
    extractPartySize(assistantText) ??
    2

  const parsedTime =
    parseScheduledAt(lastUserContent) ??
    parseScheduledAt(allUserText) ??
    parseScheduledAt(assistantText) ??
    parseScheduledAt(`${lastUserContent}\n${assistantText}`)
  const scheduledAt = parsedTime ?? tonightAtSevenLocal()

  // Pack reservation details into service_name (schema-compatible).
  const svcParts = [guestName, `Party of ${partySize}`]
  const serviceName = svcParts.join(' · ').slice(0, 500)

  // Store as a "wall-clock" timestamp so bookings display shows the time the
  // guest intended regardless of server/client timezone differences.
  // Format: "2026-05-12T11:00:00" (no Z, no offset) — Supabase interprets
  // bare timestamps as UTC which the client then displays directly.
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const wallClock = `${scheduledAt.getFullYear()}-${pad2(scheduledAt.getMonth() + 1)}-${pad2(scheduledAt.getDate())}T${pad2(scheduledAt.getHours())}:${pad2(scheduledAt.getMinutes())}:00`

  console.log('[booking] Creating reservation:', {
    guestName,
    partySize,
    wallClock,
    serviceName,
    parsedTimeSource: parsedTime ? 'parsed' : 'fallback-7pm',
    scheduledAtLocal: scheduledAt.toString(),
  })

  const { error } = await supabaseAdmin
    .from('appointments')
    .insert({
      business_id,
      customer_id,
      conversation_id,
      service_name: serviceName,
      scheduled_at: wallClock,
      status: 'pending' as const,
    })
    .select('id')
    .maybeSingle()

  if (error) console.error('[booking] Insert failed:', error.message)
  else console.log('[booking] Reservation created successfully')

  return !error
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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: ChatMessage[]
      business_id?: string
      conversation_id?: string
    }

    const chatMessages = body.messages
    const business_id = body.business_id
    const conversation_id = body.conversation_id

    if (!Array.isArray(chatMessages)) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 })
    }

    // ── Anonymous / no business_id: preview mode ──────────────────────────────
    if (!business_id) {
      const systemPrompt = buildSystemPrompt(
        'AI Concierge',
        'this restaurant',
        null,
      )
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...toOpenAiMessages(chatMessages)],
        max_tokens: 500,
      })
      return NextResponse.json({ message: response.choices[0].message.content })
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
    const systemPrompt = buildSystemPrompt(conciergeName, restaurantName, business.system_prompt, menuItems, (business as Record<string, unknown>).menu_pdf_text as string | null)

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

    if (!resolvedCustomerId) {
      const { data: newCustomer, error: custErr } = await supabaseAdmin
        .from('customers')
        .insert({
          business_id,
          name: 'Website visitor',
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
          customer_name: newCustomer.name ?? 'Website visitor',
        })
        .eq('id', resolvedConversationId)
        .eq('business_id', business_id)

      if (linkErr) {
        return NextResponse.json({ error: linkErr.message }, { status: 500 })
      }
    }

    if (isNewConversation && resolvedCustomerId) {
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
      await syncGuestInfo({
        allMessages: chatMessages,
        assistantText,
        business_id,
        customer_id: resolvedCustomerId,
        conversation_id: resolvedConversationId,
      })
    }

    // ── Conditionally create reservation ─────────────────────────────────────
    const bookingCreated = resolvedCustomerId
      ? await tryCreateReservationFromChat({
          lastUserContent: lastUserContent.trim(),
          chatMessages,
          assistantText,
          business_id,
          customer_id: resolvedCustomerId,
          conversation_id: resolvedConversationId,
        })
      : false

    return NextResponse.json({
      message: assistantText,
      conversation_id: resolvedConversationId,
      customer_id: resolvedCustomerId,
      booking_created: bookingCreated,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
