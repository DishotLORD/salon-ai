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

export const settingsNavPillSpring = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 28,
}

export const settingsNavStagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.08 },
  },
}

export const settingsNavItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 400, damping: 32 },
  },
}

/** Settings right panel: pass custom={1|-1} from category index delta */
/** Bookings month grid — stagger day cells on month change */
export const calendarDayStagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.018, delayChildren: 0.04 },
  },
}

export const calendarDayCell: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.92 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 420, damping: 28 },
  },
}

/** Month title + grid slide — custom: 1 | -1 */
export const calendarMonthSlide: Variants = {
  initial: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 18 : -18 }),
  animate: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', stiffness: 380, damping: 32 },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir >= 0 ? -14 : 14,
    transition: { duration: oceanDurations.fast, ease: oceanEase.out },
  }),
}

export const settingsPanelHeavy: Variants = {
  initial: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 28 : -28,
    scale: 0.98,
  }),
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: settingsNavPillSpring,
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -24 : 24,
    scale: 0.99,
    transition: { type: 'spring', stiffness: 400, damping: 35 },
  }),
}
