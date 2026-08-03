import { redirect } from 'next/navigation'

import { isTimezoneSchemaError, resolveBusinessTimezone } from '@/lib/business-timezone'
import {
  addDaysToDateKey,
  getVenueNowParts,
  venueBoundaryUtcIso,
  wallClockDateKey,
} from '@/lib/booking-wall-clock'
import { getDashboardContext } from '@/lib/dashboard-context'

import { DashboardClient, type RecentActivity, type ZoneOccupancy } from './dashboard-client'

const ACTIVITY_LIMIT = 4
/** Enough of today's traffic for a stable median without reading a whole service. */
const RESPONSE_SAMPLE_LIMIT = 500

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

  let business: Record<string, unknown> | null = null
  {
    const withTz = await supabase
      .from('businesses')
      .select('id, name, agent_name, operating_hours, menu_pdf_text, timezone')
      .eq('id', businessId)
      .maybeSingle()
    if (withTz.error && isTimezoneSchemaError(withTz.error.message)) {
      const fallback = await supabase
        .from('businesses')
        .select('id, name, agent_name, operating_hours, menu_pdf_text')
        .eq('id', businessId)
        .maybeSingle()
      business = (fallback.data as Record<string, unknown> | null) ?? null
    } else {
      business = (withTz.data as Record<string, unknown> | null) ?? null
    }
  }

  if (!business) {
    redirect('/onboarding')
  }

  const timeZone = resolveBusinessTimezone(
    typeof business.timezone === 'string' ? business.timezone : null,
  )

  // Venue calendar day windows — never server-local setHours / browser TZ.
  const nowParts = getVenueNowParts(timeZone)
  const todayKey = wallClockDateKey(nowParts)
  const yesterdayKey = addDaysToDateKey(todayKey, -1)
  const todayStartISO = venueBoundaryUtcIso(`${todayKey}T00:00:00`, timeZone)
  const todayEndISO = venueBoundaryUtcIso(`${todayKey}T23:59:59`, timeZone)
  const yesterdayStartISO = venueBoundaryUtcIso(`${yesterdayKey}T00:00:00`, timeZone)
  // Same clock time yesterday in the venue (for half-day comparisons).
  const yesterdaySameTimeISO = venueBoundaryUtcIso(
    `${yesterdayKey}T${String(nowParts.hour).padStart(2, '0')}:${String(nowParts.minute).padStart(2, '0')}:00`,
    timeZone,
  )

  // None of these depend on each other, so they go out together: run as a
  // waterfall they cost the sum of five round trips before the page can paint.
  const [
    { count: activeChatsCount, error: conversationsCountError },
    { data: conversationRows, error: conversationIdsError },
    { data: zonesData },
    { data: todayAppts },
  ] = await Promise.all([
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

  const businessDisplayName =
    typeof business.name === 'string' && business.name.trim()
      ? business.name.trim()
      : 'your restaurant'
  const conciergeName =
    typeof business.agent_name === 'string' && business.agent_name.trim()
      ? business.agent_name.trim()
      : 'AI Concierge'

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
  const [chunkCounts, latestRes, yesterdayCounts, todayMessagesRes] = await Promise.all([
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
    Promise.all(
      idChunks.map((chunk) =>
        supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', chunk)
          .gte('created_at', yesterdayStartISO)
          .lt('created_at', yesterdaySameTimeISO),
      ),
    ),
    // Capped: a busy Saturday can run to thousands of messages, and the median
    // is stable long before that. Oldest-first so the pairing below reads in order.
    conversationIds.length > 0
      ? supabase
          .from('messages')
          .select('role, created_at, conversation_id')
          .in('conversation_id', conversationIds)
          .gte('created_at', todayStartISO)
          .order('created_at', { ascending: true })
          .limit(RESPONSE_SAMPLE_LIMIT)
      : null,
  ])

  const messageCount = chunkCounts.reduce((sum, { count }) => sum + (count ?? 0), 0)
  const messageCountYesterday = yesterdayCounts.reduce((sum, { count }) => sum + (count ?? 0), 0)

  /*
   * How long a guest waits for the concierge, today. Measured as the gap from a
   * guest message to the next assistant message in the same conversation, and
   * reported as the median — one stalled thread should not move the number the
   * way a mean would.
   */
  const responseGaps: number[] = []
  {
    const awaiting = new Map<string, number>()
    for (const row of todayMessagesRes?.data ?? []) {
      const conversationId = String(row.conversation_id ?? '')
      const at = new Date(String(row.created_at ?? '')).getTime()
      if (!conversationId || !Number.isFinite(at)) continue
      if (row.role === 'assistant') {
        const askedAt = awaiting.get(conversationId)
        if (askedAt !== undefined) {
          responseGaps.push((at - askedAt) / 1000)
          awaiting.delete(conversationId)
        }
      } else if (!awaiting.has(conversationId)) {
        // Only the first of a burst counts: a guest sending three lines in a row
        // is one wait, not three.
        awaiting.set(conversationId, at)
      }
    }
  }
  const medianResponseSeconds =
    responseGaps.length > 0
      ? [...responseGaps].sort((a, b) => a - b)[Math.floor(responseGaps.length / 2)]
      : null

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

  /*
   * What a newly signed-up owner still has to do. Onboarding collects the venue's
   * identity and nothing else, so someone can finish it, land here on an empty
   * dashboard, and never learn that the widget is not on their website yet —
   * which is the one step without which none of this does anything.
   *
   * Every signal is derived from data already fetched above, so the checklist
   * costs no extra round trip and cannot go stale.
   */
  const setupSteps = [
    {
      id: 'widget',
      title: 'Put the concierge on your website',
      description: 'One line of code. Until it is live, no guest can reach it.',
      href: '/dashboard/settings?tab=widget',
      done: conversationsList.length > 0,
    },
    {
      id: 'hours',
      title: 'Set your opening hours',
      description: 'The concierge will not offer a table outside them.',
      href: '/dashboard/settings?category=restaurant',
      done: business.operating_hours != null,
    },
    {
      id: 'menu',
      title: 'Add your menu',
      description: 'So it can answer what is on it, and what is in a dish.',
      href: '/dashboard/settings?tab=menu',
      done:
        typeof business.menu_pdf_text === 'string' && business.menu_pdf_text.trim().length > 0,
    },
    {
      id: 'seating',
      title: 'Describe your seating',
      description: 'Dining areas and how many parties each can hold at once.',
      href: '/dashboard/settings?category=reservations',
      done: zoneOccupancy.length > 0,
    },
  ]

  return (
    <DashboardClient
      businessDisplayName={businessDisplayName}
      conciergeName={conciergeName}
      businessId={businessId}
      activeChats={activeChats}
      messageCount={messageCount}
      messageCountYesterday={messageCountYesterday}
      medianResponseSeconds={medianResponseSeconds}
      recentActivity={recentActivity}
      zoneOccupancy={zoneOccupancy}
      setupSteps={setupSteps}
    />
  )
}
