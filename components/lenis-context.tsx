'use client'

import { createContext, useContext } from 'react'

/** Incremented after Lenis + ScrollTrigger proxy are ready (or immediately if reduced motion). */
export const LenisReadyContext = createContext(0)

export function useLenisReady(): number {
  return useContext(LenisReadyContext)
}
