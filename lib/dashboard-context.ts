import { cache } from 'react'

import { resolveBusinessAccessServer, type ServerBusinessAccess } from '@/lib/business-access-server'
import { createClient } from '@/lib/supabase-server'

/**
 * Session + business access for the dashboard tree, resolved once per request.
 *
 * The layout and the page both need the user and their business, and both used
 * to fetch them independently: two `auth.getUser()` calls (each a round trip to
 * Supabase Auth) plus two `businesses` lookups before the first byte of the
 * dashboard. React's `cache` keys on the arguments — none here — so every
 * caller inside one render shares a single result.
 */
export const getDashboardContext = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { supabase, user: null, access: null as ServerBusinessAccess | null }
  }

  const access = await resolveBusinessAccessServer(supabase, user.id)
  return { supabase, user, access }
})
