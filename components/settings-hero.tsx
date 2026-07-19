'use client'

import type { ReactNode } from 'react'

const HERO_HEIGHT_DESKTOP = 200
const HERO_HEIGHT_MOBILE = 168

// One shared photo for every venue — no per-venue upload flow to maintain.
const HERO_IMAGE_URL =
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&h=600&fit=crop&auto=format&q=80'

export function SettingsHero({
  venueName,
  isMobile,
  actions,
}: {
  venueName: string
  isMobile: boolean
  actions?: ReactNode
}) {
  return (
    <div
      style={{
        position: 'relative',
        height: isMobile ? HERO_HEIGHT_MOBILE : HERO_HEIGHT_DESKTOP,
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid var(--bk-border)',
        background: '#0b1220',
        boxShadow: 'var(--bk-shadow)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static external URL, no loader configured */}
      <img
        src={HERO_IMAGE_URL}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Legibility scrim: darkest at the bottom where the text sits. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(8,15,26,0.30) 0%, rgba(8,15,26,0.55) 55%, rgba(8,15,26,0.86) 100%)',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, rgba(8,15,26,0.60) 0%, transparent 60%)',
        }}
      />

      {/* Identity + save action */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: isMobile ? '0 18px 16px' : '0 26px 20px',
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'flex-end',
          justifyContent: 'space-between',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 12,
          zIndex: 2,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.62)',
            }}
          >
            Settings
          </p>
          <h1
            style={{
              margin: '5px 0 0',
              fontSize: isMobile ? 22 : 28,
              fontWeight: 750,
              color: '#fff',
              letterSpacing: '-0.02em',
              lineHeight: 1.12,
              textShadow: '0 2px 12px rgba(0,0,0,0.35)',
            }}
          >
            {venueName || 'Your venue'}
          </h1>
        </div>

        {actions ? <div style={{ width: isMobile ? '100%' : 'auto' }}>{actions}</div> : null}
      </div>
    </div>
  )
}
