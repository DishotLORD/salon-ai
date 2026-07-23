'use client'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { bk, bkCard } from '@/lib/bookings-compact-ui'

/**
 * CRM route fallback. Renders the real page's sidebar shell (DashboardOceanNav)
 * around a content skeleton, so the loading flash lands in exactly the same
 * place as the loaded page: sidebar stays put, content keeps its 240px offset,
 * no jump.
 *
 * The earlier version rendered the skeleton bare — no DashboardOceanNav, and the
 * page-canceling `-36px` margins with nothing to cancel — so during the flash
 * the sidebar vanished and the cards spilled full-width across the whole
 * viewport ("big windows"), then snapped back in when the page mounted.
 */
export default function CrmLoading() {
  return (
    <DashboardOceanNav activeNav="CRM" flatBackground="var(--bk-bg)">
      {({ isMobile, openNav }) => (
        <main
          style={{
            background: 'var(--bk-bg)',
            minHeight: '100vh',
            margin: isMobile ? '-20px -16px' : '-36px',
            padding: isMobile ? bk.pagePadMobile : bk.pagePad,
            display: 'grid',
            gap: 14,
            alignContent: 'start',
            fontFamily: bk.font,
          }}
        >
          {isMobile && (
            <button
              type="button"
              onClick={openNav}
              aria-label="Open navigation"
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                border: bk.border,
                background: 'var(--bk-card)',
                fontSize: 18,
                cursor: 'pointer',
                justifySelf: 'start',
              }}
            >
              ☰
            </button>
          )}

          {/* header — matches the loaded page's title block */}
          <div>
            <div
              style={{
                fontSize: bk.micro,
                fontWeight: 700,
                color: 'var(--bk-muted)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              Guest CRM
            </div>
            <h1
              style={{
                margin: '5px 0 0',
                fontSize: 26,
                fontWeight: 700,
                color: 'var(--bk-head)',
                letterSpacing: '-0.03em',
              }}
            >
              Guests
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: bk.body, color: 'var(--bk-body)' }}>
              Loading guest list…
            </p>
          </div>

          {/* stats — same responsive grid as the page so the cards never resize */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: 12,
            }}
          >
            {['Total guests', 'New this month', 'Repeat rate'].map((label) => (
              <div key={label} style={{ ...bkCard, padding: bk.cardPad, minHeight: 88 }}>
                <div
                  style={{
                    fontSize: bk.micro,
                    fontWeight: 600,
                    color: 'var(--bk-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: bk.statValue,
                    fontWeight: 700,
                    color: 'var(--bk-head)',
                    marginTop: 4,
                    lineHeight: 1,
                    minHeight: 28,
                  }}
                >
                  —
                </div>
                <div style={{ fontSize: bk.micro, color: 'var(--bk-body)', marginTop: 4, minHeight: 14 }}>
                  {' '}
                </div>
              </div>
            ))}
          </div>

          {/* guest list — shimmer rows, same card the table lives in */}
          <div style={{ ...bkCard, overflow: 'hidden', minHeight: 320 }}>
            <div style={{ padding: 16, display: 'grid', gap: 8 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 48,
                    borderRadius: 8,
                    background:
                      'linear-gradient(90deg, var(--bk-surface) 0%, var(--bk-border) 50%, var(--bk-surface) 100%)',
                  }}
                />
              ))}
            </div>
          </div>
        </main>
      )}
    </DashboardOceanNav>
  )
}
