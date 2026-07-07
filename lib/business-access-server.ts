import type { SupabaseClient } from '@supabase/supabase-js'

import type { BusinessRole } from '@/lib/business-access'

export type ServerBusinessAccess = {
  businessId: string
  role: BusinessRole
}

/**
 * Server-side variant of resolveBusinessAccess: owner via businesses.user_id,
 * staff via an active business_members row (tolerates the table not existing
 * before migration 014).
 */
export async function resolveBusinessAccessServer(
  supabase: SupabaseClient,
  userId: string,
): Promise<ServerBusinessAccess | null> {
  const { data: owned } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (owned?.id) return { businessId: String(owned.id), role: 'owner' }

  const { data: membership, error } = await supabase
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !membership?.business_id) return null

  const role: BusinessRole =
    membership.role === 'owner' || membership.role === 'manager' ? membership.role : 'host'
  return { businessId: String(membership.business_id), role }
}
