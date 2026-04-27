import Lenis from '@studio-freight/lenis'

let lenisInstance: Lenis | null = null

/**
 * Singleton Lenis instance for smooth scrolling site-wide.
 * Created by LenisProvider; do not construct Lenis elsewhere.
 */
export function getLenis(): Lenis | null {
  return lenisInstance
}

export function createLenis(): Lenis | null {
  if (typeof window === 'undefined') {
    return null
  }
  if (lenisInstance) {
    return lenisInstance
  }
  lenisInstance = new Lenis({
    duration: 1.1,
    smoothWheel: true,
    wheelMultiplier: 0.88,
    touchMultiplier: 1.75,
  })
  return lenisInstance
}

export function destroyLenis(): void {
  lenisInstance?.destroy()
  lenisInstance = null
}
