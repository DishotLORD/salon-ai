import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase-server'

import { DashboardClient, type RecentActivity } from './dashboard-client'

const ACTIVITY_LIMIT = 4

function truncate(value: string, max = 96): string {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

export default async function Dashboard() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, agent_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!business) {
    redirect('/onboarding')
  }

  const businessId = business.id
  const businessDisplayName = business.name?.trim() || 'your restaurant'
  const conciergeName = business.agent_name?.trim() || 'AI Concierge'

  const { count: activeChatsCount, error: conversationsCountError } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .or('status.is.null,status.eq.active,status.eq.human')

  const activeChats = conversationsCountError ? 0 : (activeChatsCount ?? 0)

  const { data: conversationRows, error: conversationIdsError } = await supabase
    .from('conversations')
    .select('id, customer_name')
    .eq('business_id', businessId)

  const conversationsList = !conversationIdsError && conversationRows ? conversationRows : []
  const conversationIds = conversationsList.map((row) => row.id as string)
  const customerByConversation = new Map<string, string>()
  for (const row of conversationsList) {
    if (row.id) {
      const name = typeof row.customer_name === 'string' ? row.customer_name.trim() : ''
      customerByConversation.set(String(row.id), name || 'Guest')
    }
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayStartISO = todayStart.toISOString()

  let messageCount = 0
  const recentMessages: { id: string; content: string; role: string; created_at: string; conversation_id: string }[] = []
  const idChunkSize = 200
  for (let i = 0; i < conversationIds.length; i += idChunkSize) {
    const chunk = conversationIds.slice(i, i + idChunkSize)
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', chunk)
      .gte('created_at', todayStartISO)
    messageCount += count ?? 0
  }

  if (conversationIds.length > 0) {
    const { data: latest } = await supabase
      .from('messages')
      .select('id, content, role, created_at, conversation_id')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_LIMIT)
    if (latest) {
      for (const row of latest) {
        if (
          row &&
          typeof row.id === 'string' &&
          typeof row.content === 'string' &&
          typeof row.role === 'string' &&
          typeof row.created_at === 'string' &&
          typeof row.conversation_id === 'string'
        ) {
          recentMessages.push({
            id: row.id,
            content: row.content,
            role: row.role,
            created_at: row.created_at,
            conversation_id: row.conversation_id,
          })
        }
      }
    }
  }

  const recentActivity: RecentActivity[] = recentMessages.map((row) => {
    const customer = customerByConversation.get(row.conversation_id) ?? 'Guest'
    const isAssistant = row.role === 'assistant'
    const title = isAssistant
      ? `${conciergeName} replied to ${customer}: ${truncate(row.content)}`
      : `${customer} sent a message: ${truncate(row.content)}`
    return {
      id: row.id,
      title,
      timestamp: row.created_at,
      role: isAssistant ? 'assistant' : 'guest',
    }
  })

  return (
    <DashboardClient
      businessDisplayName={businessDisplayName}
      conciergeName={conciergeName}
      businessId={businessId}
      activeChats={activeChats}
      messageCount={messageCount}
      recentActivity={recentActivity}
    />
  )
}
