'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  launcherColorOverrides,
  parseWidgetLauncherColor,
} from '@/lib/widget-theme'

type Hsv = { h: number; s: number; v: number }

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
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

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let rp = 0
  let gp = 0
  let bp = 0
  if (h < 60) [rp, gp, bp] = [c, x, 0]
  else if (h < 120) [rp, gp, bp] = [x, c, 0]
  else if (h < 180) [rp, gp, bp] = [0, c, x]
  else if (h < 240) [rp, gp, bp] = [0, x, c]
  else if (h < 300) [rp, gp, bp] = [x, 0, c]
  else [rp, gp, bp] = [c, 0, x]
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  }
}

function hexToHsv(hex: string): Hsv {
  const rgb = hexToRgb(hex)
  if (!rgb) return { h: 199, s: 0.93, v: 0.91 }
  return rgbToHsv(rgb.r, rgb.g, rgb.b)
}

function hsvToHex(hsv: Hsv): string {
  const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v)
  return rgbToHex(r, g, b)
}

function hueCss(h: number): string {
  const { r, g, b } = hsvToRgb(h, 1, 1)
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

function LauncherPreview({ color }: { color: string }) {
  const overrides = launcherColorOverrides(color)
  const bg = overrides['--widget-launcher-background']
  const ink = overrides['--widget-launcher-color']
  const rgb = overrides['--widget-accent-rgb']

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: 220,
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid rgba(15,23,42,0.08)',
        background:
          'linear-gradient(160deg, #0b1220 0%, #132033 48%, #1a2a3d 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {/* Fake site chrome */}
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div
          style={{
            width: 72,
            height: 8,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.18)',
            marginBottom: 8,
          }}
        />
        <div
          style={{
            width: '62%',
            height: 6,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.1)',
          }}
        />
      </div>
      <div style={{ padding: 16, display: 'grid', gap: 8 }}>
        <div
          style={{
            height: 54,
            borderRadius: 10,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        />
        <div
          style={{
            height: 36,
            width: '78%',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
          }}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          right: 14,
          bottom: 14,
          display: 'grid',
          gap: 8,
          justifyItems: 'end',
        }}
      >
        {/* Mini nudge teaser */}
        <div
          style={{
            maxWidth: 148,
            padding: '8px 10px',
            borderRadius: 12,
            background: '#fff',
            color: '#0f172a',
            fontSize: 11,
            lineHeight: 1.35,
            fontWeight: 500,
            boxShadow: '0 10px 24px rgba(0,0,0,0.28)',
          }}
        >
          Hi! Can I help you book a table?
        </div>

        {/* Actual-size FAB preview */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: bg,
            color: ink,
            display: 'grid',
            placeItems: 'center',
            boxShadow: `0 0 28px rgba(${rgb}, 0.45), 0 10px 22px rgba(0,0,0,0.35)`,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M21 11.5c0 4.14-4.03 7.5-9 7.5-1.06 0-2.08-.15-3.02-.43L4 20l1.18-3.55C4.05 15.13 3 13.42 3 11.5 3 7.36 7.03 4 12 4s9 3.36 9 7.5Z"
              fill="#04121f"
            />
            <circle cx="8.6" cy="11.5" r="1.15" fill={color} />
            <circle cx="12" cy="11.5" r="1.15" fill={color} />
            <circle cx="15.4" cy="11.5" r="1.15" fill={color} />
          </svg>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 14,
          bottom: 12,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.38)',
        }}
      >
        Live preview
      </div>
    </div>
  )
}

type ColorSwatchPickerProps = {
  value: string
  onChange: (hex: string) => void
  border?: string
  panel?: string
  text?: string
  muted?: string
}

export function ColorSwatchPicker({
  value,
  onChange,
  border = 'var(--bk-border)',
  panel = 'var(--bk-card)',
  text = 'var(--bk-head)',
  muted = 'var(--bk-body)',
}: ColorSwatchPickerProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value))
  const [hexDraft, setHexDraft] = useState(value)
  const sqRef = useRef<HTMLDivElement | null>(null)
  const hueRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef<'sv' | 'hue' | null>(null)

  useEffect(() => {
    const parsed = parseWidgetLauncherColor(value)
    if (!parsed) return
    setHexDraft(parsed)
    setHsv((prev) => {
      const next = hexToHsv(parsed)
      if (next.s < 0.01 && next.v > 0.99) return { ...prev, s: next.s, v: next.v }
      if (next.v < 0.01) return { ...prev, s: next.s, v: next.v }
      return next
    })
  }, [value])

  const commit = useCallback(
    (next: Hsv) => {
      setHsv(next)
      const hex = hsvToHex(next)
      setHexDraft(hex)
      onChange(hex)
    },
    [onChange],
  )

  const pickSv = useCallback(
    (clientX: number, clientY: number) => {
      const el = sqRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const s = clamp((clientX - rect.left) / rect.width, 0, 1)
      const v = 1 - clamp((clientY - rect.top) / rect.height, 0, 1)
      commit({ ...hsv, s, v })
    },
    [commit, hsv],
  )

  const pickHue = useCallback(
    (clientX: number) => {
      const el = hueRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const h = clamp(((clientX - rect.left) / rect.width) * 360, 0, 359.9)
      commit({ ...hsv, h })
    },
    [commit, hsv],
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragging.current === 'sv') pickSv(e.clientX, e.clientY)
      if (dragging.current === 'hue') pickHue(e.clientX)
    }
    const onUp = () => {
      dragging.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [pickHue, pickSv])

  const pureHue = hueCss(hsv.h)
  const selected = hsvToHex(hsv)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        alignItems: 'stretch',
      }}
    >
      <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
        <div
          ref={sqRef}
          role="slider"
          aria-label="Saturation and brightness"
          aria-valuetext={selected}
          tabIndex={0}
          onPointerDown={(e) => {
            dragging.current = 'sv'
            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
            pickSv(e.clientX, e.clientY)
          }}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '1.15 / 1',
            maxHeight: 240,
            borderRadius: 14,
            border: `1px solid ${border}`,
            cursor: 'crosshair',
            background: `
              linear-gradient(to top, #000, transparent),
              linear-gradient(to right, #fff, ${pureHue})
            `,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)',
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              width: 18,
              height: 18,
              marginLeft: -9,
              marginTop: -9,
              borderRadius: '50%',
              border: '2.5px solid #fff',
              boxShadow: '0 0 0 1px rgba(15,23,42,0.4), 0 3px 10px rgba(15,23,42,0.35)',
              background: selected,
              pointerEvents: 'none',
            }}
          />
        </div>

        <div
          ref={hueRef}
          role="slider"
          aria-label="Hue"
          tabIndex={0}
          onPointerDown={(e) => {
            dragging.current = 'hue'
            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
            pickHue(e.clientX)
          }}
          style={{
            position: 'relative',
            width: '100%',
            height: 18,
            borderRadius: 999,
            border: `1px solid ${border}`,
            cursor: 'pointer',
            background:
              'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: `${(hsv.h / 360) * 100}%`,
              top: '50%',
              width: 20,
              height: 20,
              marginLeft: -10,
              marginTop: -10,
              borderRadius: '50%',
              border: '2.5px solid #fff',
              boxShadow: '0 0 0 1px rgba(15,23,42,0.3), 0 2px 8px rgba(15,23,42,0.3)',
              background: pureHue,
              pointerEvents: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            aria-hidden
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              border: `1px solid ${border}`,
              background: selected,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 12px ${selected}50`,
              flexShrink: 0,
            }}
          />
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => {
              setHexDraft(e.target.value)
              const next = parseWidgetLauncherColor(e.target.value)
              if (next) {
                setHsv(hexToHsv(next))
                onChange(next)
              }
            }}
            onBlur={() => {
              const next = parseWidgetLauncherColor(hexDraft)
              if (next) {
                setHexDraft(next)
                setHsv(hexToHsv(next))
                onChange(next)
              } else {
                setHexDraft(selected)
              }
            }}
            spellCheck={false}
            aria-label="Color hex value"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '9px 11px',
              borderRadius: 10,
              border: `1px solid ${border}`,
              background: panel,
              color: text,
              fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              letterSpacing: '0.02em',
            }}
          />
          <span style={{ fontSize: 11, color: muted, flexShrink: 0 }}>{selected}</span>
        </div>
      </div>

      <LauncherPreview color={selected} />
    </div>
  )
}
