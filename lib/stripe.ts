import Stripe from 'stripe'

import { siteUrl } from '@/lib/site-url'

let cached: Stripe | null = null

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim())
}

/** Lazily constructed Stripe client; null when STRIPE_SECRET_KEY is not set. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) return null
  if (!cached) cached = new Stripe(key)
  return cached
}

/**
 * Absolute base URL for redirect targets (payment success/cancel pages).
 * Kept as a name of its own because payment code reads better for it; the
 * resolution itself lives in one place now.
 */
export function appBaseUrl(request?: Request): string {
  return siteUrl(request)
}
