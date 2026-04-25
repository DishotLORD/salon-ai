import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase-server'

import { DashboardClient } from './dashboard-client'

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
    .select('id, name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!business) {
    redirect('/onboarding')
  }

  const businessId = business.id
  const businessDisplayName = business.name?.trim() || 'your business'

  const [{ count: activeChatsCount, error: conversationsCountError }, { data: conversationIdRows, error: conversationIdsError }] =
    await Promise.all([
      supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
      supabase.from('conversations').select('id').eq('business_id', businessId),
    ])
  const activeChats = conversationsCountError ? 0 : (activeChatsCount ?? 0)

  const conversationIds =
    !conversationIdsError && conversationIdRows ? conversationIdRows.map((row) => row.id) : []

  let messageCount = 0
  const idChunkSize = 200
  const idChunks: string[][] = []
  for (let i = 0; i < conversationIds.length; i += idChunkSize) {
    idChunks.push(conversationIds.slice(i, i + idChunkSize))
  }
  if (idChunks.length > 0) {
    const messageCountResults = await Promise.all(
      idChunks.map((chunk) => supabase.from('messages').select('*', { count: 'exact', head: true }).in('conversation_id', chunk))
    )
    messageCount = messageCountResults.reduce((sum, result) => sum + (result.count ?? 0), 0)
  }

  return (
    <DashboardClient
      businessDisplayName={businessDisplayName}
      userEmail={user.email ?? 'User'}
      activeChats={activeChats}
      messageCount={messageCount}
    />
  )
}
