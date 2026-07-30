import { ImageResponse } from 'next/og'

/**
 * The card Slack, iMessage, WhatsApp, LinkedIn and X draw when someone pastes
 * the link. Without one they show a bare URL, which is the difference between a
 * shared link that looks like a product and one that looks like spam.
 */
export const alt = 'OceanCore — the AI concierge for restaurants and bars'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const ACCENT = '#60b8ff'

type LoadedFace = { data: ArrayBuffer; style: 'normal' | 'italic' }

/**
 * Satori has no access to next/font, so the display face is fetched here. Both
 * the upright and the italic are needed: Satori will not slant a font for you,
 * so without the italic file the emphasised word silently renders upright.
 *
 * A font that fails to download must not take the whole card down with it — the
 * fallback is Satori's own sans, which still renders every glyph on this card.
 */
async function loadDisplayFaces(): Promise<LoadedFace[]> {
  try {
    const css = await fetch(
      'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,600&display=swap',
      // Ask as a modern browser: the legacy-UA response comes back in a format
      // Satori renders as some other face entirely, silently.
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    ).then((res) => (res.ok ? res.text() : ''))

    const faces: LoadedFace[] = []
    for (const block of css.split('@font-face')) {
      const url = block.match(/src:\s*url\(([^)]+)\)/)?.[1]
      if (!url) continue
      const style = /font-style:\s*italic/.test(block) ? 'italic' : 'normal'
      if (faces.some((face) => face.style === style)) continue
      const res = await fetch(url)
      if (res.ok) faces.push({ data: await res.arrayBuffer(), style })
    }
    return faces
  } catch {
    return []
  }
}

export default async function OpenGraphImage() {
  const faces = await loadDisplayFaces()
  const display = faces.length > 0

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background:
            'radial-gradient(1100px 620px at 78% -10%, rgba(56,189,248,0.22) 0%, rgba(5,13,26,0) 62%), linear-gradient(155deg, #071528 0%, #050d1a 55%, #03080f 100%)',
          color: '#e8f1ff',
          fontFamily: display ? 'Display' : 'sans-serif',
        }}
      >
        {/* Brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <svg width="66" height="63" viewBox="-6 -3 62 60" fill="none">
            <path
              d="M 10,48 C 0,38 0,14 16,6 C 28,0 44,4 50,18 C 54,28 50,42 40,46"
              stroke={ACCENT}
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M 18,44 C 10,34 12,18 24,14 C 32,10 44,14 46,26 C 47,32 44,38 36,40"
              stroke={ACCENT}
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M 26,38 C 22,28 24,22 30,20 C 36,18 42,22 40,32 C 39,37 34,38 31,34"
              stroke={ACCENT}
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <circle cx="0" cy="12" r="2.8" fill={ACCENT} />
            <circle cx="-3" cy="28" r="2.6" fill={ACCENT} />
            <circle cx="0" cy="44" r="2.6" fill={ACCENT} />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff' }}>
              OceanCore
            </div>
            <div
              style={{
                fontSize: 17,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: ACCENT,
                marginTop: 4,
              }}
            >
              AI Concierge
            </div>
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 82, lineHeight: 1.05, letterSpacing: '-0.03em', color: '#ffffff' }}>
            Never miss a
          </div>
          <div style={{ display: 'flex', fontSize: 82, lineHeight: 1.15, letterSpacing: '-0.03em' }}>
            <span style={{ color: ACCENT, fontStyle: 'italic' }}>reservation</span>
            <span style={{ color: '#ffffff' }}>&nbsp;again.</span>
          </div>
          <div style={{ fontSize: 29, lineHeight: 1.45, color: '#94a8c4', marginTop: 26, maxWidth: 880 }}>
            Answers every guest, books every table, remembers every regular — 24 hours a day.
          </div>
        </div>

        {/* Footer strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {['Reservations', 'Guest CRM', 'Live handoff', '24/7'].map((chip) => (
            <div
              key={chip}
              style={{
                display: 'flex',
                fontSize: 20,
                padding: '11px 22px',
                borderRadius: 999,
                border: '1px solid rgba(125,211,252,0.26)',
                background: 'rgba(56,189,248,0.08)',
                color: '#c9dcf5',
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: display
        ? faces.map((face) => ({
            name: 'Display',
            data: face.data,
            style: face.style,
            weight: 600 as const,
          }))
        : undefined,
    },
  )
}
