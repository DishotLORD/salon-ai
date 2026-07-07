import { createClient } from '@/lib/supabase-server'

/**
 * True when the signed-in user may administer this business:
 * the owner (businesses.user_id) or an active owner/manager member.
 */
export async function verifyBusinessOwner(businessId: string): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (data?.id) return true

  // Managers may administer too (tolerates business_members not existing yet).
  const { data: member, error } = await supabase
    .from('business_members')
    .select('id')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('role', ['owner', 'manager'])
    .maybeSingle()
  if (error) return false
  return Boolean(member?.id)
}
