import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseWidgetLauncherColor } from '@/lib/widget-theme'

// Public, read-only branding for the guest-facing embed (nudge copy + FAB color).
// widget.js runs on the restaurant's own domain, so the response is CORS-open.

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

  const themed = await supabaseAdmin
    .from('businesses')
    .select('name, agent_name, widget_launcher_color')
    .eq('id', id)
    .maybeSingle()

  let data = themed.data as {
    name?: unknown
    agent_name?: unknown
    widget_launcher_color?: unknown
  } | null
  let error = themed.error

  if (error?.message.toLowerCase().includes('widget_launcher_color')) {
    const fallback = await supabaseAdmin
      .from('businesses')
      .select('name, agent_name')
      .eq('id', id)
      .maybeSingle()
    data = fallback.data as { name?: unknown; agent_name?: unknown } | null
    error = fallback.error
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS })
  }

  const name = typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : null
  const agentName =
    typeof data?.agent_name === 'string' && data.agent_name.trim() ? data.agent_name.trim() : null
  const launcherColor = parseWidgetLauncherColor(data?.widget_launcher_color)

  return NextResponse.json(
    { name, agentName, launcherColor },
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    },
  )
}
