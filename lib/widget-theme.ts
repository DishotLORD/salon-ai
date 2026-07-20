export const WIDGET_THEMES = ['ice', 'ocean'] as const

export type WidgetTheme = (typeof WIDGET_THEMES)[number]

export const DEFAULT_WIDGET_THEME: WidgetTheme = 'ice'

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

export const WIDGET_THEME_PALETTES: Record<WidgetTheme, Record<string, string>> = {
  ice: {
    // Tinted toward the brand hue — never pure white, so bubbles and cards
    // keep definition without heavier borders.
    '--widget-canvas': '#fafcfe',
    '--widget-surface': '#ffffff',
    '--widget-text': '#122a49',
    '--widget-muted': '#617a99',
    '--widget-subtle': '#7e95af',
    '--widget-border': 'rgba(58, 123, 171, 0.16)',
    '--widget-accent': '#349cf4',
    '--widget-accent-strong': '#146fca',
    '--widget-accent-text': '#146fca',
    '--widget-accent-soft': '#e4f4ff',
    '--widget-accent-rgb': '52, 156, 244',
    // Radial highlight over the diagonal wash gives the header glass depth
    // without an actual blur.
    '--widget-header-background':
      'radial-gradient(130% 180% at 88% -30%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 55%), linear-gradient(135deg, #ecf7ff 0%, #d9edfc 55%, #bfe1f8 100%)',
    '--widget-header-border': 'rgba(52, 156, 244, 0.3)',
    '--widget-header-shadow': '0 7px 20px rgba(34, 112, 170, 0.12)',
    '--widget-header-button-background': 'rgba(255,255,255,0.74)',
    '--widget-header-button-text': '#477395',
    '--widget-header-online-border': '#ffffff',
    '--widget-message-ai': '#eef3f9',
    '--widget-message-customer': 'linear-gradient(135deg, #e2f1ff 0%, #d3e9fc 100%)',
    '--widget-customer-text': '#122a49',
    '--widget-message-ai-border': 'rgba(30, 74, 115, 0.06)',
    '--widget-message-customer-border': 'rgba(52, 156, 244, 0.14)',
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
    '--widget-header-background': 'linear-gradient(150deg, #0e1624 0%, #0c1a2e 60%, #0d2a45 100%)',
    '--widget-header-border': 'rgba(125, 211, 252, 0.14)',
    '--widget-header-shadow': 'none',
    '--widget-header-button-background': 'rgba(125,211,252,0.06)',
    '--widget-header-button-text': '#94a8c4',
    '--widget-header-online-border': '#0e1624',
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
    '--widget-soft-shadow': 'none',
    '--widget-contact-shadow': '0 12px 32px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255,255,255,0.035)',
  },
}
