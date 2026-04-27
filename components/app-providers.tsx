'use client'

import type { ReactNode } from 'react'

import { CustomCursor } from '@/components/custom-cursor'
import { LenisProvider } from '@/components/lenis-provider'
import { PageTransition } from '@/components/page-transition'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LenisProvider>
      <CustomCursor />
      <PageTransition>{children}</PageTransition>
    </LenisProvider>
  )
}
