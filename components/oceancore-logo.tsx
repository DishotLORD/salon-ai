type LogoVariant = 'full' | 'sidebar' | 'icon'
type LogoTheme = 'dark' | 'light'

interface OceanCoreLogoProps {
  variant?: LogoVariant
  theme?: LogoTheme
  className?: string
}

let _idCounter = 0

function OceanCoreIconMark({
  color,
  size,
  glow,
  glowId,
}: {
  color: string
  size: number
  glow?: boolean
  glowId?: string
}) {
  const id = glowId ?? `glow-oc-${++_idCounter}`
  const strokeW = size < 30 ? 2.3 : 1.85
  const branchW = size < 30 ? 1.9 : 1.35
  const rippleW = size < 30 ? 1.7 : 1.25
  const dot1 = size < 30 ? 2.5 : 2.2
  const dot2 = size < 30 ? 2.3 : 2

  return (
    <svg
      width={size}
      height={Math.round(size * 0.953)}
      viewBox="-5 -2 60 58"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, overflow: 'visible' }}
    >
      {glow && (
        <defs>
          <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      <g filter={glow ? `url(#${id})` : undefined}>
        <path d="M 10,48 C 0,38 0,14 16,6 C 28,0 44,4 50,18 C 54,28 50,42 40,46" stroke={color} strokeWidth={strokeW} strokeLinecap="round" fill="none" />
        <path d="M 18,44 C 10,34 12,18 24,14 C 32,10 44,14 46,26 C 47,32 44,38 36,40" stroke={color} strokeWidth={strokeW} strokeLinecap="round" fill="none" />
        <path d="M 26,38 C 22,28 24,22 30,20 C 36,18 42,22 40,32 C 39,37 34,38 31,34" stroke={color} strokeWidth={strokeW} strokeLinecap="round" fill="none" />
        <line x1="8" y1="20" x2="1" y2="13" stroke={color} strokeWidth={branchW} strokeLinecap="round" />
        <circle cx="0" cy="12" r={dot1} fill={color} />
        <line x1="4" y1="28" x2="-2" y2="28" stroke={color} strokeWidth={branchW} strokeLinecap="round" />
        <circle cx="-3" cy="28" r={dot2} fill={color} />
        <line x1="7" y1="37" x2="1" y2="43" stroke={color} strokeWidth={branchW} strokeLinecap="round" />
        <circle cx="0" cy="44" r={dot2} fill={color} />
        <path d="M 14,50 Q 22,47 30,50" stroke={color} strokeWidth={rippleW} strokeLinecap="round" fill="none" opacity="0.72" />
        <path d="M 10,53 Q 24,49 38,53" stroke={color} strokeWidth={rippleW} strokeLinecap="round" fill="none" opacity="0.46" />
      </g>
    </svg>
  )
}

export function OceanCoreLogo({ variant = 'full', theme = 'dark', className }: OceanCoreLogoProps) {
  const isDark = theme === 'dark'
  const accent = isDark ? '#60b8ff' : '#0ea5e9'
  const wordmarkColor = isDark ? '#ffffff' : '#0f172a'

  if (variant === 'icon') {
    return (
      <div className={className} style={{ position: 'relative', display: 'inline-flex' }}>
        <div style={{
          position: 'absolute',
          inset: -28,
          background: `radial-gradient(circle, ${isDark ? 'rgba(96,184,255,0.24)' : 'rgba(14,165,233,0.18)'} 0%, transparent 65%)`,
          pointerEvents: 'none',
        }} />
        <OceanCoreIconMark color={accent} size={106} glow glowId="glow-oc-icon" />
      </div>
    )
  }

  if (variant === 'sidebar') {
    return (
      <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        {/* Glow halo behind the icon */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{
            position: 'absolute',
            inset: -10,
            background: 'radial-gradient(circle, rgba(96,184,255,0.28) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <OceanCoreIconMark color={accent} size={28} glow glowId="glow-oc-sidebar" />
        </div>
        {/* Wordmark with subtle gradient */}
        <span style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 17,
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '-0.015em',
          background: 'linear-gradient(135deg, #ffffff 40%, #a8d8ff 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          OceanCore
        </span>
      </div>
    )
  }

  // full lockup
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          position: 'absolute',
          inset: -22,
          background: `radial-gradient(circle, ${isDark ? 'rgba(96,184,255,0.22)' : 'rgba(14,165,233,0.16)'} 0%, transparent 68%)`,
          pointerEvents: 'none',
        }} />
        <OceanCoreIconMark color={accent} size={86} glow glowId="glow-oc-full" />
      </div>
      <div>
        <div style={{
          font: '700 46px/1 "Space Grotesk", sans-serif',
          color: wordmarkColor,
          letterSpacing: '-0.028em',
        }}>
          OceanCore
        </div>
        <div style={{
          font: '600 12.5px/1 "Space Grotesk", sans-serif',
          color: accent,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          marginTop: 11,
          opacity: 0.85,
        }}>
          Restaurant AI
        </div>
      </div>
    </div>
  )
}

/** Compact horizontal lockup for auth pages and landing */
export function OceanCoreLogoCompact({ theme = 'dark', className }: { theme?: LogoTheme; className?: string }) {
  const isDark = theme === 'dark'
  const accent = isDark ? '#60b8ff' : '#0ea5e9'
  const wordmarkColor = isDark ? '#ffffff' : '#0f172a'

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          position: 'absolute',
          inset: -12,
          background: `radial-gradient(circle, ${isDark ? 'rgba(96,184,255,0.22)' : 'rgba(14,165,233,0.16)'} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />
        <OceanCoreIconMark color={accent} size={38} glow glowId="glow-oc-compact" />
      </div>
      <div>
        <div style={{
          font: '700 22px/1 "Space Grotesk", sans-serif',
          color: wordmarkColor,
          letterSpacing: '-0.02em',
        }}>
          OceanCore
        </div>
        <div style={{
          font: '600 9px/1 "Space Grotesk", sans-serif',
          color: accent,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginTop: 6,
        }}>
          Restaurant AI
        </div>
      </div>
    </div>
  )
}
