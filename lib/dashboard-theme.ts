export const t = {
  // Surfaces — lighter navy blue
  bgApp: '#0d1f3c',
  bgSurface: 'rgba(255,255,255,0.07)',
  bgSurfaceHover: 'rgba(255,255,255,0.11)',
  bgSurfaceMuted: 'rgba(255,255,255,0.04)',
  bgSubtle: 'rgba(255,255,255,0.03)',

  // Sidebar
  bgSidebar: 'rgba(10,18,38,0.96)',

  // Text
  text: '#ffffff',
  textMuted: '#6a8db0',
  textSubtle: '#3d5a7a',

  // Borders
  border: 'rgba(99,179,255,0.12)',
  borderSoft: 'rgba(255,255,255,0.05)',
  borderStrong: 'rgba(99,179,255,0.28)',

  // Accent — sky blue
  accent: '#60b8ff',
  accentHover: '#3da5ff',
  accentSoftBg: 'rgba(96,184,255,0.08)',
  accentSoftBorder: 'rgba(96,184,255,0.22)',
  accentText: '#60b8ff',
  accentGlow: '0 0 20px rgba(96,184,255,0.4)',

  // White accent
  blue: '#ffffff',
  blueBg: 'rgba(255,255,255,0.08)',
  blueBorder: 'rgba(255,255,255,0.18)',

  // Status
  success: '#60b8ff',
  successBg: 'rgba(96,184,255,0.08)',
  successBorder: 'rgba(96,184,255,0.22)',
  warning: '#f59e0b',
  warningBg: 'rgba(245,158,11,0.1)',
  warningBorder: 'rgba(245,158,11,0.2)',
  danger: '#f87171',
  dangerBg: 'rgba(248,113,113,0.1)',
  dangerBorder: 'rgba(248,113,113,0.2)',

  // Shadows
  shadowSm: '0 1px 3px rgba(0,0,0,0.6)',
  shadowCard: '0 2px 8px rgba(0,0,0,0.7)',
  shadowMd: '0 4px 16px rgba(0,0,0,0.6)',
  shadowLg: '0 12px 32px rgba(0,0,0,0.7)',
  shadowGlow: '0 0 40px rgba(96,184,255,0.15)',

  // Radii
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
  radiusXl: 20,
} as const

export const glass = {
  background: 'rgba(255,255,255,0.05)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(96,184,255,0.12)',
  borderRadius: t.radiusLg,
  boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
} as const

export const card = {
  ...glass,
} as const

export const cardMuted = {
  background: 'rgba(255,255,255,0.02)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: t.radiusMd,
} as const

export type DashboardTheme = typeof t
