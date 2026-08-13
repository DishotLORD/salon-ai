/**
 * Cache policy for `/api/widget/meta`, which serves two callers with opposite
 * freshness needs from one payload.
 *
 * `public/widget.js` runs on the restaurant's own page and reads branding only —
 * the concierge's name and the launcher colour. A minute of staleness there is
 * invisible, and the short public cache is worth keeping: that request fires on
 * every page view the venue gets.
 *
 * The iframe panel (`app/widget/page.tsx`) reads the same response but also
 * takes `bookingReady`/`setupIncomplete` from it, and it reads them once, at
 * mount. Served from a 60-second edge cache, a guest who opens the widget just
 * after the owner deactivates their last seating area is told the venue is
 * taking reservations when it is not — and nothing re-fetches to correct it.
 * The booking backend does gate correctly (it re-reads readiness per request and
 * refuses the tool call), so this is a state-consistency defect in what the
 * guest is shown, not a way to slip a booking through.
 *
 * Rather than give up the branding cache for every visitor, the freshness-
 * critical caller opts in with `?readiness=live` and gets `no-store`. The query
 * string is part of the CDN cache key, so the two modes cannot share an entry.
 *
 * Opting in is deliberately exact: only the literal `live` selects the uncached
 * policy. `LIVE`, `true`, `1` and an empty value all fall back to the cached
 * default, so a typo in a caller cannot quietly turn a venue's busiest public
 * request into an uncacheable one.
 */

export const WIDGET_META_READINESS_PARAM = 'readiness'

/** The only value that selects live readiness. Matched exactly. */
export const WIDGET_META_LIVE_READINESS = 'live'

/** Branding default — unchanged from before the live mode existed. */
export const WIDGET_META_BRANDING_CACHE_CONTROL = 'public, max-age=60, s-maxage=60'

/**
 * Live readiness. No `stale-while-revalidate`: revalidating in the background
 * is exactly the window this fixes — it would still hand the current guest the
 * stale answer.
 */
export const WIDGET_META_LIVE_CACHE_CONTROL = 'no-store, max-age=0'

/** Errors are never worth caching, and a cached 500 outlives its cause. */
export const WIDGET_META_ERROR_CACHE_CONTROL = 'no-store, max-age=0'

/**
 * Does this request opt into live readiness? Anything other than the exact
 * literal — absent, empty, differently cased, or a value someone assumed would
 * work — keeps the cached branding policy.
 */
export function isLiveReadinessRequest(rawParam: string | null | undefined): boolean {
  return rawParam === WIDGET_META_LIVE_READINESS
}

/** Cache-Control for a successful metadata response. */
export function widgetMetaCacheControl(rawParam: string | null | undefined): string {
  return isLiveReadinessRequest(rawParam)
    ? WIDGET_META_LIVE_CACHE_CONTROL
    : WIDGET_META_BRANDING_CACHE_CONTROL
}

/**
 * The metadata URL a caller should request. `live: true` is for the iframe
 * panel, which renders the setup state; `public/widget.js` stays on the default.
 */
export function widgetMetaUrl(
  businessId: string,
  { live = false, origin = '' }: { live?: boolean; origin?: string } = {},
): string {
  const base = `${origin}/api/widget/meta?id=${encodeURIComponent(businessId)}`
  return live
    ? `${base}&${WIDGET_META_READINESS_PARAM}=${WIDGET_META_LIVE_READINESS}`
    : base
}
