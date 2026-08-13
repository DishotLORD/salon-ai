import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  isLiveReadinessRequest,
  widgetMetaCacheControl,
  widgetMetaUrl,
  WIDGET_META_BRANDING_CACHE_CONTROL,
  WIDGET_META_ERROR_CACHE_CONTROL,
  WIDGET_META_LIVE_CACHE_CONTROL,
  WIDGET_META_LIVE_READINESS,
  WIDGET_META_READINESS_PARAM,
} from '../lib/widget-meta-cache.ts'

/**
 * `/api/widget/meta` serves branding to `public/widget.js` (which ignores
 * readiness and benefits from the cache) and the same payload to the iframe
 * panel (which renders `setupIncomplete` and reads it once, at mount). A
 * 60-second edge cache on the panel's copy means a guest can be told the venue
 * is taking reservations for a minute after the owner's last seating area went
 * inactive. These tests pin which request gets which policy.
 */

describe('only the exact opt-in selects live readiness', () => {
  it('the literal value opts in', () => {
    assert.equal(isLiveReadinessRequest('live'), true)
    assert.equal(isLiveReadinessRequest(WIDGET_META_LIVE_READINESS), true)
  })

  it('an absent or empty parameter keeps the cached default', () => {
    assert.equal(isLiveReadinessRequest(null), false)
    assert.equal(isLiveReadinessRequest(undefined), false)
    assert.equal(isLiveReadinessRequest(''), false)
  })

  it('a differently cased value does not opt in', () => {
    // Cheap to support, but then `LIVE` and `live` are two CDN cache entries
    // for one policy, and the mode stops being a single literal to grep for.
    for (const raw of ['LIVE', 'Live', 'lIvE']) {
      assert.equal(isLiveReadinessRequest(raw), false, raw)
    }
  })

  it('a plausible-looking value nobody implemented does not opt in', () => {
    // The failure this guards is a caller "enabling" live mode with a value the
    // server ignores, then reporting stale readiness as a server bug.
    for (const raw of ['1', 'true', 'yes', 'fresh', 'no-store', ' live', 'live ']) {
      assert.equal(isLiveReadinessRequest(raw), false, JSON.stringify(raw))
    }
  })
})

describe('cache policy follows the mode', () => {
  it('the default request keeps the existing 60-second public cache', () => {
    assert.equal(widgetMetaCacheControl(null), 'public, max-age=60, s-maxage=60')
    assert.equal(widgetMetaCacheControl(null), WIDGET_META_BRANDING_CACHE_CONTROL)
  })

  it('the live request is no-store', () => {
    assert.equal(widgetMetaCacheControl('live'), 'no-store, max-age=0')
    assert.equal(widgetMetaCacheControl('live'), WIDGET_META_LIVE_CACHE_CONTROL)
  })

  it('the live policy never revalidates in the background', () => {
    // `stale-while-revalidate` would still hand *this* guest the stale answer
    // and refresh for the next one, which is the whole defect.
    assert.doesNotMatch(WIDGET_META_LIVE_CACHE_CONTROL, /stale-while-revalidate|stale-if-error/)
    assert.match(WIDGET_META_LIVE_CACHE_CONTROL, /no-store/)
  })

  it('an unknown value falls back to the cache rather than disabling it', () => {
    // A typo must not turn a venue's busiest public request uncacheable.
    for (const raw of [null, undefined, '', 'LIVE', 'true', '1', 'stale']) {
      assert.equal(widgetMetaCacheControl(raw), WIDGET_META_BRANDING_CACHE_CONTROL, String(raw))
    }
  })

  it('errors are not cached at all', () => {
    assert.match(WIDGET_META_ERROR_CACHE_CONTROL, /no-store/)
    assert.doesNotMatch(WIDGET_META_ERROR_CACHE_CONTROL, /max-age=[1-9]/)
  })
})

describe('the two callers build different URLs', () => {
  const ID = 'a1b2c3d4-0000-0000-0000-00000000beef'

  it('the default URL is unchanged from before the live mode existed', () => {
    assert.equal(widgetMetaUrl(ID), `/api/widget/meta?id=${ID}`)
  })

  it('the live URL carries the opt-in the server matches on', () => {
    assert.equal(
      widgetMetaUrl(ID, { live: true }),
      `/api/widget/meta?id=${ID}&${WIDGET_META_READINESS_PARAM}=${WIDGET_META_LIVE_READINESS}`,
    )
  })

  it('the query string differs, so the CDN cannot share one entry', () => {
    assert.notEqual(widgetMetaUrl(ID), widgetMetaUrl(ID, { live: true }))
  })

  it('the server reads back exactly what the live URL sends', () => {
    // Round-trip, so a rename on either side fails here rather than silently
    // dropping the panel back onto the cached response.
    const url = new URL(widgetMetaUrl(ID, { live: true }), 'https://example.test')
    assert.equal(isLiveReadinessRequest(url.searchParams.get(WIDGET_META_READINESS_PARAM)), true)
    const cached = new URL(widgetMetaUrl(ID), 'https://example.test')
    assert.equal(isLiveReadinessRequest(cached.searchParams.get(WIDGET_META_READINESS_PARAM)), false)
  })

  it('a cross-origin caller can prefix its origin', () => {
    assert.equal(
      widgetMetaUrl(ID, { origin: 'https://oceancore.example' }),
      `https://oceancore.example/api/widget/meta?id=${ID}`,
    )
  })

  it('the business id is encoded', () => {
    assert.match(widgetMetaUrl('a b&c=d'), /id=a%20b%26c%3Dd/)
  })
})

describe('the deployed callers are wired to the right mode', () => {
  const panel = readFileSync(new URL('../app/widget/page.tsx', import.meta.url), 'utf8')
  const embed = readFileSync(new URL('../public/widget.js', import.meta.url), 'utf8')
  const route = readFileSync(
    new URL('../app/api/widget/meta/route.ts', import.meta.url),
    'utf8',
  )

  it('the iframe panel requests live readiness', () => {
    assert.match(panel, /widgetMetaUrl\(businessId,\s*\{\s*live:\s*true\s*\}\)/)
  })

  it('the iframe panel bypasses the browser cache too', () => {
    assert.match(panel, /cache:\s*'no-store'/)
  })

  it('the iframe panel no longer builds the metadata URL by hand', () => {
    assert.doesNotMatch(panel, /`\/api\/widget\/meta\?id=\$\{/)
  })

  it('widget.js stays on the cached branding request', () => {
    assert.match(embed, /'\/api\/widget\/meta\?id=' \+ encodeURIComponent\(businessId\)/)
    assert.doesNotMatch(embed, /readiness/)
  })

  it('the route picks its policy through the helper, not a literal', () => {
    assert.match(route, /widgetMetaCacheControl\(searchParams\.get\(WIDGET_META_READINESS_PARAM\)\)/)
    assert.doesNotMatch(route, /'Cache-Control':\s*'public, max-age=60/)
  })

  it('the route still answers OPTIONS with CORS and no body', () => {
    assert.match(route, /export function OPTIONS\(\)/)
    assert.match(route, /status:\s*204,\s*headers:\s*CORS_HEADERS/)
  })

  it('every response still carries the CORS headers', () => {
    // Three JSON responses (400, 500, 200); each must spread CORS_HEADERS.
    const responses = route.match(/NextResponse\.json\(/g) ?? []
    const cors = route.match(/\.\.\.CORS_HEADERS/g) ?? []
    assert.equal(responses.length, 3)
    assert.equal(cors.length, 3)
  })

  it('the response body still carries the readiness contract', () => {
    assert.match(route, /bookingReady: readiness\.bookingReady/)
    assert.match(route, /setupIncomplete: !readiness\.bookingReady/)
    for (const field of ['name', 'agentName', 'theme', 'launcherColor', 'timezone']) {
      assert.match(route, new RegExp(`\\b${field}[,:]`), field)
    }
  })

  it('readiness is still computed by the untouched loader', () => {
    assert.match(route, /loadBusinessReadiness\(supabaseAdmin, id\)/)
  })
})
