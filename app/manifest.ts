import type { MetadataRoute } from 'next'

/**
 * Owners check tonight's covers from a phone between tables, so the dashboard is
 * worth installing to a home screen. `start_url` points at the dashboard rather
 * than the marketing page — someone who installed this already knows what we
 * sell.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OceanCore — AI Concierge',
    short_name: 'OceanCore',
    description:
      'Reservations, guest questions and revenue growth handled automatically by a 24/7 AI concierge.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#050d1a',
    theme_color: '#050d1a',
    categories: ['business', 'productivity', 'food'],
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
      { src: '/apple-icon.png', type: 'image/png', sizes: '180x180', purpose: 'any' },
    ],
  }
}
