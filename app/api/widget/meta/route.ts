import { NextResponse } from 'next/server'

import { resolveBusinessTimezone } from '@/lib/business-timezone'
import { loadBusinessReadiness } from '@/lib/business-readiness'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { DEFAULT_WIDGET_THEME, parseWidgetLauncherColor, parseWidgetTheme } from '@/lib/widget-theme'

/**
 * Public, read-only branding for the guest-facing embed.
 *
 * Two callers: widget.js, which runs on the restaurant's own domain and reads
 * the nudge copy and the launcher colour, and the chat panel itself, which also
 * needs the theme. The panel used to read `public.businesses` directly with the
 * anon key; migration 021 removed the policy that allowed it, and that policy
 * had been handing every restaurant's email, phone, address and system prompt to
 * anyone holding the public key. The read belongs on the server, where it can
 * return four fields instead of a whole row.
 *
 * CORS-open because widget.js is loaded cross-origin. That is safe for exactly
 * this payload: a venue's display name, its concierge's name, and two style
 * choices — all of it already visible to anyone who opens the widget.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// ── GET /api/widget/meta?id=… ────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400, headers: CORS_HEADERS })
  }

  type BrandingRow = {
    name?: unknown
    agent_name?: unknown
    widget_theme?: unknown
    widget_launcher_color?: unknown
    timezone?: unknown
  }

  /*
   * Column-tolerant, narrowing on each retry. widget_launcher_color arrives in
   * migration 020 and widget_theme in 017, so a deployment that is behind on
   * migrations still gets its name and concierge back rather than a 500 and an
   * unbranded widget.
   */
  const SELECTS = [
    'name, agent_name, widget_theme, widget_launcher_color, timezone',
    'name, agent_name, widget_theme, widget_launcher_color',
    'name, agent_name, widget_theme',
    'name, agent_name',
  ] as const

  let data: BrandingRow | null = null
  let error: { message: string } | null = null

  for (const select of SELECTS) {
    const result = await supabaseAdmin
      .from('businesses')
      .select(select)
      .eq('id', id)
      .maybeSingle()
    data = result.data as BrandingRow | null
    error = result.error
    if (!error) break
    // Only a missing column is worth retrying with fewer of them.
    if (!/column|widget_theme|widget_launcher_color/i.test(error.message)) break
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
  }

  const name = typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : null
  const agentName =
    typeof data?.agent_name === 'string' && data.agent_name.trim() ? data.agent_name.trim() : null
  // Always a valid theme: parseWidgetTheme falls back to the default, so the
  // panel never has to decide what an unknown value means.
  const theme = data ? parseWidgetTheme(data.widget_theme) : DEFAULT_WIDGET_THEME
  const launcherColor = parseWidgetLauncherColor(data?.widget_launcher_color)
  const timezone = resolveBusinessTimezone(
    typeof data?.timezone === 'string' ? data.timezone : null,
  )
  const readiness = await loadBusinessReadiness(supabaseAdmin, id)

  return NextResponse.json(
    {
      name,
      agentName,
      theme,
      launcherColor,
      timezone,
      bookingReady: readiness.bookingReady,
      setupIncomplete: !readiness.bookingReady,
    },
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    },
  )
}
