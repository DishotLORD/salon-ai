import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessOwner } from '@/lib/verify-business-owner'

// Verify the session user may administer the given business_id (owner or
// manager). Returns true on success, or a NextResponse error to return.
async function verifyOwner(business_id: unknown): Promise<true | NextResponse> {
  if (typeof business_id !== 'string' || !business_id) {
    return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  }
  const allowed = await verifyBusinessOwner(business_id)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return true
}

// ── GET /api/menu?business_id=… ───────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const business_id = searchParams.get('business_id')

  const check = await verifyOwner(business_id)
  if (check instanceof NextResponse) return check

  const { data, error } = await supabaseAdmin
    .from('services')
    .select('id, name, price, description, category, duration_minutes')
    .eq('business_id', business_id!)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

// ── POST /api/menu — create ───────────────────────────────────────────────────
export async function POST(request: Request) {
  const body = (await request.json()) as {
    business_id?: string
    name?: string
    price?: number | null
    description?: string | null
    category?: string | null
  }

  const check = await verifyOwner(body.business_id)
  if (check instanceof NextResponse) return check

  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const payload: Record<string, unknown> = {
    business_id: body.business_id,
    name: body.name.trim(),
    price: typeof body.price === 'number' && !isNaN(body.price) ? body.price : null,
  }
  if (typeof body.description === 'string') payload.description = body.description.trim() || null
  if (typeof body.category === 'string') payload.category = body.category || null

  const { data, error } = await supabaseAdmin
    .from('services')
    .insert(payload)
    .select('id, name, price, description, category, duration_minutes')
    .maybeSingle()

  if (error) {
    // description/category columns may not exist yet — fall back to minimal insert
    if (error.code === 'PGRST204' || error.message.includes('column')) {
      const { data: basic, error: basicErr } = await supabaseAdmin
        .from('services')
        .insert({ business_id: body.business_id, name: payload.name, price: payload.price })
        .select('id, name, price')
        .maybeSingle()
      if (basicErr || !basic) {
        return NextResponse.json({ error: basicErr?.message ?? 'Insert failed' }, { status: 500 })
      }
      return NextResponse.json({ item: { ...basic, description: null, category: null, duration_minutes: null } })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data })
}

// ── PUT /api/menu — update ────────────────────────────────────────────────────
export async function PUT(request: Request) {
  const body = (await request.json()) as {
    id?: string
    business_id?: string
    name?: string
    price?: number | null
    description?: string | null
    category?: string | null
  }

  const check = await verifyOwner(body.business_id)
  if (check instanceof NextResponse) return check

  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const payload: Record<string, unknown> = {
    business_id: body.business_id,
    name: body.name.trim(),
    price: typeof body.price === 'number' && !isNaN(body.price) ? body.price : null,
  }
  if (typeof body.description === 'string') payload.description = body.description.trim() || null
  if (typeof body.category === 'string') payload.category = body.category || null

  const { error } = await supabaseAdmin
    .from('services')
    .update(payload)
    .eq('id', body.id)
    .eq('business_id', body.business_id!)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── DELETE /api/menu — delete ─────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const body = (await request.json()) as { id?: string; business_id?: string }

  const check = await verifyOwner(body.business_id)
  if (check instanceof NextResponse) return check

  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('services')
    .delete()
    .eq('id', body.id)
    .eq('business_id', body.business_id!)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
