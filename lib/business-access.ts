import { supabase } from '@/lib/supabase'

export type BusinessRole = 'owner' | 'manager' | 'host'

export type BusinessAccess = {
  businessId: string
  role: BusinessRole
}

export const BUSINESS_MEMBERS_MIGRATION_HINT =
  'To enable team access, run supabase/migrations/014_business_members.sql in Supabase Dashboard → SQL Editor, then reload this page.'

export function isBusinessMembersSchemaError(message: string | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return lower.includes('business_members') || lower.includes('claim_business_invites')
}

/**
 * Resolve which business the signed-in user works in and their role.
 * Owners resolve through businesses.user_id (works before migration 014);
 * staff resolve through an active business_members row. Pending email invites
 * are claimed first, so a freshly invited staff member gets access on first load.
 */
export async function resolveBusinessAccess(): Promise<BusinessAccess | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Claim invites addressed to this email (no-op before migration 014).
  try {
    await supabase.rpc('claim_business_invites')
  } catch {
    /* ignore — function may not exist yet */
  }

  const { data: owned } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (owned?.id) return { businessId: owned.id, role: 'owner' }

  const { data: membership, error } = await supabase
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !membership?.business_id) return null

  const role: BusinessRole =
    membership.role === 'owner' || membership.role === 'manager' ? membership.role : 'host'
  return { businessId: String(membership.business_id), role }
}
