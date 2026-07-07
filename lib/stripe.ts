import Stripe from 'stripe'

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

/** Absolute base URL for redirect targets (payment success/cancel pages). */
export function appBaseUrl(request?: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim()
  if (env) return env.replace(/\/$/, '')
  if (request) {
    const origin = new URL(request.url).origin
    if (origin) return origin
  }
  return 'http://localhost:3000'
}
