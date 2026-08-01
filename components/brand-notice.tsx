import type { ReactNode } from 'react'

import { fs, radius } from '@/lib/marketing-scale'

/**
 * The dead-end page: 404, a crashed boundary, a link that expired. Shared so a
 * visitor who hits one still lands somewhere that looks like the product —
 * Next's own error page is unstyled white, and on a marketing site that reads
 * as "this company is broken" rather than "that page moved".
 *
 * Deliberately plain markup: `global-error.tsx` renders outside the root layout,
 * with no providers, no fonts and no globals.css, so this cannot depend on them.
 */
export function BrandNotice({
  code,
  title,
  body,
  actions,
}: {
  /** Short label above the headline — "404", "500". Omit for a plain notice. */
  code?: string
  title: string
  body: ReactNode
  actions?: ReactNode
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '48px 24px',
        background:
          'radial-gradient(900px 520px at 78% -12%, rgba(56,189,248,0.16) 0%, rgba(5,13,26,0) 60%), linear-gradient(160deg, #071528 0%, #050d1a 58%, #03080f 100%)',
        color: '#e8f1ff',
        fontFamily:
          'var(--font-montserrat), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width="64" height="61" viewBox="-6 -3 62 60" fill="none" aria-hidden="true">
          <path
            d="M 10,48 C 0,38 0,14 16,6 C 28,0 44,4 50,18 C 54,28 50,42 40,46"
            stroke="#60b8ff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M 18,44 C 10,34 12,18 24,14 C 32,10 44,14 46,26 C 47,32 44,38 36,40"
            stroke="#60b8ff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M 26,38 C 22,28 24,22 30,20 C 36,18 42,22 40,32 C 39,37 34,38 31,34"
            stroke="#60b8ff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="0" cy="12" r="2.6" fill="#60b8ff" />
          <circle cx="-3" cy="28" r="2.4" fill="#60b8ff" />
          <circle cx="0" cy="44" r="2.4" fill="#60b8ff" />
        </svg>

        {code ? (
          <div
            style={{
              marginTop: 30,
              fontSize: fs.caption,
              fontWeight: 700,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#38bdf8',
            }}
          >
            Error {code}
          </div>
        ) : null}

        <h1
          style={{
            margin: code ? '12px 0 0' : '30px 0 0',
            fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: fs.pageTitle,
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: '-0.015em',
            color: '#ffffff',
          }}
        >
          {title}
        </h1>

        <div style={{ marginTop: 14, fontSize: fs.bodyLg, lineHeight: 1.65, color: '#94a8c4' }}>{body}</div>

        {actions ? (
          <div
            style={{
              marginTop: 32,
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Shared button styling so the notice pages agree with the landing page. */
export const noticeButtonStyle = {
  primary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '13px 24px',
    borderRadius: radius.sm,
    border: '1px solid transparent',
    background: '#38bdf8',
    color: '#04121f',
    fontSize: fs.body,
    fontWeight: 700,
    textDecoration: 'none',
    cursor: 'pointer',
    boxShadow: '0 6px 26px -6px rgba(56,189,248,0.5)',
  },
  ghost: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '13px 24px',
    borderRadius: radius.sm,
    border: '1px solid rgba(125,211,252,0.28)',
    background: 'rgba(255,255,255,0.03)',
    color: '#e8f1ff',
    fontSize: fs.body,
    fontWeight: 600,
    textDecoration: 'none',
    cursor: 'pointer',
  },
} as const
