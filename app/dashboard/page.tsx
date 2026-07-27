import { redirect } from 'next/navigation'

import { getDashboardContext } from '@/lib/dashboard-context'

import { DashboardClient, type RecentActivity, type ZoneOccupancy } from './dashboard-client'

const ACTIVITY_LIMIT = 4

function truncate(value: string, max = 96): string {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

export default async function Dashboard() {
  const { supabase, user, access } = await getDashboardContext()

  if (!user) {
    redirect('/auth/login')
  }

  if (!access) {
    redirect('/onboarding')
  }

  const businessId = access.businessId

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayStartISO = todayStart.toISOString()
  const todayEndISO = new Date(new Date().setHours(23, 59, 59, 999)).toISOString()

  // None of these depend on each other, so they go out together: run as a
  // waterfall they cost the sum of five round trips before the page can paint.
  const [
    { data: business },
    { count: activeChatsCount, error: conversationsCountError },
    { data: conversationRows, error: conversationIdsError },
    { data: zonesData },
    { data: todayAppts },
  ] = await Promise.all([
    supabase.from('businesses').select('id, name, agent_name').eq('id', businessId).maybeSingle(),
    supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .or('status.is.null,status.eq.active,status.eq.human'),
    supabase.from('conversations').select('id, customer_name').eq('business_id', businessId),
    supabase
      .from('dining_zones')
      .select('id, name, max_concurrent_parties, sort_order')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('appointments')
      .select('zone_id, party_size')
      .eq('business_id', businessId)
      .in('status', ['pending', 'confirmed', 'seated'])
      .gte('scheduled_at', todayStartISO)
      .lte('scheduled_at', todayEndISO),
  ])

  if (!business) {
    redirect('/onboarding')
  }

  const businessDisplayName = business.name?.trim() || 'your restaurant'
  const conciergeName = business.agent_name?.trim() || 'AI Concierge'

  const activeChats = conversationsCountError ? 0 : (activeChatsCount ?? 0)

  const conversationsList = !conversationIdsError && conversationRows ? conversationRows : []
  const conversationIds = conversationsList.map((row) => row.id as string)
  const customerByConversation = new Map<string, string>()
  for (const row of conversationsList) {
    if (row.id) {
      const name = typeof row.customer_name === 'string' ? row.customer_name.trim() : ''
      customerByConversation.set(String(row.id), name || 'Guest')
    }
  }

  const recentMessages: { id: string; content: string; role: string; created_at: string; conversation_id: string }[] = []
  const idChunkSize = 200
  const idChunks: string[][] = []
  for (let i = 0; i < conversationIds.length; i += idChunkSize) {
    idChunks.push(conversationIds.slice(i, i + idChunkSize))
  }

  // Today's message count is chunked to keep the `in` filter off the URL length
  // limit; the chunks are independent, so they go out at once rather than one
  // round trip per 200 conversations.
  const [chunkCounts, latestRes] = await Promise.all([
    Promise.all(
      idChunks.map((chunk) =>
        supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', chunk)
          .gte('created_at', todayStartISO),
      ),
    ),
    conversationIds.length > 0
      ? supabase
          .from('messages')
          .select('id, content, role, created_at, conversation_id')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false })
          .limit(ACTIVITY_LIMIT)
      : null,
  ])

  const messageCount = chunkCounts.reduce((sum, { count }) => sum + (count ?? 0), 0)

  {
    const latest = latestRes?.data
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

  // ── Zone occupancy for today (fetched in the opening batch) ───────────────
  const guestsByZone = new Map<string, number>()
  for (const appt of todayAppts ?? []) {
    if (appt.zone_id) {
      guestsByZone.set(String(appt.zone_id), (guestsByZone.get(String(appt.zone_id)) ?? 0) + (appt.party_size ?? 0))
    }
  }

  const zoneOccupancy: ZoneOccupancy[] = (zonesData ?? []).map((z) => ({
    id: String(z.id),
    name: String(z.name),
    capacity: Number(z.max_concurrent_parties) || 0,
    guestsToday: guestsByZone.get(String(z.id)) ?? 0,
  }))

  return (
    <DashboardClient
      businessDisplayName={businessDisplayName}
      conciergeName={conciergeName}
      businessId={businessId}
      activeChats={activeChats}
      messageCount={messageCount}
      recentActivity={recentActivity}
      zoneOccupancy={zoneOccupancy}
    />
  )
}
