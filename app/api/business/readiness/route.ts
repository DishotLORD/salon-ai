import { NextResponse } from 'next/server'

import { loadBusinessReadiness } from '@/lib/business-readiness'
import { createClient } from '@/lib/supabase-server'
import { verifyBusinessOwner } from '@/lib/verify-business-owner'

/** Owner-only readiness snapshot for Settings / Integrations. */
export async function GET(request: Request) {
  const businessId = new URL(request.url).searchParams.get('business_id')?.trim()
  if (!businessId) {
    return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
  }

  const allowed = await verifyBusinessOwner(businessId)
  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const readiness = await loadBusinessReadiness(supabase, businessId)
  return NextResponse.json(readiness)
}
