import type { MetadataRoute } from 'next'

import { siteUrl } from '@/lib/site-url'

/**
 * Crawlers get the marketing pages and nothing else. The dashboard is behind a
 * login anyway, but a crawler that keeps requesting it just burns our function
 * budget on redirects — and an indexed `/widget?business_id=…` would put a
 * restaurant's chat panel in search results with no page around it.
 *
 * Preview deployments say "go away" outright: two hostnames serving the same
 * copy is duplicate content, and the copy on a preview is unfinished.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()
  const isPreview = process.env.VERCEL_ENV === 'preview'

  if (isPreview) {
    return { rules: { userAgent: '*', disallow: '/' } }
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/onboarding', '/auth', '/api/', '/widget', '/pay'],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
