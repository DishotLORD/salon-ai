'use client'

import type { ReactNode } from 'react'

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  )
}
