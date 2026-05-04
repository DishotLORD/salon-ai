// Shared design tokens for the dashboard light theme.
// Marketing/auth pages have their own dark theme — these tokens apply only inside /dashboard.

export const t = {
  // Surfaces
  bgApp: '#f8fafc',
  bgSurface: '#ffffff',
  bgSurfaceMuted: '#f1f5f9',
  bgSubtle: '#f8fafc',

  // Text
  text: '#0f172a',
  textMuted: '#64748b',
  textSubtle: '#94a3b8',

  // Borders / dividers
  border: '#e2e8f0',
  borderSoft: '#eef2f6',
  borderStrong: '#cbd5e1',

  // Accent (kept ocean blue)
  accent: '#0ea5e9',
  accentHover: '#0284c7',
  accentSoftBg: '#f0f9ff',
  accentSoftBorder: '#bae6fd',
  accentText: '#0369a1',

  // Status
  success: '#16a34a',
  successBg: '#f0fdf4',
  successBorder: '#bbf7d0',
  warning: '#d97706',
  warningBg: '#fffbeb',
  warningBorder: '#fde68a',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',

  // Shadow tokens
  shadowSm: '0 1px 2px rgba(0,0,0,0.04)',
  shadowCard: '0 1px 3px rgba(0,0,0,0.08)',
  shadowMd: '0 4px 12px rgba(0,0,0,0.08)',
  shadowLg: '0 10px 25px rgba(15,23,42,0.08)',

  // Radii
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
} as const

/** Standard white card — replaces the old glass surface. */
export const card = {
  background: t.bgSurface,
  border: `1px solid ${t.border}`,
  borderRadius: t.radiusLg,
  boxShadow: t.shadowCard,
} as const

/** Subtle, less prominent surface (e.g. inset rows / stat tiles). */
export const cardMuted = {
  background: t.bgSurface,
  border: `1px solid ${t.borderSoft}`,
  borderRadius: t.radiusMd,
} as const

export type DashboardTheme = typeof t
