import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/supabase-admin'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type ChatMessage = { role: string; content: string }

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

function hasBookingIntent(text: string) {
  return /\b(book|appointment|reserve|schedule)\b/i.test(text)
}

function getUserMessagesCombined(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role === 'user' && typeof m.content === 'string')
    .map((m) => m.content)
    .join('\n')
}

function extractServiceName(text: string): string | null {
  const t = text.trim()
  if (!t) {
    return null
  }
  const patterns: RegExp[] = [
    /\b(?:book|reserve|schedule)\s+(?:a|an|me\s+)?(?:an?\s+)?(.+?)(?:\s+on|\s+at|\s+for\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d)|,|\n|$)/i,
    /\bappointment\s+(?:for\s+)?(.+?)(?:\s+on|\s+at|,|\n|$)/i,
    /\bfor\s+(?:a|an\s+)?(.+?)(?:\s+on|\s+at|,|\n|$)/i,
  ]
  for (const pattern of patterns) {
    const match = t.match(pattern)
    if (match?.[1]) {
      const name = match[1].replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, '')
      if (name.length >= 2) {
        return name.slice(0, 240)
      }
    }
  }
  const stripped = t.replace(/\b(book|appointment|reserve|scheduled?|a|an|the|please|can|i|want|to|me|for|on|at)\b/gi, ' ')
  const collapsed = stripped.replace(/\s+/g, ' ').trim()
  if (collapsed.length >= 3 && collapsed.length <= 200) {
    return collapsed
  }
  return null
}

function parseScheduledAt(text: string): Date | null {
  if (!text.trim()) {
    return null
  }
  const iso = text.match(/(\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?)/i)
  if (iso) {
    const d = new Date(iso[1])
    if (!Number.isNaN(d.getTime())) {
      return d
    }
  }
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M)?)?/i)
  if (slash) {
    let year = parseInt(slash[3], 10)
    if (year < 100) {
      year += 2000
    }
    const month = parseInt(slash[1], 10) - 1
    const day = parseInt(slash[2], 10)
    const d = new Date(year, month, day)
    if (!Number.isNaN(d.getTime())) {
      if (slash[4]) {
        let h = parseInt(slash[4], 10)
        const m = parseInt(slash[5], 10)
        const ap = slash[6]?.toUpperCase()
        if (ap === 'PM' && h < 12) {
          h += 12
        }
        if (ap === 'AM' && h === 12) {
          h = 0
        }
        d.setHours(h, m, 0, 0)
      }
      return d
    }
  }
  const monthDay = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i
  )
  if (monthDay) {
    const tryParse = new Date(`${monthDay[1]} ${monthDay[2]}, ${monthDay[3] ?? new Date().getFullYear()}`)
    if (!Number.isNaN(tryParse.getTime())) {
      return tryParse
    }
  }
  if (/\btomorrow\b/i.test(text)) {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
    return d
  }
  const parsed = Date.parse(text)
  if (!Number.isNaN(parsed)) {
    return new Date(parsed)
  }
  return null
}

async function tryCreateAppointmentFromChat(params: {
  lastUserContent: string
  chatMessages: ChatMessage[]
  assistantText: string
  business_id: string
  customer_id: string
  conversation_id: string
}) {
  const { lastUserContent, chatMessages, assistantText, business_id, customer_id, conversation_id } = params

  if (!hasBookingIntent(lastUserContent)) {
    return false
  }

  const allUserText = getUserMessagesCombined(chatMessages)
  const serviceName =
    extractServiceName(lastUserContent) ??
    extractServiceName(allUserText) ??
    extractServiceName(`${lastUserContent}\n${allUserText}`)

  const scheduledAt =
    parseScheduledAt(lastUserContent) ??
    parseScheduledAt(allUserText) ??
    parseScheduledAt(assistantText)

  if (!serviceName || serviceName.length < 2 || !scheduledAt) {
    return false
  }

  const { error } = await supabaseAdmin.from('appointments').insert({
    business_id,
    customer_id,
    conversation_id,
    service_name: serviceName,
    scheduled_at: scheduledAt.toISOString(),
    status: 'pending',
  })

  return !error
}

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

    if (!business_id) {
      const systemPrompt =
        'You are a helpful AI assistant for a service business. Help customers with bookings, questions about services, and general inquiries. Be friendly, professional, and concise.'

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...toOpenAiMessages(chatMessages)],
        max_tokens: 500,
      })

      return NextResponse.json({
        message: response.choices[0].message.content,
      })
    }

    const { data: business, error: bizError } = await supabaseAdmin
      .from('businesses')
      .select('id, name, system_prompt, agent_name')
      .eq('id', business_id)
      .maybeSingle()

    if (bizError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const systemPrompt =
      business.system_prompt ||
      `You are a helpful AI assistant for ${business.name ?? 'this business'}. Help customers with bookings, questions about services, and general inquiries. Be friendly, professional, and concise.`

    const lastUserContent = getLastUserMessageContent(chatMessages)
    if (!lastUserContent?.trim()) {
      return NextResponse.json({ error: 'No user message to save' }, { status: 400 })
    }

    let resolvedConversationId: string
    let resolvedCustomerId: string | null = null

    if (conversation_id) {
      const { data: existing, error: convErr } = await supabaseAdmin
        .from('conversations')
        .select('id, customer_id, business_id')
        .eq('id', conversation_id)
        .eq('business_id', business_id)
        .maybeSingle()

      if (convErr || !existing) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }

      resolvedConversationId = existing.id
      resolvedCustomerId = existing.customer_id ?? null
    } else {
      const { data: newConv, error: convInsErr } = await supabaseAdmin
        .from('conversations')
        .insert({
          business_id,
          customer_id: null,
          customer_name: 'Website visitor',
          status: 'Live',
        })
        .select('id')
        .maybeSingle()

      if (convInsErr || !newConv?.id) {
        return NextResponse.json(
          { error: convInsErr?.message ?? 'Failed to create conversation' },
          { status: 500 }
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
          { status: 500 }
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

    const { error: userMsgErr } = await supabaseAdmin.from('messages').insert({
      conversation_id: resolvedConversationId,
      role: 'user',
      content: lastUserContent.trim(),
    })

    if (userMsgErr) {
      return NextResponse.json({ error: userMsgErr.message }, { status: 500 })
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...toOpenAiMessages(chatMessages)],
      max_tokens: 500,
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

    const bookingCreated = resolvedCustomerId
      ? await tryCreateAppointmentFromChat({
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
