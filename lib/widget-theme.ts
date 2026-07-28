export const WIDGET_THEMES = ['ice', 'ocean'] as const

export type WidgetTheme = (typeof WIDGET_THEMES)[number]

export const DEFAULT_WIDGET_THEME: WidgetTheme = 'ice'

/** Default FAB accent when the restaurant has not set a custom color yet. */
export const DEFAULT_WIDGET_LAUNCHER_COLOR = '#0ea5e9'

export const WIDGET_THEME_OPTIONS: Array<{
  value: WidgetTheme
  label: string
  description: string
}> = [
  {
    value: 'ice',
    label: 'Ice blue',
    description: 'Bright white canvas with soft, icy-blue details.',
  },
  {
    value: 'ocean',
    label: 'Midnight ocean',
    description: 'The original deep-navy OceanCore conversation style.',
  },
]

export function parseWidgetTheme(value: unknown): WidgetTheme {
  return WIDGET_THEMES.includes(value as WidgetTheme)
    ? (value as WidgetTheme)
    : DEFAULT_WIDGET_THEME
}

/** Accepts #rgb / #rrggbb (with or without #). Returns normalized #rrggbb or null. */
export function parseWidgetLauncherColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  const short = /^#?([0-9a-f]{3})$/i.exec(raw)
  if (short) {
    const [r, g, b] = short[1]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const full = /^#?([0-9a-f]{6})$/i.exec(raw)
  if (full) return `#${full[1].toLowerCase()}`
  return null
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const parsed = parseWidgetLauncherColor(hex)
  if (!parsed) return null
  return {
    r: parseInt(parsed.slice(1, 3), 16),
    g: parseInt(parsed.slice(3, 5), 16),
    b: parseInt(parsed.slice(5, 7), 16),
  }
}

function mixHex(hex: string, toward: 'white' | 'black', amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const t = toward === 'white' ? 255 : 0
  const mix = (c: number) => Math.round(c + (t - c) * amount)
  const to = (n: number) => n.toString(16).padStart(2, '0')
  return `#${to(mix(rgb.r))}${to(mix(rgb.g))}${to(mix(rgb.b))}`
}

function luminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0.5
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b)
}

/**
 * Above this the colour is too pale to draw the panel's hairlines with: at
 * #ffffff every chip border becomes `rgba(255,255,255,…)` — invisible.
 */
const CHROME_TINT_MAX_LUMINANCE = 0.62

/** Above this the FAB needs its own outline to be findable on a white page. */
const LAUNCHER_RING_MIN_LUMINANCE = 0.6

/** True when a brand colour is so light the launcher needs a drawn edge. */
export function launcherNeedsRing(hex: string): boolean {
  const color = parseWidgetLauncherColor(hex)
  return color ? luminance(color) > LAUNCHER_RING_MIN_LUMINANCE : false
}

/** CSS vars that tint the FAB (and its glow) to a restaurant brand color. */
export function launcherColorOverrides(hex: string): Record<string, string> {
  const color = parseWidgetLauncherColor(hex) ?? DEFAULT_WIDGET_LAUNCHER_COLOR
  const rgb = hexToRgb(color)!
  const light = mixHex(color, 'white', 0.28)
  const lum = luminance(color)
  const iconOnLight = lum > 0.55
  const ring = lum > LAUNCHER_RING_MIN_LUMINANCE
  return {
    '--widget-launcher-background': `linear-gradient(140deg, ${light}, ${color})`,
    '--widget-launcher-color': iconOnLight ? '#0f172a' : '#ffffff',
    // A pale launcher would vanish on a white host page, and its own coloured
    // glow cannot save it — give it a hairline and a neutral shadow instead.
    '--widget-launcher-shadow': ring
      ? '0 0 0 1px rgba(15, 23, 42, 0.14), 0 10px 26px rgba(15, 23, 42, 0.2)'
      : `0 8px 24px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.45), 0 4px 12px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`,
    // The brand colour only takes over the panel's chrome when it can actually
    // be seen against it; otherwise the theme keeps its own accent.
    ...(lum > CHROME_TINT_MAX_LUMINANCE
      ? null
      : { '--widget-accent-rgb': `${rgb.r}, ${rgb.g}, ${rgb.b}` }),
  }
}

export const WIDGET_THEME_PALETTES: Record<WidgetTheme, Record<string, string>> = {
  ice: {
    // Tinted toward the brand hue so white cards — bubbles, the composer, the
    // booking summary — read as raised without needing heavy borders.
    '--widget-canvas': '#f3f8fd',
    '--widget-surface': '#ffffff',
    '--widget-text': '#122a49',
    // Deepened from the old #617a99/#7e95af so secondary lines clear 4.5:1 on
    // both the white bubbles and the tinted header.
    '--widget-muted': '#4f6b8b',
    '--widget-subtle': '#6b829d',
    '--widget-border': 'rgba(58, 123, 171, 0.16)',
    '--widget-accent': '#349cf4',
    '--widget-accent-strong': '#146fca',
    // Deep enough to clear 4.5:1 on the soft accent fill the chips use.
    '--widget-accent-text': '#0f63bd',
    '--widget-accent-soft': '#e6f2ff',
    '--widget-accent-rgb': '52, 156, 244',
    // The header is the one saturated surface in the light theme — deep water
    // above the waterline, everything below it reads as air.
    '--widget-header-background': 'linear-gradient(135deg, #1d78cf 0%, #145fae 52%, #0d4685 100%)',
    '--widget-header-glow': 'rgba(255, 255, 255, 0.34)',
    '--widget-header-text': '#ffffff',
    '--widget-header-muted': 'rgba(226, 240, 255, 0.82)',
    '--widget-header-shadow': '0 6px 18px rgba(13, 70, 133, 0.18)',
    '--widget-header-button-background': 'rgba(255, 255, 255, 0.15)',
    '--widget-header-button-border': 'rgba(255, 255, 255, 0.32)',
    '--widget-header-button-text': '#ffffff',
    // The guest's own messages carry the accent, the concierge answers on
    // white — the thread reads at a glance instead of two pale blues.
    '--widget-message-ai': '#ffffff',
    '--widget-message-customer': 'linear-gradient(135deg, #1f74cc 0%, #1259ab 100%)',
    '--widget-customer-text': '#ffffff',
    '--widget-message-ai-border': 'rgba(30, 74, 115, 0.1)',
    '--widget-message-customer-border': 'transparent',
    '--widget-booking-background': 'linear-gradient(150deg, #ffffff 0%, #effbf6 100%)',
    '--widget-contact-background': 'linear-gradient(145deg, #ffffff 0%, #eef8ff 100%)',
    '--widget-contact-tabs-background': '#edf8ff',
    '--widget-contact-active-background': 'linear-gradient(145deg, #ffffff, #dff2ff)',
    '--widget-contact-input-background': '#ffffff',
    '--widget-disabled-background': '#e8f0f5',
    '--widget-composer-background': '#ffffff',
    '--widget-composer-input-background': '#f8fbfd',
    '--widget-composer-input-border': 'rgba(21, 69, 101, 0.16)',
    '--widget-launcher-background': 'linear-gradient(140deg, #8fd4ff, #349cf4)',
    '--widget-launcher-color': '#12304f',
    '--widget-launcher-shadow': '0 8px 24px rgba(52, 156, 244, 0.45), 0 4px 12px rgba(52, 156, 244, 0.3)',
    '--widget-soft-shadow': '0 3px 12px rgba(18, 61, 91, 0.06)',
    '--widget-contact-shadow': '0 12px 32px rgba(18, 61, 91, 0.1), inset 0 1px 0 rgba(255,255,255,0.8)',
  },
  ocean: {
    '--widget-canvas': '#061018',
    '--widget-surface': '#102338',
    '--widget-text': '#e8f1ff',
    '--widget-muted': '#94a8c4',
    '--widget-subtle': '#6b7f9c',
    '--widget-border': 'rgba(125, 211, 252, 0.14)',
    '--widget-accent': '#38bdf8',
    '--widget-accent-strong': '#0ea5e9',
    '--widget-accent-text': '#7dd3fc',
    '--widget-accent-soft': 'rgba(125, 211, 252, 0.12)',
    '--widget-accent-rgb': '56, 189, 248',
    '--widget-header-background': 'linear-gradient(135deg, #103356 0%, #0c1f36 55%, #0a2b46 100%)',
    '--widget-header-glow': 'rgba(56, 189, 248, 0.22)',
    '--widget-header-text': '#e8f1ff',
    '--widget-header-muted': 'rgba(174, 199, 228, 0.85)',
    '--widget-header-shadow': 'none',
    '--widget-header-button-background': 'rgba(125, 211, 252, 0.1)',
    '--widget-header-button-border': 'rgba(125, 211, 252, 0.26)',
    '--widget-header-button-text': '#d5e6fb',
    '--widget-message-ai': '#102338',
    '--widget-message-customer': 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
    '--widget-customer-text': '#04121f',
    '--widget-message-ai-border': 'rgba(125, 211, 252, 0.14)',
    '--widget-message-customer-border': 'transparent',
    '--widget-booking-background': 'linear-gradient(150deg, rgba(6,28,46,0.96) 0%, rgba(8,38,45,0.96) 100%)',
    '--widget-contact-background': 'linear-gradient(145deg, rgba(17, 40, 62, 0.98) 0%, rgba(10, 27, 44, 0.98) 100%)',
    '--widget-contact-tabs-background': 'rgba(3, 13, 22, 0.6)',
    '--widget-contact-active-background': 'linear-gradient(145deg, rgba(56,189,248,0.17), rgba(14,165,233,0.09))',
    '--widget-contact-input-background': 'rgba(2, 12, 20, 0.78)',
    '--widget-disabled-background': 'rgba(125,211,252,0.07)',
    '--widget-composer-background': '#0e1624',
    '--widget-composer-input-background': '#061018',
    '--widget-composer-input-border': 'rgba(125, 211, 252, 0.14)',
    '--widget-launcher-background': 'linear-gradient(140deg, #38bdf8, #b48b54)',
    '--widget-launcher-color': '#04121f',
    '--widget-launcher-shadow': '0 8px 24px rgba(56, 189, 248, 0.4), 0 4px 12px rgba(56, 189, 248, 0.28)',
    '--widget-soft-shadow': 'none',
    '--widget-contact-shadow': '0 12px 32px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255,255,255,0.035)',
  },
}
