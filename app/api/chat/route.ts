import OpenAI from 'openai'
import { NextResponse } from 'next/server'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: Request) {
  const { messages, businessInfo } = await request.json()

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a helpful AI assistant for ${businessInfo?.name || 'a salon'}. 
        Help customers with bookings, questions about services, and general inquiries.
        Be friendly, professional, and concise.
        If customer wants to book — ask for their preferred date, time, and service.`
      },
      ...messages
    ],
    max_tokens: 500,
  })

  return NextResponse.json({
    message: response.choices[0].message.content
  })
}