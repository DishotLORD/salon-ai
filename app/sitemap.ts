import type { MetadataRoute } from 'next'

import { siteUrl } from '@/lib/site-url'

/**
 * Only the pages a stranger can actually open. The landing page's sections are
 * anchors on `/`, not URLs, so listing them would just point a crawler at the
 * same document five times.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const lastModified = new Date()

  return [
    { url: base, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/auth/signup`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/auth/login`, lastModified, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
