import type { Transition, Variants } from 'framer-motion'

/** Align with app/globals.css --ocean-duration-* */
export const oceanDurations = {
  fast: 0.12,
  base: 0.15,
  slow: 0.22,
} as const

export const oceanEase = {
  out: [0.22, 1, 0.36, 1] as const,
  spring: [0.34, 1.56, 0.64, 1] as const,
}

export function oceanTransition(
  reducedMotion: boolean | null,
  partial: Transition = {},
): Transition {
  if (reducedMotion) {
    return { duration: 0.01, ...partial }
  }
  return partial
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: oceanDurations.base, ease: oceanEase.out },
  },
}

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: oceanDurations.base, ease: oceanEase.out },
  },
}

export const staggerChildren: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0, delayChildren: 0 },
  },
}

export const drawerOverlay: Variants = {
  closed: { opacity: 0 },
  open: {
    opacity: 1,
    transition: { duration: oceanDurations.fast, ease: oceanEase.out },
  },
}

export const drawerPanelLeft: Variants = {
  closed: { x: '-100%' },
  open: {
    x: 0,
    transition: { duration: oceanDurations.base, ease: oceanEase.out },
  },
}

export const drawerPanelRight: Variants = {
  closed: { x: '100%' },
  open: {
    x: 0,
    transition: { duration: oceanDurations.base, ease: oceanEase.out },
  },
}

export const modalOverlay: Variants = {
  closed: { opacity: 0 },
  open: {
    opacity: 1,
    transition: { duration: oceanDurations.fast },
  },
}

export const modalContent: Variants = {
  closed: { opacity: 0, scale: 0.94, y: 10 },
  open: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: oceanDurations.base, ease: oceanEase.out },
  },
}

/** Tab / step content: pass custom={1|-1} for slide direction */
export const tabContent: Variants = {
  initial: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 14 : -14,
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: oceanDurations.base, ease: oceanEase.out },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -10 : 10,
    transition: { duration: oceanDurations.fast, ease: oceanEase.out },
  }),
}

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: oceanDurations.base, ease: oceanEase.out },
  },
  exit: {
    opacity: 0,
    x: 16,
    transition: { duration: oceanDurations.fast, ease: oceanEase.out },
  },
}

export const iconPop: Variants = {
  rest: { scale: 1, rotate: 0 },
  hover: {
    scale: 1.08,
    rotate: -4,
    transition: { type: 'spring', stiffness: 400, damping: 18 },
  },
  tap: { scale: 0.96 },
}
