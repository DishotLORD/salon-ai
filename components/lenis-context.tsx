'use client'

import { createContext, useContext } from 'react'

/** Incremented once Lenis is running (or immediately, if reduced motion means it never will be). */
export const LenisReadyContext = createContext(0)

export function useLenisReady(): number {
  return useContext(LenisReadyContext)
}
