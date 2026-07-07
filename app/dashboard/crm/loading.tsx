import { bk, bkCard } from '@/lib/bookings-compact-ui'

/** Matches CRM page shell so reload does not flash the dark dashboard loader. */
export default function CrmLoading() {
  return (
    <div
      style={{
        background: 'var(--bk-bg)',
        minHeight: '100vh',
        margin: '-36px',
        padding: bk.pagePad,
        display: 'grid',
        gap: 12,
        fontFamily: bk.font,
      }}
    >
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
            margin: '4px 0 0',
            fontSize: bk.h1,
            fontWeight: 700,
            color: 'var(--bk-head)',
            letterSpacing: '-0.03em',
          }}
        >
          Guests
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: bk.body, color: 'var(--bk-body)', minHeight: 18 }}>
          {'\u00a0'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: bk.gapMd }}>
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
            <div style={{ fontSize: bk.statValue, fontWeight: 700, color: 'var(--bk-head)', marginTop: 4, minHeight: 28 }}>
              —
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...bkCard, overflow: 'hidden', minHeight: 320 }}>
        <div style={{ padding: 16, display: 'grid', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 48,
                borderRadius: 8,
                background: 'linear-gradient(90deg, var(--bk-surface) 0%, var(--bk-surface-2) 50%, var(--bk-surface) 100%)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
