import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: Request) {
  const { messages, business_id } = await request.json()

  const supabase = await createClient()

  let systemPrompt = 'You are a helpful AI assistant for a service business. Help customers with bookings, questions about services, and general inquiries. Be friendly, professional, and concise.'
  let businessName = 'this business'

  if (business_id) {
    const { data: business } = await supabase
      .from('businesses')
      .select('name, system_prompt, agent_name')
      .eq('id', business_id)
      .single()

    if (business) {
      businessName = business.name
      systemPrompt = business.system_prompt || `You are a helpful AI assistant for ${business.name}. Help customers with bookings, questions about services, and general inquiries. Be friendly, professional, and concise.`
    }
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    max_tokens: 500,
  })

  return NextResponse.json({
    message: response.choices[0].message.content
  })
}