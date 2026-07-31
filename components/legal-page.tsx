import Link from 'next/link'
import type { ReactNode } from 'react'

import { OceanCoreLogoCompact } from '@/components/oceancore-logo'
import { fs, radius } from '@/lib/marketing-scale'

/**
 * Chrome for the policy pages. They sit on the marketing side of the product, so
 * they take the landing page's dark palette and serif headings rather than the
 * dashboard's — a policy that looks like a different website reads as one
 * borrowed from a different company.
 */

export type LegalSection = {
  heading: string
  /** Paragraphs, in order. A nested array renders as a bulleted list. */
  blocks: Array<string | string[]>
}

const INK = '#e8f1ff'
const MUTED = '#94a8c4'
const ACCENT = '#38bdf8'
const HAIRLINE = 'rgba(125,211,252,0.14)'

export function LegalPage({
  title,
  intro,
  updated,
  sections,
  footnote,
}: {
  title: string
  intro: string
  /** Human-readable date this text last changed. */
  updated: string
  sections: LegalSection[]
  footnote?: ReactNode
}) {
  return (
    <div
      style={{
        background: '#050d1a',
        color: INK,
        minHeight: '100vh',
        fontFamily: 'var(--font-montserrat), system-ui, sans-serif',
        lineHeight: 1.5,
      }}
    >
      {/* Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          borderBottom: `1px solid ${HAIRLINE}`,
          background: 'rgba(5,13,26,0.88)',
          backdropFilter: 'blur(18px) saturate(150%)',
          WebkitBackdropFilter: 'blur(18px) saturate(150%)',
        }}
      >
        <div
          style={{
            maxWidth: 880,
            margin: '0 auto',
            height: 72,
            padding: '0 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <Link href="/" aria-label="OceanCore home" style={{ lineHeight: 0, textDecoration: 'none' }}>
            <OceanCoreLogoCompact theme="dark" />
          </Link>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: fs.small,
              fontWeight: 600,
              color: MUTED,
              textDecoration: 'none',
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Back to site
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '64px 28px 96px' }}>
        <div
          style={{
            fontSize: fs.caption,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: ACCENT,
          }}
        >
          Legal
        </div>
        <h1
          style={{
            margin: '14px 0 0',
            fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: 'clamp(34px, 5vw, 48px)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1.08,
            color: '#ffffff',
          }}
        >
          {title}
        </h1>
        <p style={{ margin: '18px 0 0', fontSize: fs.lead, lineHeight: 1.7, color: MUTED, maxWidth: 660 }}>
          {intro}
        </p>
        <div
          style={{
            marginTop: 26,
            paddingTop: 22,
            borderTop: `1px solid ${HAIRLINE}`,
            fontSize: fs.small,
            color: '#6b7f9c',
          }}
        >
          Last updated {updated}
        </div>

        {/* Contents — a policy is a reference document, not a story. */}
        <nav
          aria-label="On this page"
          style={{
            marginTop: 34,
            padding: '18px 20px',
            borderRadius: radius.md,
            border: `1px solid ${HAIRLINE}`,
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <div
            style={{
              fontSize: fs.micro,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#6b7f9c',
              marginBottom: 12,
            }}
          >
            On this page
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 7 }}>
            {sections.map((section) => (
              <li key={section.heading} style={{ fontSize: fs.body, color: MUTED }}>
                <a href={`#${slugify(section.heading)}`} style={{ color: MUTED, textDecoration: 'none' }}>
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((section) => (
          <section key={section.heading} id={slugify(section.heading)} style={{ marginTop: 48, scrollMarginTop: 92 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-playfair), Georgia, serif',
                fontSize: fs.sectionTitle,
                fontWeight: 600,
                letterSpacing: '-0.012em',
                color: '#ffffff',
              }}
            >
              {section.heading}
            </h2>
            {section.blocks.map((block, i) =>
              Array.isArray(block) ? (
                <ul key={i} style={{ margin: '16px 0 0', paddingLeft: 22, display: 'grid', gap: 9 }}>
                  {block.map((item) => (
                    <li key={item} style={{ fontSize: fs.bodyLg, lineHeight: 1.72, color: MUTED }}>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p key={i} style={{ margin: '16px 0 0', fontSize: fs.bodyLg, lineHeight: 1.75, color: MUTED }}>
                  {block}
                </p>
              ),
            )}
          </section>
        ))}

        {footnote ? (
          <div
            style={{
              marginTop: 56,
              padding: '18px 20px',
              borderRadius: radius.md,
              border: '1px solid rgba(245,158,11,0.28)',
              background: 'rgba(245,158,11,0.06)',
              fontSize: fs.body,
              lineHeight: 1.65,
              color: '#e7d3ad',
            }}
          >
            {footnote}
          </div>
        ) : null}
      </main>

      <footer style={{ borderTop: `1px solid ${HAIRLINE}`, background: '#040810' }}>
        <div
          style={{
            maxWidth: 880,
            margin: '0 auto',
            padding: '30px 28px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: fs.small,
            color: '#6b7f9c',
          }}
        >
          <span>© {new Date().getFullYear()} OceanCore, Inc.</span>
          <span style={{ display: 'flex', gap: 18 }}>
            <Link href="/privacy" style={{ color: '#6b7f9c', textDecoration: 'none' }}>
              Privacy
            </Link>
            <Link href="/terms" style={{ color: '#6b7f9c', textDecoration: 'none' }}>
              Terms
            </Link>
            <a href="mailto:hello@oceancore.ai" style={{ color: '#6b7f9c', textDecoration: 'none' }}>
              Contact
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}

function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
