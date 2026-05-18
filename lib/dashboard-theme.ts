export const t = {
  // Surfaces
  bgApp: 'var(--t-bg-app)',
  bgSurface: 'var(--t-bg-surface)',
  bgSurfaceHover: 'var(--t-bg-surface-hover)',
  bgSurfaceMuted: 'var(--t-bg-surface-muted)',
  bgSubtle: 'var(--t-bg-subtle)',

  // Sidebar
  bgSidebar: 'var(--t-bg-sidebar)',

  // Text
  text: 'var(--t-text)',
  textMuted: 'var(--t-text-muted)',
  textSubtle: 'var(--t-text-subtle)',

  // Borders
  border: 'var(--t-border)',
  borderSoft: 'var(--t-border-soft)',
  borderStrong: 'var(--t-border-strong)',

  // Accent
  accent: 'var(--t-accent)',
  accentHover: 'var(--t-accent-hover)',
  accentSoftBg: 'var(--t-accent-soft-bg)',
  accentSoftBorder: 'var(--t-accent-soft-border)',
  accentText: 'var(--t-accent)',
  accentGlow: 'var(--t-accent-glow)',

  // White accent (kept for backward compat)
  blue: 'var(--t-text)',
  blueBg: 'var(--t-bg-surface)',
  blueBorder: 'var(--t-border-strong)',

  // Status
  success: 'var(--t-success)',
  successBg: 'var(--t-success-bg)',
  successBorder: 'var(--t-success-border)',
  warning: 'var(--t-warning)',
  warningBg: 'var(--t-warning-bg)',
  warningBorder: 'var(--t-warning-border)',
  danger: 'var(--t-danger)',
  dangerBg: 'var(--t-danger-bg)',
  dangerBorder: 'var(--t-danger-border)',

  // Shadows
  shadowSm: 'var(--t-shadow-sm)',
  shadowCard: 'var(--t-shadow-card)',
  shadowMd: 'var(--t-shadow-md)',
  shadowLg: 'var(--t-shadow-lg)',
  shadowGlow: 'var(--t-shadow-glow)',

  // Radii (kept as numbers)
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
  radiusXl: 20,
}

export const glass = {
  background: 'var(--t-glass-bg)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid var(--t-glass-border)',
  borderRadius: t.radiusLg,
  boxShadow: 'var(--t-shadow-card)',
}

export const card = {
  ...glass,
}

export const cardMuted = {
  background: 'var(--t-bg-surface-muted)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid var(--t-border-soft)',
  borderRadius: t.radiusMd,
}

export type DashboardTheme = typeof t
