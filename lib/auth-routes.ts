/**
 * One list of what is behind the login, shared by the proxy and the pages it
 * guards, so a new dashboard route cannot end up protected in one place and
 * open in the other.
 */
export const PROTECTED_PREFIXES = ['/dashboard', '/onboarding'] as const

/** Sign-in surfaces: a signed-in visitor gets sent on rather than shown a form. */
export const AUTH_PREFIXES = ['/auth/login', '/auth/signup'] as const

/**
 * Guest-facing and cross-origin routes. The embedded widget and its endpoints
 * are called from restaurant sites by people who will never have a session —
 * an auth round trip on every chat message would only add latency.
 */
export const PUBLIC_PREFIXES = ['/widget', '/api/chat', '/api/widget', '/api/menu'] as const

export const DEFAULT_SIGNED_IN_PATH = '/dashboard'
export const LOGIN_PATH = '/auth/login'

/** Query key carrying "where the guest was headed" through the login page. */
export const NEXT_PARAM = 'next'

function hasPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function isProtectedPath(pathname: string): boolean {
  return hasPrefix(pathname, PROTECTED_PREFIXES)
}

export function isAuthPath(pathname: string): boolean {
  return hasPrefix(pathname, AUTH_PREFIXES)
}

export function isPublicPath(pathname: string): boolean {
  return hasPrefix(pathname, PUBLIC_PREFIXES)
}

/**
 * Only a path on this site may come back out of `?next=`. Anything absolute,
 * protocol-relative (`//evil.com`) or backslash-escaped is an open redirect —
 * a phisher links to our real login, we bounce the freshly signed-in owner to
 * their page. Falls back to the dashboard.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_SIGNED_IN_PATH
  let value = raw.trim()
  if (!value.startsWith('/')) return DEFAULT_SIGNED_IN_PATH
  // Browsers treat backslashes in a URL as slashes: "/\evil.com" leaves the site.
  if (value.replace(/\\/g, '/').startsWith('//')) return DEFAULT_SIGNED_IN_PATH
  // Never bounce back to a sign-in page — that is a loop, not a destination.
  const pathOnly = value.split(/[?#]/)[0]
  if (isAuthPath(pathOnly)) return DEFAULT_SIGNED_IN_PATH
  if (value === '/') value = DEFAULT_SIGNED_IN_PATH
  return value
}

/** The URL to send a signed-out visitor to, remembering where they were. */
export function loginPathFor(pathname: string, search: string): string {
  const target = `${pathname}${search}`
  if (target === DEFAULT_SIGNED_IN_PATH) return LOGIN_PATH
  return `${LOGIN_PATH}?${NEXT_PARAM}=${encodeURIComponent(target)}`
}
