import type { Metadata } from 'next'
import type { ReactNode } from 'react'

/**
 * The sign-in surfaces are client components, and a client component cannot
 * export metadata — so the whole tree gets its robots directive from here.
 * robots.txt asks crawlers not to walk /auth; this tells the ones that ignore
 * robots.txt not to index what they find, which is the part that matters for a
 * password-reset URL carrying a token.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children
}
