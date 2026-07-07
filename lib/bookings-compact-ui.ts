import type { CSSProperties } from 'react'

/** Compact density tokens for the Bookings dashboard. Colors resolve through
 * the --bk-* variables in globals.css, which follow <html data-theme>. */

export const bk = {
  radius: 12,
  radiusSm: 8,
  border: '1px solid var(--bk-border)',
  shadow: 'var(--bk-shadow)',
  font: 'var(--font-plus-jakarta), system-ui, sans-serif',
  gap: 10,
  gapMd: 12,
  pagePad: '24px 24px 32px',
  pagePadMobile: '16px 14px 32px',
  h1: 22,
  h1Mobile: 24,
  title: 13,
  body: 12,
  caption: 11,
  micro: 10,
  statValue: 24,
  cardPad: '12px 14px',
  controlH: 32,
  /** Month grid — ~6 rows, slightly tall cells */
  calCellMinH: 68,
  calRowGap: 1,
} as const

export const bkCard: CSSProperties = {
  background: 'var(--bk-card)',
  borderRadius: bk.radius,
  border: bk.border,
  boxShadow: bk.shadow,
  fontFamily: bk.font,
}
