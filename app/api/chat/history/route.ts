import { NextResponse } from 'next/server'

import { checkGuestSession } from '@/lib/guest-session'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * The guest widget's transcript, served with the session token checked.
 *
 * The widget used to read `public.messages` straight from the browser with the
 * anon key, which needed an RLS policy letting anonymous callers select
 * messages. Migration 021 dropped that policy — it was one of seven that between
 * them exposed every restaurant's guests, and the live database also let anon
 * enumerate `conversations`, so the ids it filtered on were not secret either.
 *
 * The read moved here instead. It runs with the service role, and the guest
 * proves nothing about who they are — only that they hold the token minted when
 * this conversation started (migration 022). That is the right authority for
 * this data: the transcript of the session you are sitting in.
 *
 * POST rather than GET on purpose. A token in a query string ends up in server
 * logs, `Referer` headers and browser history; in a JSON body it does not. For
 * the same reason nothing here is cached.
 */

/** Generous — a widget polls this — but bounded, since each call is a DB read. */
const HISTORY_RATE_LIMIT = 120
const HISTORY_RATE_WINDOW_MS = 60_000

/** Matches the widget's own cap; a chat longer than this is trimmed from the top. */
const MAX_MESSAGES = 200

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const limit = await checkRateLimit(`chat-history:${ip}`, HISTORY_RATE_LIMIT, HISTORY_RATE_WINDOW_MS)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec ?? 60) } },
    )
  }

  let body: { business_id?: unknown; conversation_id?: unknown; guest_token?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const businessId = typeof body.business_id === 'string' ? body.business_id.trim() : ''
  const conversationId =
    typeof body.conversation_id === 'string' ? body.conversation_id.trim() : ''
  const guestToken = typeof body.guest_token === 'string' ? body.guest_token.trim() : ''

  if (!businessId || !conversationId || !guestToken) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  const { data: conversation } = await supabaseAdmin
    .from('conversations')
    .select('id, guest_access_token_hash, guest_access_expires_at')
    .eq('id', conversationId)
    // Scoping by business as well as id means a token from one restaurant's
    // widget cannot be pointed at another's conversation.
    .eq('business_id', businessId)
    .maybeSingle()

  const session = checkGuestSession(conversation, guestToken)
  if (!session.ok) {
    /*
     * One status and one shape for every failure. Distinguishing "no such
     * conversation" from "wrong token" would turn this into an oracle for
     * probing which conversation ids exist. `reason` is safe to return: the
     * caller already knows whether they hold a token, and the widget uses it to
     * decide between "start fresh" and "your session expired".
     */
    return NextResponse.json(
      { error: 'unauthorized', reason: session.reason },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const { data: rows, error } = await supabaseAdmin
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(MAX_MESSAGES)

  if (error) {
    console.error('[chat-history] Failed to load messages:', error.message)
    return NextResponse.json({ error: 'load_failed' }, { status: 500 })
  }

  // Only the roles the widget renders. A stored 'system' row would be internal
  // instruction text and has no business being shown to a guest.
  const messages = (rows ?? [])
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .map((r) => ({
      id: String(r.id),
      role: r.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: typeof r.content === 'string' ? r.content : '',
      created_at: String(r.created_at ?? ''),
    }))

  return NextResponse.json(
    { messages },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
