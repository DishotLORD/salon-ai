/**
 * One answer to "where does this app live?", used by everything that has to
 * write an absolute URL: Stripe redirect targets, the dashboard links inside
 * owner emails, the canonical/OG tags, robots and the sitemap.
 *
 * It used to be Stripe's business alone, and it fell back to localhost — so a
 * deploy that forgot NEXT_PUBLIC_APP_URL mailed the owner a deposit link
 * pointing at their own machine, and dropped the "open the dashboard" button
 * from notification emails entirely. Vercel already tells us the domain; ask it
 * before giving up.
 */

function withProtocol(host: string): string {
  const trimmed = host.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  // localhost has no certificate; every real host on Vercel does.
  const scheme = trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1') ? 'http' : 'https'
  return `${scheme}://${trimmed}`
}

/**
 * Absolute origin, no trailing slash. Pass the incoming request when one is at
 * hand — it is the most accurate source on a custom domain we were never told
 * about.
 */
export function siteUrl(request?: Request): string {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return withProtocol(explicit)

  // On Vercel: the stable production domain in production, the per-deploy URL
  // on a preview — a preview build must not send guests to the live site.
  const vercelEnv = process.env.VERCEL_ENV
  const productionHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercelEnv === 'production' && productionHost) return withProtocol(productionHost)

  const deploymentHost =
    process.env.VERCEL_URL?.trim() || process.env.NEXT_PUBLIC_VERCEL_URL?.trim()
  if (deploymentHost) return withProtocol(deploymentHost)

  if (productionHost) return withProtocol(productionHost)

  if (request) {
    try {
      const { origin } = new URL(request.url)
      if (origin) return origin
    } catch {
      /* fall through to localhost */
    }
  }

  return 'http://localhost:3000'
}

/** Absolute URL for a path on this site: `absoluteUrl('/pay/success')`. */
export function absoluteUrl(path: string, request?: Request): string {
  const base = siteUrl(request)
  if (!path) return base
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
