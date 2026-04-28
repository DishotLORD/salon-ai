'use client'

import type { ReactNode } from 'react'

import { LenisProvider } from '@/components/lenis-provider'
import { PageTransition } from '@/components/page-transition'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LenisProvider>
      <PageTransition>{children}</PageTransition>
    </LenisProvider>
  )
}
