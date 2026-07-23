'use client'

import { Fragment, useId, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import type { AnalyticsBucket, AnalyticsRange, AnalyticsReport } from '@/lib/analytics'
import { bk, bkCard } from '@/lib/bookings-compact-ui'

// ── shared tokens ───────────────────────────────────────────────────────────
const ACCENT = 'var(--bk-accent)'
const INDIGO = 'var(--bk-indigo)'
const HEAD = 'var(--bk-head)'
const BODY = 'var(--bk-body)'
const MUTED = 'var(--bk-muted)'

const RANGE_OPTIONS: { id: AnalyticsRange; label: string; short: string }[] = [
  { id: '7d', label: '7 days', short: '7D' },
  { id: '30d', label: '30 days', short: '30D' },
  { id: '90d', label: '90 days', short: '90D' },
  { id: '12m', label: '12 months', short: '12M' },
]

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export type MessageStats = {
  count: number
  medianReplySeconds: number | null
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtDuration(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 1) return '<1s'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) {
    const rest = s % 60
    return rest > 0 ? `${m}m ${rest}s` : `${m}m`
  }
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

const nfmt = new Intl.NumberFormat('en-CA')

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
  return String(Math.round(n))
}

function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Nice round axis ceiling so ticks land on whole numbers. */
function niceMax(v: number): number {
  if (v <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(v))
  const step10 = v / pow <= 2 ? pow / 2 : v / pow <= 5 ? pow : pow * 2
  return Math.ceil(v / step10) * step10
}

/**
 * Monotone cubic (Fritsch–Carlson) spline through the points — never overshoots
 * the data, so a flat run of zeros stays exactly on the baseline.
 */
function smoothPath(points: { x: number; y: number }[]): string {
  const n = points.length
  if (n === 0) return ''
  if (n === 1) return `M ${points[0].x} ${points[0].y}`
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const h = points[i + 1].x - points[i].x || 1e-6
    dx.push(h)
    slope.push((points[i + 1].y - points[i].y) / h)
  }
  const m: number[] = [slope[0]]
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m.push(0)
    } else {
      const w1 = 2 * dx[i] + dx[i - 1]
      const w2 = dx[i] + 2 * dx[i - 1]
      m.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]))
    }
  }
  m.push(slope[n - 2])
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]
    const c1x = points[i].x + h / 3
    const c1y = points[i].y + (m[i] * h) / 3
    const c2x = points[i + 1].x - h / 3
    const c2y = points[i + 1].y - (m[i + 1] * h) / 3
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${points[i + 1].x.toFixed(1)} ${points[i + 1].y.toFixed(1)}`
  }
  return d
}

// ── delta pill ──────────────────────────────────────────────────────────────
function DeltaPill({ pct, size = 'md' }: { pct: number; size?: 'sm' | 'md' }) {
  const up = pct >= 0
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: size === 'sm' ? '1px 6px' : '2px 7px',
        borderRadius: 99,
        fontSize: size === 'sm' ? 10 : 11,
        fontWeight: 700,
        letterSpacing: '0.01em',
        color: up ? 'var(--bk-green)' : 'var(--bk-danger)',
        background: up ? 'var(--bk-green-bg)' : 'var(--bk-danger-bg)',
      }}
    >
      <span style={{ fontSize: size === 'sm' ? 8 : 9, lineHeight: 1 }}>{up ? '▲' : '▼'}</span>
      {Math.abs(pct)}%
    </span>
  )
}

// ── mini sparkline for the stat strip ────────────────────────────────────────
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const gid = `spark${useId().replace(/:/g, '')}`
  const W = 108
  const H = 30
  const n = values.length
  if (n < 2) return <div style={{ height: H }} />
  const max = Math.max(1, ...values)
  const step = W / (n - 1)
  const pts = values.map((v, i) => ({ x: i * step, y: H - 3 - (v / max) * (H - 6) }))
  const line = smoothPath(pts)
  const area = `${line} L ${W} ${H} L 0 ${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── stat strip ───────────────────────────────────────────────────────────────
type Stat = {
  label: string
  value: string
  delta?: number | null
  sub?: string
  spark?: { values: number[]; color: string }
  muted?: boolean
}

function StatStrip({ stats, isMobile }: { stats: Stat[]; isMobile: boolean }) {
  return (
    <div
      style={{
        ...bkCard,
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : `repeat(${stats.length}, 1fr)`,
        overflow: 'hidden',
      }}
    >
      {stats.map((s, i) => {
        const border = isMobile
          ? {
              borderLeft: i % 2 === 1 ? '1px solid var(--bk-border)' : undefined,
              borderTop: i >= 2 ? '1px solid var(--bk-border)' : undefined,
            }
          : { borderLeft: i > 0 ? '1px solid var(--bk-border)' : undefined }
        return (
          <div key={s.label} style={{ padding: '16px 18px', display: 'grid', gap: 8, alignContent: 'start', ...border }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
              {s.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: s.muted ? MUTED : HEAD,
                  letterSpacing: '-0.035em',
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s.value}
              </span>
              {s.delta != null && <DeltaPill pct={s.delta} size="sm" />}
            </div>
            {s.spark ? (
              <div style={{ marginTop: 2 }}>
                <Sparkline values={s.spark.values} color={s.spark.color} />
              </div>
            ) : s.sub ? (
              <div style={{ fontSize: 11.5, color: BODY, minHeight: 30, display: 'flex', alignItems: 'flex-end' }}>{s.sub}</div>
            ) : (
              <div style={{ minHeight: 30 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── main trend chart ─────────────────────────────────────────────────────────
type ChartMetric = 'bookings' | 'covers'

const METRIC_META: Record<ChartMetric, { label: string; color: string; from: string; to: string; unit: string }> = {
  bookings: { label: 'Bookings', color: ACCENT, from: '#0ea5e9', to: '#38bdf8', unit: 'booking' },
  covers: { label: 'Guests', color: INDIGO, from: '#6366f1', to: '#a78bfa', unit: 'guest' },
}

function TrendChart({
  series,
  prevSeries,
  isMobile,
  metric,
  compare,
}: {
  series: AnalyticsBucket[]
  prevSeries: AnalyticsBucket[]
  isMobile: boolean
  metric: ChartMetric
  compare: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const meta = METRIC_META[metric]

  const W = 760
  const H = isMobile ? 220 : 280
  const PAD_L = 40
  const PAD_R = 16
  const PAD_B = 30
  const PAD_T = 22
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const n = series.length
  const step = innerW / Math.max(1, n - 1 || 1)
  const isDaily = (series[0]?.key.length ?? 0) === 10

  const pick = (b: AnalyticsBucket) => (metric === 'bookings' ? b.bookings : b.covers)
  const values = series.map(pick)
  const prevValues = prevSeries.map(pick)
  const prevN = Math.min(n, prevValues.length)

  const maxVal = Math.max(1, ...values, ...(compare ? prevValues.slice(0, prevN) : []))
  const axisMax = niceMax(maxVal)

  const yFor = (v: number) => PAD_T + innerH - (v / axisMax) * innerH
  const xFor = (i: number) => (n <= 1 ? PAD_L + innerW / 2 : PAD_L + i * step)

  const points = series.map((b, i) => ({ x: xFor(i), y: yFor(values[i]) }))
  const linePath = smoothPath(points)
  const baseY = PAD_T + innerH
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L ${points[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`
      : ''
  const prevPath = compare
    ? smoothPath(Array.from({ length: prevN }, (_, i) => ({ x: xFor(i), y: yFor(prevValues[i]) })))
    : ''

  const peakVal = Math.max(0, ...values)
  const peakIdx = values.indexOf(peakVal)

  const tickDiv = [4, 5, 3, 2].find((d) => axisMax % d === 0) ?? 4
  const gridLines = Array.from({ length: tickDiv + 1 }, (_, i) => {
    const v = (axisMax / tickDiv) * i
    return { first: i === 0, y: yFor(v), v }
  })

  const labelEvery = Math.max(1, Math.ceil(n / (isMobile ? 4 : 7)))
  const focus = hover != null ? hover : points.length - 1
  const focused = focus >= 0 ? series[focus] : null
  const areaId = `an-area-${metric}`
  const strokeId = `an-stroke-${metric}`
  const glowId = `an-glow-${metric}`

  const prevVal = focus > 0 ? values[focus - 1] : null
  const deltaPct = focused != null && prevVal != null && prevVal > 0 ? Math.round(((values[focus] - prevVal) / prevVal) * 100) : null

  const prevPeriodVal = compare && focus >= 0 && focus < prevN ? prevValues[focus] : null
  const focusWeekday = focused != null && isDaily ? WEEKDAY_LABELS[weekdayOfKey(focused.key)] : null

  const tooltipLeftPct = focus >= 0 ? (xFor(focus) / W) * 100 : 0

  const focusFromPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round((px - PAD_L) / step)
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div style={{ position: 'relative' }}>
      <style>{`
        @keyframes anDraw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes anAreaIn { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .an-draw, .an-areaIn { animation: none !important; } }
      `}</style>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible', touchAction: 'pan-y' }}
        onPointerMove={focusFromPointer}
        onPointerDown={focusFromPointer}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={meta.color} stopOpacity="0.26" />
            <stop offset="45%" stopColor={meta.color} stopOpacity="0.10" />
            <stop offset="100%" stopColor={meta.color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={meta.from} />
            <stop offset="100%" stopColor={meta.to} />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-60%" width="140%" height="220%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor={meta.color} floodOpacity="0.28" />
          </filter>
        </defs>

        {/* hairline gridlines */}
        {gridLines.map((g) => (
          <g key={g.y}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={g.y}
              y2={g.y}
              stroke={g.first ? 'var(--bk-border)' : 'var(--bk-grid)'}
              strokeWidth="1"
            />
            <text x={PAD_L - 10} y={g.y + 3.5} fontSize="10.5" fill={MUTED} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtCompact(g.v)}
            </text>
          </g>
        ))}

        {/* previous-period ghost */}
        {compare && prevPath && (
          <path
            d={prevPath}
            fill="none"
            stroke="var(--bk-muted)"
            strokeWidth="1.6"
            strokeDasharray="5 5"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.7"
          />
        )}

        {/* area + line */}
        <path className="an-areaIn" d={areaPath} fill={`url(#${areaId})`} style={{ animation: 'anAreaIn 0.7s ease both' }} />
        <path
          className="an-draw"
          d={linePath}
          fill="none"
          stroke={`url(#${strokeId})`}
          strokeWidth="2.75"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          pathLength={1}
          style={{ strokeDasharray: 1, animation: 'anDraw 1s cubic-bezier(0.22,1,0.36,1) forwards' }}
        />

        {/* peak marker (hollow) when it isn't the focused point */}
        {peakVal > 0 && peakIdx !== focus && (
          <g opacity="0.9">
            <circle cx={xFor(peakIdx)} cy={yFor(peakVal)} r="3" fill="var(--bk-card)" stroke={meta.color} strokeWidth="1.5" />
            <text x={xFor(peakIdx)} y={yFor(peakVal) - 9} fontSize="9.5" fontWeight="700" fill={meta.color} textAnchor="middle">
              {fmtCompact(peakVal)}
            </text>
          </g>
        )}

        {/* hover guide */}
        {hover != null && (
          <line
            x1={xFor(focus)}
            x2={xFor(focus)}
            y1={PAD_T - 2}
            y2={baseY}
            stroke="var(--bk-border-strong)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        )}

        {/* comparison marker */}
        {compare && prevPeriodVal != null && (
          <circle cx={xFor(focus)} cy={yFor(prevPeriodVal)} r="3" fill="var(--bk-card)" stroke="var(--bk-muted)" strokeWidth="1.5" />
        )}

        {/* focus dot */}
        {focused != null && (
          <>
            <circle cx={xFor(focus)} cy={yFor(values[focus])} r="8" fill={meta.color} opacity="0.14" />
            <circle cx={xFor(focus)} cy={yFor(values[focus])} r="4.5" fill="var(--bk-card)" stroke={meta.color} strokeWidth="2.5" />
          </>
        )}

        {/* x labels */}
        {series.map((b, i) =>
          i % labelEvery === 0 ? (
            <text key={b.key} x={xFor(i)} y={H - 8} fontSize="10.5" fill={MUTED} textAnchor="middle">
              {b.label}
            </text>
          ) : null,
        )}
      </svg>

      {hover != null && focused != null && (
        <div
          style={{
            position: 'absolute',
            left: `${tooltipLeftPct}%`,
            top: -4,
            transform: `translate(${tooltipLeftPct < 14 ? '0%' : tooltipLeftPct > 86 ? '-100%' : '-50%'}, -100%)`,
            background: 'var(--bk-inverse)',
            color: '#fff',
            borderRadius: 11,
            padding: '9px 13px',
            fontSize: bk.caption,
            display: 'grid',
            gap: 4,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: 'var(--bk-shadow-pop)',
            zIndex: 2,
          }}
        >
          <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: 10.5, letterSpacing: '0.02em' }}>
            {focusWeekday ? `${focusWeekday} · ` : ''}
            {focused.label}
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>
              {nfmt.format(values[focus])}
            </span>
            <span style={{ color: '#cbd5e1', fontSize: 11 }}>
              {meta.unit}
              {values[focus] === 1 ? '' : 's'}
            </span>
            {deltaPct != null && (
              <span style={{ color: deltaPct >= 0 ? '#4ade80' : '#f87171', fontWeight: 700, fontSize: 11 }}>
                {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}%
              </span>
            )}
          </span>
          {prevPeriodVal != null && (
            <span style={{ color: '#94a3b8', fontSize: 10.5 }}>
              Prev period: <b style={{ color: '#e2e8f0' }}>{nfmt.format(prevPeriodVal)}</b>
            </span>
          )}
          {focused.cancelled > 0 && <span style={{ color: '#fca5a5', fontSize: 10.5 }}>{focused.cancelled} cancelled</span>}
        </div>
      )}
    </div>
  )
}

// ── new vs returning ─────────────────────────────────────────────────────────
function GuestMixChart({ series, isMobile }: { series: AnalyticsBucket[]; isMobile: boolean }) {
  const [hover, setHover] = useState<number | null>(null)

  const W = 720
  const H = 180
  const PAD_L = 26
  const PAD_R = 8
  const PAD_B = 26
  const PAD_T = 12
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const axisMax = niceMax(Math.max(1, ...series.map((b) => b.newGuests + b.returningGuests)))
  const n = series.length
  const step = innerW / Math.max(1, n)
  const barW = Math.max(3, Math.min(20, step * 0.56))
  const labelEvery = Math.max(1, Math.ceil(n / (isMobile ? 4 : 8)))
  const yFor = (v: number) => PAD_T + innerH - (v / axisMax) * innerH

  const gridLines = [0, 0.5, 1].map((f) => ({ y: yFor(axisMax * f), v: Math.round(axisMax * f) }))
  const hovered = hover != null ? series[hover] : null
  const tooltipLeftPct = hover != null ? ((PAD_L + hover * step + step / 2) / W) * 100 : 0

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="gm-new" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
        {gridLines.map((g) => (
          <g key={g.y}>
            <line x1={PAD_L} x2={W - PAD_R} y1={g.y} y2={g.y} stroke="var(--bk-grid)" strokeWidth="1" />
            <text x={PAD_L - 8} y={g.y + 3} fontSize="10" fill={MUTED} textAnchor="end">
              {g.v}
            </text>
          </g>
        ))}
        {series.map((b, i) => {
          const x = PAD_L + i * step + step / 2 - barW / 2
          const total = b.newGuests + b.returningGuests
          const hTotal = (total / axisMax) * innerH
          const hNew = total > 0 ? (b.newGuests / axisMax) * innerH : 0
          const yTop = PAD_T + innerH - hTotal
          const dim = hover != null && hover !== i
          return (
            <g key={b.key} style={{ opacity: dim ? 0.38 : 1, transition: 'opacity 0.15s ease' }}>
              {total > 0 && (
                <>
                  <rect x={x} y={yTop} width={barW} height={Math.max(0, hTotal - hNew)} rx="4" fill="var(--bk-guest-return)" />
                  <rect x={x} y={PAD_T + innerH - hNew} width={barW} height={hNew} rx="4" fill="url(#gm-new)" />
                </>
              )}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 8} fontSize="10" fill={MUTED} textAnchor="middle">
                  {b.label}
                </text>
              )}
              <rect x={PAD_L + i * step} y={0} width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          )
        })}
      </svg>

      {hovered && (
        <div
          style={{
            position: 'absolute',
            left: `${tooltipLeftPct}%`,
            bottom: 30,
            transform: `translateX(${tooltipLeftPct < 12 ? '0%' : tooltipLeftPct > 88 ? '-100%' : '-50%'})`,
            background: 'var(--bk-inverse)',
            color: '#fff',
            borderRadius: 9,
            padding: '8px 12px',
            fontSize: bk.caption,
            display: 'grid',
            gap: 3,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: 'var(--bk-shadow-pop)',
            zIndex: 2,
          }}
        >
          <span style={{ fontWeight: 700 }}>{hovered.label}</span>
          <span style={{ color: '#e2e8f0' }}>
            <span style={{ color: '#38bdf8' }}>●</span> {hovered.newGuests} new{'   '}
            <span style={{ color: 'var(--bk-guest-return)' }}>●</span> {hovered.returningGuests} returning
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>
        <LegendDot color={ACCENT} label="New guests" />
        <LegendDot color="var(--bk-guest-return)" label="Returning" />
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: bk.caption, color: BODY }}>
      <span style={{ width: 9, height: 9, borderRadius: 99, background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

// ── zone occupancy ────────────────────────────────────────────────────────────
function ZoneOccupancy({ zones }: { zones: AnalyticsReport['zones'] }) {
  if (zones.length === 0) {
    return <div style={{ fontSize: bk.body, color: MUTED }}>No dining zones configured.</div>
  }
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {zones.map((z) => {
        const hot = z.peakUtilizationPct != null && z.peakUtilizationPct >= 90
        return (
          <div key={z.zoneId} style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: bk.body, fontWeight: 600, color: HEAD }}>{z.zoneName}</span>
              <span style={{ fontSize: bk.caption, color: BODY, fontVariantNumeric: 'tabular-nums' }}>
                {z.bookings} bookings · {z.covers} guests
                {z.peakUtilizationPct != null && (
                  <>
                    {' · '}
                    <span style={{ color: hot ? 'var(--bk-amber)' : BODY, fontWeight: hot ? 700 : 400 }}>
                      peak {z.peakUtilizationPct}%
                    </span>
                  </>
                )}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: 'var(--bk-surface)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, z.sharePct)}%`,
                  height: '100%',
                  borderRadius: 99,
                  background: hot ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #0ea5e9, #38bdf8)',
                  transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── peak hours heatmap ────────────────────────────────────────────────────────
const fmtHour = (h: number) => {
  const period = h < 12 ? 'a' : 'p'
  const d = h % 12 === 0 ? 12 : h % 12
  return `${d}${period}`
}

function PeakHoursHeatmap({
  heatmap,
  heatmapMax,
  hourRange,
}: {
  heatmap: AnalyticsReport['heatmap']
  heatmapMax: number
  hourRange: AnalyticsReport['heatmapHourRange']
}) {
  if (!hourRange || heatmapMax === 0) {
    return <div style={{ fontSize: bk.body, color: MUTED, padding: '12px 0' }}>No booking activity yet.</div>
  }
  const start = Math.max(0, hourRange.start - 1)
  const end = Math.min(23, hourRange.end + 1)
  const hours: number[] = []
  for (let h = start; h <= end; h++) hours.push(h)

  const byKey = new Map(heatmap.map((c) => [`${c.weekday}-${c.hour}`, c.count]))
  const weekdays = [1, 2, 3, 4, 5, 6, 0]
  // Square-root scale keeps mid cells visible next to a single dominant peak.
  const alphaFor = (count: number) => (count === 0 ? 0 : 0.1 + 0.9 * Math.sqrt(count / heatmapMax))
  const cellBg = (count: number) =>
    count === 0 ? 'var(--bk-surface)' : `color-mix(in srgb, var(--bk-accent) ${Math.round(alphaFor(count) * 100)}%, transparent)`

  const cols = `28px repeat(${hours.length}, minmax(0, 1fr))`

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 5, alignItems: 'center' }}>
        {/* hour header */}
        <div />
        {hours.map((h) => (
          <div key={`h-${h}`} style={{ fontSize: 9.5, fontWeight: 500, color: MUTED, textAlign: 'center' }}>
            {fmtHour(h)}
          </div>
        ))}
        {/* rows */}
        {weekdays.map((wd) => (
          <Fragment key={wd}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: BODY }}>{WEEKDAY_LABELS[wd]}</div>
            {hours.map((h) => {
              const count = byKey.get(`${wd}-${h}`) ?? 0
              return (
                <div
                  key={`${wd}-${h}`}
                  title={`${WEEKDAY_LABELS[wd]} ${fmtHour(h)} · ${count} booking${count === 1 ? '' : 's'}`}
                  style={{ height: 26, borderRadius: 6, background: cellBg(count) }}
                />
              )
            })}
          </Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: bk.micro, color: MUTED }}>Less</span>
        {[0.14, 0.35, 0.55, 0.78, 1].map((a) => (
          <span
            key={a}
            style={{
              width: 15,
              height: 13,
              borderRadius: 3,
              background: `color-mix(in srgb, var(--bk-accent) ${Math.round(a * 100)}%, transparent)`,
              display: 'inline-block',
            }}
          />
        ))}
        <span style={{ fontSize: bk.micro, color: MUTED }}>More</span>
      </div>
    </div>
  )
}

/** Busiest weekday+hour, formatted like "Fri 7pm", or null when no activity. */
function busiestWindow(heatmap: AnalyticsReport['heatmap']): string | null {
  let best: AnalyticsReport['heatmap'][number] | null = null
  for (const c of heatmap) if (!best || c.count > best.count) best = c
  if (!best || best.count === 0) return null
  const h = best.hour % 12 === 0 ? 12 : best.hour % 12
  return `${WEEKDAY_LABELS[best.weekday]} ${h}${best.hour < 12 ? 'am' : 'pm'}`
}

// ── section shell ─────────────────────────────────────────────────────────────
function Panel({
  title,
  desc,
  right,
  children,
}: {
  title: string
  desc?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section style={{ ...bkCard, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 3 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: HEAD, letterSpacing: '-0.01em' }}>{title}</h2>
          {desc && <p style={{ margin: 0, fontSize: bk.caption, color: BODY }}>{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

// ── segmented control ─────────────────────────────────────────────────────────
function MetricToggle({ value, onChange }: { value: ChartMetric; onChange: (m: ChartMetric) => void }) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--bk-surface)', borderRadius: 9, padding: 3, gap: 2 }}>
      {(['bookings', 'covers'] as ChartMetric[]).map((m) => {
        const active = m === value
        const meta = METRIC_META[m]
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            style={{
              border: 'none',
              borderRadius: 7,
              padding: '5px 11px',
              fontSize: bk.caption,
              fontWeight: 700,
              cursor: 'pointer',
              background: active ? 'var(--bk-toggle-active)' : 'transparent',
              color: active ? meta.color : BODY,
              boxShadow: active ? 'var(--bk-shadow-md)' : 'none',
              transition: 'background 0.15s, color 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 99, background: meta.color, display: 'inline-block' }} />
            {meta.label}
          </button>
        )
      })}
    </div>
  )
}

// ── the page view ─────────────────────────────────────────────────────────────
export type AnalyticsViewProps = {
  report: AnalyticsReport
  range: AnalyticsRange
  onRangeChange: (r: AnalyticsRange) => void
  messageStats: MessageStats | null
  avgCheck: number
  onSaveAvgCheck: (value: number) => Promise<boolean>
  loading: boolean
  error: string | null
  hasAnyData: boolean
}

export function AnalyticsView({
  report,
  range,
  onRangeChange,
  messageStats,
  avgCheck,
  onSaveAvgCheck,
  loading,
  error,
  hasAnyData,
}: AnalyticsViewProps) {
  const [chartMetric, setChartMetric] = useState<ChartMetric>('bookings')
  const [compare, setCompare] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [editingCheck, setEditingCheck] = useState(false)
  const [checkDraft, setCheckDraft] = useState('')
  const [savingCheck, setSavingCheck] = useState(false)

  const k = report.kpis
  const estRevenue = avgCheck > 0 ? k.covers * avgCheck : null
  const rangeLabel = RANGE_OPTIONS.find((r) => r.id === range)?.label ?? ''

  const bookingSpark = report.series.map((b) => b.bookings)
  const coverSpark = report.series.map((b) => b.covers)

  const primaryStats: Stat[] = [
    { label: 'Bookings', value: nfmt.format(k.bookings), delta: k.bookingsDeltaPct, spark: { values: bookingSpark, color: ACCENT } },
    { label: 'Guests served', value: nfmt.format(k.covers), delta: k.coversDeltaPct, spark: { values: coverSpark, color: INDIGO } },
    {
      label: 'Cancellations',
      value: `${k.cancellationRate}%`,
      sub: `${k.noShowRate}% no-shows · avg party ${k.avgPartySize != null ? k.avgPartySize.toFixed(1) : '—'}`,
    },
  ]

  const trendTotal = chartMetric === 'bookings' ? k.bookings : k.covers
  const trendDelta = chartMetric === 'bookings' ? k.bookingsDeltaPct : k.coversDeltaPct
  const busiest = busiestWindow(report.heatmap)

  const saveCheck = async () => {
    const parsed = parseFloat(checkDraft)
    const value = Number.isFinite(parsed) && parsed >= 0 ? Math.min(100000, parsed) : 0
    setSavingCheck(true)
    const ok = await onSaveAvgCheck(value)
    setSavingCheck(false)
    if (ok) setEditingCheck(false)
  }

  return (
    <DashboardOceanNav activeNav="Analytics" flatBackground="var(--bk-bg)">
      {({ isMobile, openNav }) => (
        <main
          style={{
            background: 'var(--bk-bg)',
            minHeight: '100vh',
            margin: isMobile ? '-20px -16px' : '-36px',
            padding: isMobile ? bk.pagePadMobile : bk.pagePad,
            display: 'grid',
            gap: 16,
            alignContent: 'start',
            fontFamily: bk.font,
          }}
        >
          {isMobile && (
            <button
              type="button"
              onClick={openNav}
              aria-label="Open navigation"
              style={{ width: 40, height: 40, borderRadius: 10, border: bk.border, background: 'var(--bk-card)', fontSize: 18, cursor: 'pointer', justifySelf: 'start' }}
            >
              ☰
            </button>
          )}

          {/* header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: bk.micro, fontWeight: 700, color: MUTED, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Reports</div>
              <h1 style={{ margin: '5px 0 0', fontSize: 27, fontWeight: 700, color: HEAD, letterSpacing: '-0.035em' }}>Analytics</h1>
              <p style={{ margin: '4px 0 0', fontSize: bk.body, color: BODY }}>
                {loading ? 'Loading analytics…' : `Bookings, guests and occupancy over the last ${rangeLabel}`}
              </p>
            </div>

            <div style={{ display: 'inline-flex', background: 'var(--bk-card)', borderRadius: 10, border: bk.border, padding: 3, gap: 2, boxShadow: 'var(--bk-shadow)' }}>
              {RANGE_OPTIONS.map((opt) => {
                const active = opt.id === range
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onRangeChange(opt.id)}
                    style={{
                      border: 'none',
                      borderRadius: 8,
                      padding: '7px 13px',
                      fontSize: bk.body,
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      background: active ? 'var(--bk-inverse)' : 'transparent',
                      color: active ? 'var(--bk-inverse-text)' : BODY,
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {isMobile ? opt.short : opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {error && <div style={{ ...bkCard, padding: bk.cardPad, color: 'var(--bk-danger)', fontSize: bk.body }}>{error}</div>}

          {loading ? (
            <AnalyticsSkeleton isMobile={isMobile} />
          ) : !hasAnyData ? (
            <div style={{ ...bkCard, padding: '48px 40px', textAlign: 'center', display: 'grid', gap: 8, justifyItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--bk-accent-soft)', display: 'grid', placeItems: 'center', color: ACCENT }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: HEAD }}>No data yet</div>
              <div style={{ fontSize: bk.body, color: BODY, maxWidth: 320 }}>
                Analytics appear here once your first reservations come in. New bookings show up within a minute.
              </div>
            </div>
          ) : (
            <>
              <StatStrip stats={primaryStats} isMobile={isMobile} />

              {/* main trend */}
              <Panel
                title={chartMetric === 'bookings' ? 'Bookings over time' : 'Guests over time'}
                right={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setCompare((c) => !c)}
                      title="Overlay the previous period"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        border: 'none',
                        borderRadius: 9,
                        padding: '7px 12px',
                        fontSize: bk.caption,
                        fontWeight: 700,
                        cursor: 'pointer',
                        background: compare ? 'var(--bk-inverse)' : 'var(--bk-surface)',
                        color: compare ? 'var(--bk-inverse-text)' : BODY,
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      <span style={{ width: 13, borderTop: '2px dashed currentColor', display: 'inline-block', opacity: 0.7 }} />
                      Compare
                    </button>
                    <MetricToggle value={chartMetric} onChange={setChartMetric} />
                  </div>
                }
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: -4, marginBottom: 8 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: HEAD, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {nfmt.format(trendTotal)}
                  </span>
                  {trendDelta != null && <DeltaPill pct={trendDelta} />}
                  <span style={{ fontSize: bk.caption, color: MUTED }}>vs previous {rangeLabel}</span>
                </div>
                <TrendChart series={report.series} prevSeries={report.prevSeries} isMobile={isMobile} metric={chartMetric} compare={compare} />
                {compare && (
                  <div style={{ display: 'flex', gap: 18, marginTop: 10, alignItems: 'center' }}>
                    <LegendDot color={METRIC_META[chartMetric].color} label={`This ${rangeLabel}`} />
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: bk.caption, color: BODY }}>
                      <span style={{ width: 15, borderTop: '2px dashed var(--bk-muted)', display: 'inline-block' }} />
                      Previous {rangeLabel}
                    </span>
                  </div>
                )}
              </Panel>

              {/* secondary stats, revealed */}
              <div style={{ justifySelf: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowMore((v) => !v)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    border: bk.border,
                    borderRadius: 99,
                    padding: '6px 15px',
                    fontSize: bk.caption,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: 'var(--bk-card)',
                    color: BODY,
                    boxShadow: 'var(--bk-shadow)',
                    transition: 'color 0.15s',
                  }}
                >
                  {showMore ? 'Fewer metrics' : 'More metrics'}
                  <span style={{ fontSize: 8, lineHeight: 1, transform: showMore ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>▼</span>
                </button>
              </div>

              {showMore && (
                <StatStrip
                  isMobile={isMobile}
                  stats={[
                    { label: 'Messages', value: messageStats ? nfmt.format(messageStats.count) : '…', sub: 'guest & AI messages' },
                    {
                      label: 'Median reply',
                      value: messageStats ? (messageStats.medianReplySeconds != null ? fmtDuration(messageStats.medianReplySeconds) : '—') : '…',
                      sub: 'AI response time',
                    },
                    estRevenue != null
                      ? { label: 'Est. revenue', value: fmtMoney(estRevenue), sub: `${fmtMoney(avgCheck)} avg check` }
                      : { label: 'Est. revenue', value: 'Set up', sub: 'add an average check', muted: true },
                  ]}
                />
              )}

              {/* avg-check editor row */}
              {showMore && (
                <div style={{ justifySelf: 'center', marginTop: -6 }}>
                  {editingCheck ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <input
                        type="number"
                        min={0}
                        value={checkDraft}
                        onChange={(e) => setCheckDraft(e.target.value)}
                        placeholder="Avg check per guest"
                        autoFocus
                        style={{ width: 170, padding: '7px 10px', borderRadius: 8, border: bk.border, fontSize: bk.body, background: 'var(--bk-card)', color: HEAD }}
                      />
                      <button
                        type="button"
                        onClick={() => void saveCheck()}
                        disabled={savingCheck}
                        style={{ border: 'none', borderRadius: 8, padding: '7px 13px', background: 'var(--bk-inverse)', color: 'var(--bk-inverse-text)', fontSize: bk.caption, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {savingCheck ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCheck(false)}
                        style={{ border: bk.border, borderRadius: 8, padding: '7px 13px', background: 'var(--bk-card)', color: BODY, fontSize: bk.caption, cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setCheckDraft(avgCheck > 0 ? String(avgCheck) : '')
                        setEditingCheck(true)
                      }}
                      style={{ border: 'none', background: 'none', padding: 0, fontSize: bk.caption, color: ACCENT, cursor: 'pointer', fontWeight: 600 }}
                    >
                      {avgCheck > 0 ? 'Edit average check →' : 'Set average check per guest →'}
                    </button>
                  )}
                </div>
              )}

              {/* two-up */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: bk.gapMd }}>
                <Panel
                  title="New vs returning guests"
                  desc={`${k.newGuests} new · ${k.returningGuests} returning · ${k.uniqueGuests} unique`}
                >
                  <GuestMixChart series={report.series} isMobile={isMobile} />
                </Panel>

                <Panel title="Zone occupancy" desc="Share of bookings and peak utilization per zone">
                  <ZoneOccupancy zones={report.zones} />
                </Panel>
              </div>

              {/* peak hours */}
              <Panel
                title="Peak hours"
                desc="Active bookings by weekday and hour (Calgary time)"
                right={
                  busiest ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '5px 11px',
                        borderRadius: 99,
                        background: 'var(--bk-accent-soft)',
                        color: ACCENT,
                        fontSize: bk.caption,
                        fontWeight: 700,
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: ACCENT }} />
                      Busiest · {busiest}
                    </span>
                  ) : undefined
                }
              >
                <PeakHoursHeatmap heatmap={report.heatmap} heatmapMax={report.heatmapMax} hourRange={report.heatmapHourRange} />
              </Panel>
            </>
          )}
        </main>
      )}
    </DashboardOceanNav>
  )
}

// ── loading skeleton ──────────────────────────────────────────────────────────
function AnalyticsSkeleton({ isMobile }: { isMobile: boolean }) {
  const block = (h: number): React.CSSProperties => ({
    height: h,
    borderRadius: 10,
    background: 'linear-gradient(90deg, var(--bk-surface) 0%, var(--bk-surface-2) 50%, var(--bk-surface) 100%)',
    backgroundSize: '200% 100%',
    animation: 'anSkeleton 1.4s ease-in-out infinite',
  })
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <style>{`@keyframes anSkeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } } @media (prefers-reduced-motion: reduce) { [data-skel] { animation: none !important; } }`}</style>
      <div style={{ ...bkCard, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', overflow: 'hidden' }}>
        {Array.from({ length: isMobile ? 2 : 3 }).map((_, i) => (
          <div key={i} style={{ padding: '16px 18px', display: 'grid', gap: 10, borderLeft: i > 0 ? '1px solid var(--bk-border)' : undefined }}>
            <div data-skel style={{ ...block(10), width: '55%' }} />
            <div data-skel style={{ ...block(26), width: '40%' }} />
            <div data-skel style={block(28)} />
          </div>
        ))}
      </div>
      <div style={{ ...bkCard, padding: '18px 20px', display: 'grid', gap: 14 }}>
        <div data-skel style={{ ...block(16), width: 180 }} />
        <div data-skel style={block(isMobile ? 200 : 260)} />
      </div>
    </div>
  )
}
