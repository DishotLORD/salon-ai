import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessOwner } from '@/lib/verify-business-owner'

/**
 * Every menu version this venue has had, as metadata.
 *
 * What a version *is* — when it was uploaded, whether it went live, which file
 * it came from and how big that file was — and never what it *says*. No menu
 * text, no chunks, no embeddings, no bytes.
 *
 * And no URL of any kind, signed or otherwise. A listing that returns a link is
 * a listing that grants access to every object it mentions, which turns "show
 * me my history" into "download all of it" for anyone who reaches this route.
 * Handing out the file is a separate decision and belongs to a separate
 * endpoint that can make it deliberately.
 *
 * The digest is here because it is what makes the record checkable: an owner
 * disputing a price can confirm the file they still have is the file that
 * produced that version. It is integrity metadata and nothing else — it never
 * authorizes a read.
 */
export async function GET(request: Request) {
  const businessId = new URL(request.url).searchParams.get('business_id')?.trim()
  if (!businessId) {
    return NextResponse.json({ error: 'business_id is required' }, { status: 400 })
  }

  // The same ownership check the rest of Settings uses: owner or active
  // manager, and 401 for a signed-in stranger as much as for no session.
  const allowed = await verifyBusinessOwner(businessId)
  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  /*
   * Scoped by the id that was just verified, never by anything else in the
   * request. The function selects on business_id too, so the tenant boundary
   * holds in the database as well as here.
   */
  const { data, error } = await supabaseAdmin.rpc('menu_document_history', {
    p_business_id: businessId,
  })
  if (error) {
    console.error('[menu-history] query failed:', error.message)
    return NextResponse.json({ error: 'Could not load menu history.' }, { status: 500 })
  }

  return NextResponse.json(
    { versions: data ?? [] },
    // A venue's menu history is private and changes when they upload.
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  )
}
