'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import {
  buildAnalyticsReport,
  reportWindow,
  type AnalyticsAppointmentRow,
  type AnalyticsBucket,
  type AnalyticsRange,
  type AnalyticsZone,
} from '@/lib/analytics'
import { resolveBusinessAccess } from '@/lib/business-access'
import { bk, bkCard } from '@/lib/bookings-compact-ui'
import { parseBookingSettings, type BookingSettings } from '@/lib/booking-settings'
import { supabase } from '@/lib/supabase'

const ACCENT = 'var(--bk-accent)'
const INDIGO = 'var(--bk-indigo)'
const SLATE_HEAD = 'var(--bk-head)'
const SLATE_BODY = 'var(--bk-body)'
const SLATE_MUTED = 'var(--bk-muted)'

const RANGE_OPTIONS: { id: AnalyticsRange; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: '12m', label: '12 months' },
]

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

/** Compact axis formatter — 1200 → "1.2K", 250000 → "250K". */
function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
  return String(Math.round(n))
}

/** Weekday index (0 = Sun) for a daily bucket key "YYYY-MM-DD". */
function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// ─── Delta pill ───────────────────────────────────────────────────────────────

function DeltaPill({ pct }: { pct: number }) {
  const up = pct >= 0
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 8px',
        borderRadius: 99,
        fontSize: 10.5,
        fontWeight: 700,
        color: up ? 'var(--bk-green)' : 'var(--bk-danger)',
        background: up ? 'var(--bk-green-bg)' : 'var(--bk-danger-bg)',
      }}
    >
      {up ? '↑' : '↓'} {Math.abs(pct)}%
    </span>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  deltaPct,
  delay = 0,
}: {
  label: string
  value: string
  sub?: string
  deltaPct?: number | null
  delay?: number
}) {
  return (
    <div
      className="an-card an-rise"
      style={{
        ...bkCard,
        padding: '14px 16px',
        display: 'grid',
        gap: 6,
        alignContent: 'start',
        animationDelay: `${delay}ms`,
      }}
    >
      <div
        style={{
          fontSize: bk.micro,
          fontWeight: 700,
          color: SLATE_MUTED,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: SLATE_HEAD, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
          {value}
        </span>
        {deltaPct != null && <DeltaPill pct={deltaPct} />}
      </div>
      {sub && <div style={{ fontSize: bk.caption, color: SLATE_BODY }}>{sub}</div>}
    </div>
  )
}

// ─── Bookings & covers chart (SVG) ────────────────────────────────────────────

/**
 * Smooth interpolating spline through all points using monotone cubic
 * (Fritsch–Carlson) tangents — unlike Catmull-Rom it never overshoots the
 * data, so a flat run of zeros stays exactly on the baseline.
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

type ChartMetric = 'bookings' | 'covers'

const METRIC_META: Record<
  ChartMetric,
  { label: string; color: string; strokeFrom: string; strokeTo: string; unit: string }
> = {
  bookings: { label: 'Bookings', color: ACCENT, strokeFrom: '#0284c7', strokeTo: '#22d3ee', unit: 'booking' },
  covers: { label: 'Guests', color: INDIGO, strokeFrom: '#4f46e5', strokeTo: '#a78bfa', unit: 'guest' },
}

function MetricToggle({
  value,
  onChange,
}: {
  value: ChartMetric
  onChange: (m: ChartMetric) => void
}) {
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
              color: active ? meta.color : SLATE_BODY,
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

function BookingsChart({
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

  const W = 720
  const H = 230
  const PAD_L = 34
  const PAD_R = 14
  const PAD_B = 26
  const PAD_T = 24
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const n = series.length
  const step = innerW / Math.max(1, n - 1 || 1)
  // Daily keys are "YYYY-MM-DD" (10 chars); month keys are "YYYY-MM".
  const isDaily = (series[0]?.key.length ?? 0) === 10

  const pick = (b: AnalyticsBucket) => (metric === 'bookings' ? b.bookings : b.covers)
  const values = series.map(pick)
  const prevValues = prevSeries.map(pick)
  const prevN = Math.min(n, prevValues.length)

  const maxVal = Math.max(1, ...values, ...(compare ? prevValues.slice(0, prevN) : []))
  const niceMax = (v: number) => {
    if (v <= 4) return 4
    const pow = 10 ** Math.floor(Math.log10(v))
    const step10 = v / pow <= 2 ? pow / 2 : v / pow <= 5 ? pow : pow * 2
    return Math.ceil(v / step10) * step10
  }
  const axisMax = niceMax(maxVal)

  const yFor = (v: number) => PAD_T + innerH - (v / axisMax) * innerH
  const xFor = (i: number) => (n <= 1 ? PAD_L + innerW / 2 : PAD_L + i * step)

  const points = series.map((b, i) => ({ x: xFor(i), y: yFor(values[i]) }))
  const linePath = smoothPath(points)
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(PAD_T + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(PAD_T + innerH).toFixed(1)} Z`
      : ''
  const prevPath = compare
    ? smoothPath(Array.from({ length: prevN }, (_, i) => ({ x: xFor(i), y: yFor(prevValues[i]) })))
    : ''

  const avg = n > 0 ? values.reduce((a, b) => a + b, 0) / n : 0
  const peakVal = Math.max(0, ...values)
  const peakIdx = values.indexOf(peakVal)

  // Pick a division count that splits the axis into whole-number ticks
  // (axisMax = 6 → 0/2/4/6, not the rounded 0/2/3/5/6 of quarter splits).
  const tickDiv = [4, 5, 3, 2].find((d) => axisMax % d === 0) ?? 4
  const gridLines = Array.from({ length: tickDiv + 1 }, (_, i) => {
    const v = (axisMax / tickDiv) * i
    return { f: i / tickDiv, y: yFor(v), v }
  })

  const labelEvery = Math.max(1, Math.ceil(n / (isMobile ? 4 : 8)))
  // Default focus = latest point; hover overrides it.
  const focus = hover != null ? hover : points.length - 1
  const focused = focus >= 0 ? series[focus] : null
  const areaId = `analytics-area-${metric}`
  const glowId = `analytics-glow-${metric}`
  const strokeId = `analytics-stroke-${metric}`

  const prevVal = focus > 0 ? values[focus - 1] : null
  const deltaPct =
    focused != null && prevVal != null && prevVal > 0
      ? Math.round(((values[focus] - prevVal) / prevVal) * 100)
      : null

  const prevPeriodVal = compare && focus >= 0 && focus < prevN ? prevValues[focus] : null
  const vsPrevPeriodPct =
    focused != null && prevPeriodVal != null && prevPeriodVal > 0
      ? Math.round(((values[focus] - prevPeriodVal) / prevPeriodVal) * 100)
      : null
  const focusWeekday = focused != null && isDaily ? WEEKDAY_LABELS[weekdayOfKey(focused.key)] : null

  // Tooltip position as a % of the SVG box — stays correctly placed regardless
  // of the rendered pixel size, since width scales but the viewBox ratio doesn't.
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
        @keyframes analyticsDraw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes analyticsRise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes analyticsFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes analyticsPulse { 0%, 100% { r: 4; opacity: 1; } 50% { r: 5.4; opacity: 0.85; } }
        @media (prefers-reduced-motion: reduce) {
          .an-anim { animation: none !important; }
        }
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
            <stop offset="0%" stopColor={meta.color} stopOpacity="0.30" />
            <stop offset="55%" stopColor={meta.color} stopOpacity="0.08" />
            <stop offset="100%" stopColor={meta.color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={meta.strokeFrom} />
            <stop offset="100%" stopColor={meta.strokeTo} />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-40%" width="140%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={meta.color} floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Weekend shading (daily ranges only) */}
        {isDaily &&
          series.map((b, i) => {
            const wd = weekdayOfKey(b.key)
            if (wd !== 0 && wd !== 6) return null
            const x0 = Math.max(PAD_L, xFor(i) - step / 2)
            const x1 = Math.min(W - PAD_R, xFor(i) + step / 2)
            return (
              <rect key={`wknd-${b.key}`} x={x0} y={PAD_T} width={Math.max(0, x1 - x0)} height={innerH} fill="var(--bk-weekend)" />
            )
          })}

        {/* Gridlines */}
        {gridLines.map((g) => (
          <g key={g.y}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={g.y}
              y2={g.y}
              stroke={g.f === 0 ? 'var(--bk-surface-2)' : 'var(--bk-grid)'}
              strokeWidth="1"
            />
            <text x={PAD_L - 8} y={g.y + 3} fontSize="9" fill={SLATE_MUTED} textAnchor="end">
              {fmtCompact(g.v)}
            </text>
          </g>
        ))}

        {/* Period average reference line */}
        {avg > 0 && n > 2 && (
          <g className="an-anim" style={{ animation: 'analyticsFade 0.8s ease 0.5s both' }}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yFor(avg)}
              y2={yFor(avg)}
              stroke={meta.color}
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
            <text
              x={W - PAD_R}
              y={yFor(avg) - 4}
              fontSize="8.5"
              fontWeight="700"
              fill={meta.color}
              fillOpacity="0.75"
              textAnchor="end"
              letterSpacing="0.06em"
            >
              AVG {fmtCompact(avg)}
            </text>
          </g>
        )}

        {/* Crosshair */}
        {focus >= 0 && (
          <line
            x1={xFor(focus)}
            x2={xFor(focus)}
            y1={PAD_T - 3}
            y2={PAD_T + innerH}
            stroke="var(--bk-border-strong)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        )}

        {/* Previous-period ghost line */}
        {compare && prevPath && (
          <path
            key={`prev-${metric}`}
            className="an-anim"
            d={prevPath}
            fill="none"
            stroke="var(--bk-muted)"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ animation: 'analyticsFade 0.7s ease both' }}
          />
        )}

        {/* Gradient area */}
        <path
          key={`area-${metric}`}
          className="an-anim"
          d={areaPath}
          fill={`url(#${areaId})`}
          stroke="none"
          style={{ animation: 'analyticsRise 0.9s ease both' }}
        />
        {/* Smoothed line with animated draw + soft glow */}
        <path
          key={`line-${metric}`}
          className="an-anim"
          d={linePath}
          fill="none"
          stroke={`url(#${strokeId})`}
          strokeWidth="2.75"
          strokeLinejoin="round"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          pathLength={1}
          style={{ strokeDasharray: 1, animation: 'analyticsDraw 1.1s ease-out forwards' }}
        />

        {/* Peak annotation */}
        {peakVal > 0 && peakIdx !== focus && (
          <g className="an-anim" style={{ animation: 'analyticsFade 0.8s ease 0.9s both' }}>
            <circle cx={xFor(peakIdx)} cy={yFor(peakVal)} r="2.5" fill="var(--bk-card)" stroke={meta.color} strokeWidth="1.5" />
            <text
              x={xFor(peakIdx)}
              y={yFor(peakVal) - 7}
              fontSize="8.5"
              fontWeight="700"
              fill={meta.color}
              textAnchor="middle"
            >
              {fmtCompact(peakVal)}
            </text>
          </g>
        )}

        {/* Comparison marker on the previous-period line */}
        {compare && prevPeriodVal != null && (
          <circle cx={xFor(focus)} cy={yFor(prevPeriodVal)} r="3" fill="var(--bk-card)" stroke="var(--bk-muted)" strokeWidth="1.5" />
        )}

        {/* Focus dot — always-on marker on the active point */}
        {focused != null && (
          <>
            <circle cx={xFor(focus)} cy={yFor(values[focus])} r="9" fill={meta.color} opacity="0.12" />
            <circle
              cx={xFor(focus)}
              cy={yFor(values[focus])}
              r="4"
              fill="var(--bk-card)"
              stroke={meta.color}
              strokeWidth="2.5"
              className="an-anim"
              style={hover == null ? { animation: 'analyticsPulse 2.4s ease-in-out infinite' } : undefined}
            />
          </>
        )}

        {/* X labels */}
        {series.map((b, i) =>
          i % labelEvery === 0 ? (
            <text key={b.key} x={xFor(i)} y={H - 7} fontSize="9" fill={SLATE_MUTED} textAnchor="middle">
              {b.label}
            </text>
          ) : null,
        )}
      </svg>

      {focused != null && (
        <div
          style={{
            position: 'absolute',
            left: `${tooltipLeftPct}%`,
            top: 0,
            transform: `translate(${tooltipLeftPct < 15 ? '0%' : tooltipLeftPct > 85 ? '-100%' : '-50%'}, 0)`,
            background: 'var(--bk-inverse)',
            color: '#fff',
            borderRadius: 10,
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
          <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: 10.5 }}>
            {focusWeekday ? `${focusWeekday} · ` : ''}
            {focused.label}
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {values[focus]} {meta.unit}
              {values[focus] === 1 ? '' : 's'}
            </span>
            {deltaPct != null && (
              <span style={{ color: deltaPct >= 0 ? '#4ade80' : '#f87171', fontWeight: 700, fontSize: 11 }}>
                {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}%
              </span>
            )}
          </span>
          {prevPeriodVal != null && (
            <span style={{ color: '#cbd5e1', fontSize: 10.5 }}>
              Prev period: <b style={{ color: '#fff' }}>{prevPeriodVal}</b>
              {vsPrevPeriodPct != null && (
                <span style={{ color: vsPrevPeriodPct >= 0 ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                  {' '}
                  {vsPrevPeriodPct >= 0 ? '▲' : '▼'} {Math.abs(vsPrevPeriodPct)}%
                </span>
              )}
            </span>
          )}
          {focused.cancelled > 0 && <span style={{ color: '#fca5a5', fontSize: 10.5 }}>{focused.cancelled} cancelled</span>}
        </div>
      )}

      {compare && (
        <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center' }}>
          <LegendDot color={meta.color} label="This period" />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: bk.caption, color: SLATE_BODY }}>
            <span style={{ width: 14, borderTop: '2px dashed var(--bk-muted)', display: 'inline-block' }} />
            Previous period
          </span>
        </div>
      )}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: bk.caption, color: SLATE_BODY }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

// ─── New vs returning chart ───────────────────────────────────────────────────

function GuestMixChart({ series, isMobile }: { series: AnalyticsBucket[]; isMobile: boolean }) {
  const [hover, setHover] = useState<number | null>(null)

  const W = 720
  const H = 190
  const PAD_L = 26
  const PAD_R = 8
  const PAD_B = 26
  const PAD_T = 12
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const maxVal = Math.max(1, ...series.map((b) => b.newGuests + b.returningGuests))
  const niceMax = (v: number) => {
    if (v <= 4) return 4
    const pow = 10 ** Math.floor(Math.log10(v))
    const step10 = v / pow <= 2 ? pow / 2 : v / pow <= 5 ? pow : pow * 2
    return Math.ceil(v / step10) * step10
  }
  const axisMax = niceMax(maxVal)
  const n = series.length
  const step = innerW / Math.max(1, n)
  const barW = Math.max(3, Math.min(22, step * 0.55))
  const labelEvery = Math.max(1, Math.ceil(n / (isMobile ? 4 : 8)))
  const yFor = (v: number) => PAD_T + innerH - (v / axisMax) * innerH

  const gridLines = [0, 0.5, 1].map((f) => ({ y: yFor(axisMax * f), v: Math.round(axisMax * f) }))
  const hovered = hover != null ? series[hover] : null
  const tooltipLeftPct = hover != null ? ((PAD_L + hover * step + step / 2) / W) * 100 : 0

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="gm-new" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
        </defs>
        {gridLines.map((g) => (
          <g key={g.y}>
            <line x1={PAD_L} x2={W - PAD_R} y1={g.y} y2={g.y} stroke="var(--bk-grid-soft)" strokeWidth="1" />
            <text x={PAD_L - 8} y={g.y + 3} fontSize="9.5" fill={SLATE_MUTED} textAnchor="end">
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
            <g key={b.key} style={{ opacity: dim ? 0.4 : 1, transition: 'opacity 0.15s ease' }}>
              {total > 0 && (
                <>
                  <rect x={x} y={yTop} width={barW} height={Math.max(0, hTotal - hNew)} rx="3.5" fill="#c7d2fe" />
                  <rect x={x} y={PAD_T + innerH - hNew} width={barW} height={hNew} rx="3.5" fill="url(#gm-new)" />
                </>
              )}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 8} fontSize="9.5" fill={SLATE_MUTED} textAnchor="middle">
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
            bottom: 8,
            transform: `translateX(${tooltipLeftPct < 12 ? '0%' : tooltipLeftPct > 88 ? '-100%' : '-50%'})`,
            background: 'var(--bk-inverse)',
            color: '#fff',
            borderRadius: 8,
            padding: '7px 11px',
            fontSize: bk.caption,
            display: 'grid',
            gap: 2,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: 'var(--bk-shadow-pop)',
            zIndex: 2,
          }}
        >
          <span style={{ fontWeight: 700 }}>{hovered.label}</span>
          <span>
            <span style={{ color: ACCENT }}>●</span> {hovered.newGuests} new
            {'  '}
            <span style={{ color: '#c7d2fe' }}>●</span> {hovered.returningGuests} returning
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <LegendDot color={ACCENT} label="New guests" />
        <LegendDot color="#c7d2fe" label="Returning guests" />
      </div>
    </div>
  )
}

// ─── Peak hours heatmap ───────────────────────────────────────────────────────

function PeakHoursHeatmap({
  heatmap,
  heatmapMax,
  hourRange,
}: {
  heatmap: { weekday: number; hour: number; count: number }[]
  heatmapMax: number
  hourRange: { start: number; end: number } | null
}) {
  if (!hourRange || heatmapMax === 0) {
    return <div style={{ fontSize: bk.body, color: SLATE_MUTED, padding: '12px 0' }}>No booking activity yet.</div>
  }
  const start = Math.max(0, hourRange.start - 1)
  const end = Math.min(23, hourRange.end + 1)
  const hours: number[] = []
  for (let h = start; h <= end; h++) hours.push(h)

  const byKey = new Map(heatmap.map((c) => [`${c.weekday}-${c.hour}`, c.count]))
  const fmtHour = (h: number) => {
    const period = h < 12 ? 'a' : 'p'
    const d = h % 12 === 0 ? 12 : h % 12
    return `${d}${period}`
  }
  // Square-root scale keeps mid-level cells visible instead of washing out
  // next to a single dominant peak.
  const alphaFor = (count: number) => (count === 0 ? 0 : 0.14 + 0.86 * Math.sqrt(count / heatmapMax))

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%' }}>
          <thead>
            <tr>
              <th />
              {hours.map((h) => (
                <th key={h} style={{ fontSize: 9, fontWeight: 500, color: SLATE_MUTED, padding: 0 }}>
                  {fmtHour(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
              <tr key={wd}>
                <td style={{ fontSize: 10, fontWeight: 600, color: SLATE_BODY, paddingRight: 6, whiteSpace: 'nowrap' }}>
                  {WEEKDAY_LABELS[wd]}
                </td>
                {hours.map((h) => {
                  const count = byKey.get(`${wd}-${h}`) ?? 0
                  return (
                    <td
                      key={h}
                      title={`${WEEKDAY_LABELS[wd]} ${fmtHour(h)} — ${count} booking${count === 1 ? '' : 's'}`}
                      style={{
                        width: 26,
                        height: 22,
                        borderRadius: 5,
                        background: count === 0 ? 'var(--bk-surface)' : `rgba(14,165,233,${alphaFor(count).toFixed(2)})`,
                        cursor: 'default',
                        transition: 'background 0.2s ease',
                      }}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: bk.micro, color: SLATE_MUTED }}>Less</span>
        {[0.14, 0.35, 0.55, 0.78, 1].map((a) => (
          <span
            key={a}
            style={{ width: 14, height: 12, borderRadius: 3, background: `rgba(14,165,233,${a})`, display: 'inline-block' }}
          />
        ))}
        <span style={{ fontSize: bk.micro, color: SLATE_MUTED }}>More</span>
      </div>
    </div>
  )
}

// ─── Message stats (count + median AI reply time) ─────────────────────────────

type MessageStats = {
  count: number
  medianReplySeconds: number | null
}

type SampleMessage = { role: string; created_at: string; conversation_id: string }

/** Median seconds between a guest message and the next AI reply, per conversation. */
function medianReplySeconds(messages: SampleMessage[]): number | null {
  const byConversation = new Map<string, SampleMessage[]>()
  for (const m of messages) {
    const list = byConversation.get(m.conversation_id)
    if (list) list.push(m)
    else byConversation.set(m.conversation_id, [m])
  }
  const deltas: number[] = []
  for (const list of byConversation.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at))
    let pendingUserMs: number | null = null
    for (const m of list) {
      const ms = Date.parse(m.created_at)
      if (!Number.isFinite(ms)) continue
      if (m.role === 'user') {
        pendingUserMs = ms
      } else if (m.role === 'assistant' && pendingUserMs != null) {
        const delta = (ms - pendingUserMs) / 1000
        // Ignore replies more than an hour later — likely a resumed conversation.
        if (delta >= 0 && delta <= 3600) deltas.push(delta)
        pendingUserMs = null
      }
    }
  }
  if (deltas.length === 0) return null
  deltas.sort((a, b) => a - b)
  return deltas[Math.floor(deltas.length / 2)]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type DbAppointmentRow = AnalyticsAppointmentRow

export default function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const [chartMetric, setChartMetric] = useState<ChartMetric>('bookings')
  const [comparePeriods, setComparePeriods] = useState(false)
  const [rows, setRows] = useState<DbAppointmentRow[]>([])
  const [zones, setZones] = useState<AnalyticsZone[]>([])
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [settings, setSettings] = useState<BookingSettings | null>(null)
  const [conversationIds, setConversationIds] = useState<string[] | null>(null)
  const [messageStats, setMessageStats] = useState<MessageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checkDraft, setCheckDraft] = useState('')
  const [editingCheck, setEditingCheck] = useState(false)
  const [savingCheck, setSavingCheck] = useState(false)
  const [showAllKpis, setShowAllKpis] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      const access = await resolveBusinessAccess()
      if (!access) {
        if (!cancelled) {
          setRows([])
          setConversationIds([])
          setLoading(false)
        }
        return
      }
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, booking_settings')
        .eq('id', access.businessId)
        .maybeSingle()
      if (!biz?.id) {
        if (!cancelled) {
          setRows([])
          setConversationIds([])
          setLoading(false)
        }
        return
      }

      const [apptRes, zoneRes, convRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('customer_id, scheduled_at, status, party_size, service_name, zone_id')
          .eq('business_id', biz.id)
          .order('scheduled_at', { ascending: true }),
        supabase
          .from('dining_zones')
          .select('id, name, max_concurrent_parties, turnover_minutes, is_active')
          .eq('business_id', biz.id),
        supabase.from('conversations').select('id').eq('business_id', biz.id),
      ])

      if (cancelled) return
      if (apptRes.error) {
        setError("We couldn't load analytics data.")
        setLoading(false)
        return
      }
      setBusinessId(biz.id)
      setSettings(parseBookingSettings(biz.booking_settings))
      setRows((apptRes.data ?? []) as DbAppointmentRow[])
      setZones((zoneRes.data ?? []) as AnalyticsZone[])
      setConversationIds((convRes.data ?? []).map((r) => String(r.id)))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Message count + reply time for the selected range.
  useEffect(() => {
    if (conversationIds == null) return
    if (conversationIds.length === 0) {
      setMessageStats({ count: 0, medianReplySeconds: null })
      return
    }
    let cancelled = false
    setMessageStats(null)
    void (async () => {
      const startISO = new Date(reportWindow(range).start).toISOString()
      const chunkSize = 200
      let count = 0
      const sample: SampleMessage[] = []
      for (let i = 0; i < conversationIds.length; i += chunkSize) {
        const chunk = conversationIds.slice(i, i + chunkSize)
        const [countRes, sampleRes] = await Promise.all([
          supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .in('conversation_id', chunk)
            .gte('created_at', startISO),
          supabase
            .from('messages')
            .select('role, created_at, conversation_id')
            .in('conversation_id', chunk)
            .gte('created_at', startISO)
            .order('created_at', { ascending: true })
            .limit(1000),
        ])
        if (cancelled) return
        count += countRes.count ?? 0
        for (const m of sampleRes.data ?? []) sample.push(m as SampleMessage)
      }
      if (!cancelled) setMessageStats({ count, medianReplySeconds: medianReplySeconds(sample) })
    })()
    return () => {
      cancelled = true
    }
  }, [conversationIds, range])

  const report = useMemo(() => buildAnalyticsReport(rows, zones, range), [rows, zones, range])

  const avgCheck = settings?.average_check ?? 0
  const estRevenue = avgCheck > 0 ? report.kpis.covers * avgCheck : null

  const saveAvgCheck = useCallback(async () => {
    if (!businessId || !settings) return
    const parsed = parseFloat(checkDraft)
    const value = Number.isFinite(parsed) && parsed >= 0 ? Math.min(100000, parsed) : 0
    setSavingCheck(true)
    const next = { ...settings, average_check: value }
    const { error: err } = await supabase
      .from('businesses')
      .update({ booking_settings: next })
      .eq('id', businessId)
    setSavingCheck(false)
    if (!err) {
      setSettings(next)
      setEditingCheck(false)
    }
  }, [businessId, settings, checkDraft])

  const hasAnyData = rows.length > 0

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
            gap: 14,
            alignContent: 'start',
            fontFamily: bk.font,
          }}
        >
          <style>{`
            @keyframes anCardRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
            .an-rise { animation: anCardRise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
            .an-card { transition: transform 0.18s ease, box-shadow 0.18s ease; }
            .an-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); }
            @media (prefers-reduced-motion: reduce) {
              .an-rise { animation: none; }
              .an-card, .an-card:hover { transform: none; }
            }
          `}</style>

          {isMobile && (
            <button
              type="button"
              onClick={openNav}
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

          {/* header */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: bk.micro, fontWeight: 700, color: SLATE_MUTED, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Reports
              </div>
              <h1 style={{ margin: '5px 0 0', fontSize: 26, fontWeight: 700, color: SLATE_HEAD, letterSpacing: '-0.03em' }}>
                Analytics
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: bk.body, color: SLATE_BODY }}>
                {loading ? 'Loading analytics…' : `Bookings, guests and occupancy over the last ${RANGE_OPTIONS.find((r) => r.id === range)?.label}`}
              </p>
            </div>

            {/* range switch */}
            <div style={{ display: 'inline-flex', background: 'var(--bk-card)', borderRadius: 10, border: bk.border, padding: 3, gap: 2, boxShadow: 'var(--bk-shadow)' }}>
              {RANGE_OPTIONS.map((opt) => {
                const active = opt.id === range
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRange(opt.id)}
                    style={{
                      border: 'none',
                      borderRadius: 8,
                      padding: '7px 12px',
                      fontSize: bk.body,
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      background: active ? 'var(--bk-inverse)' : 'transparent',
                      color: active ? 'var(--bk-inverse-text)' : SLATE_BODY,
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <div style={{ ...bkCard, padding: bk.cardPad, color: 'var(--bk-danger)', fontSize: bk.body }}>{error}</div>
          )}

          {loading ? (
            <div style={{ ...bkCard, padding: 40, textAlign: 'center', color: SLATE_MUTED, fontSize: bk.body }}>
              Loading analytics…
            </div>
          ) : !hasAnyData ? (
            <div style={{ ...bkCard, padding: 40, textAlign: 'center', display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: SLATE_HEAD }}>No data yet</div>
              <div style={{ fontSize: bk.body, color: SLATE_BODY }}>
                Analytics will appear here once your first reservations come in.
              </div>
            </div>
          ) : (
            <>
              {/* KPI row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
                  gap: bk.gap,
                }}
              >
                <KpiCard
                  label="Bookings"
                  value={String(report.kpis.bookings)}
                  deltaPct={report.kpis.bookingsDeltaPct}
                  sub="vs previous period"
                  delay={0}
                />
                <KpiCard
                  label="Guests served"
                  value={String(report.kpis.covers)}
                  deltaPct={report.kpis.coversDeltaPct}
                  sub={
                    report.kpis.avgPartySize != null
                      ? `avg party ${report.kpis.avgPartySize.toFixed(1)}`
                      : 'vs previous period'
                  }
                  delay={40}
                />
                <KpiCard
                  label="Cancellation rate"
                  value={`${report.kpis.cancellationRate}%`}
                  sub={`No-shows: ${report.kpis.noShowRate}%`}
                  delay={80}
                />
                {showAllKpis && (
                <>
                <KpiCard
                  label="Messages"
                  value={messageStats ? String(messageStats.count) : '…'}
                  sub="guest & AI messages"
                  delay={0}
                />
                <KpiCard
                  label="Response time"
                  value={
                    messageStats
                      ? messageStats.medianReplySeconds != null
                        ? fmtDuration(messageStats.medianReplySeconds)
                        : '—'
                      : '…'
                  }
                  sub="median AI reply"
                  delay={40}
                />
                {/* Revenue card with inline avg-check editor */}
                <div
                  className="an-card an-rise"
                  style={{ ...bkCard, padding: '14px 16px', display: 'grid', gap: 6, alignContent: 'start', animationDelay: '80ms' }}
                >
                  <div
                    style={{
                      fontSize: bk.micro,
                      fontWeight: 700,
                      color: SLATE_MUTED,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Est. revenue
                  </div>
                  {estRevenue != null && !editingCheck ? (
                    <>
                      <span style={{ fontSize: 26, fontWeight: 700, color: SLATE_HEAD, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
                        {fmtMoney(estRevenue)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCheckDraft(String(avgCheck))
                          setEditingCheck(true)
                        }}
                        style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', fontSize: bk.caption, color: ACCENT, cursor: 'pointer' }}
                      >
                        {fmtMoney(avgCheck)} avg check · edit
                      </button>
                    </>
                  ) : editingCheck ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <input
                        type="number"
                        min={0}
                        value={checkDraft}
                        onChange={(e) => setCheckDraft(e.target.value)}
                        placeholder="Avg check per guest"
                        autoFocus
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: bk.border, fontSize: bk.body }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => void saveAvgCheck()}
                          disabled={savingCheck}
                          style={{ border: 'none', borderRadius: 6, padding: '5px 10px', background: 'var(--bk-inverse)', color: 'var(--bk-inverse-text)', fontSize: bk.caption, fontWeight: 600, cursor: 'pointer' }}
                        >
                          {savingCheck ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCheck(false)}
                          style={{ border: bk.border, borderRadius: 6, padding: '5px 10px', background: 'var(--bk-card)', color: SLATE_BODY, fontSize: bk.caption, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: 15, fontWeight: 600, color: SLATE_MUTED }}>Not configured</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCheckDraft('')
                          setEditingCheck(true)
                        }}
                        style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', fontSize: bk.caption, color: ACCENT, cursor: 'pointer' }}
                      >
                        Set average check per guest →
                      </button>
                    </>
                  )}
                </div>
                </>
                )}
              </div>

              {/* KPI expand toggle */}
              <button
                type="button"
                onClick={() => setShowAllKpis((v) => !v)}
                className="an-card"
                style={{
                  justifySelf: 'center',
                  marginTop: -6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  border: bk.border,
                  borderRadius: 99,
                  padding: '6px 14px',
                  fontSize: bk.caption,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: 'var(--bk-card)',
                  color: SLATE_BODY,
                  boxShadow: 'var(--bk-shadow)',
                }}
              >
                {showAllKpis ? 'Hide extra stats' : 'Show all stats'}
                <span
                  style={{
                    fontSize: 8.5,
                    lineHeight: 1,
                    transform: showAllKpis ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  ▼
                </span>
              </button>

              {/* Bookings over time */}
              {(() => {
                const trendTotal = chartMetric === 'bookings' ? report.kpis.bookings : report.kpis.covers
                const trendDelta = chartMetric === 'bookings' ? report.kpis.bookingsDeltaPct : report.kpis.coversDeltaPct
                return (
                  <section className="an-rise" style={{ ...bkCard, padding: '16px 18px', animationDelay: '240ms' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 12,
                        marginBottom: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'grid', gap: 6 }}>
                        <h2 style={{ margin: 0, fontSize: bk.title, fontWeight: 700, color: SLATE_HEAD }}>
                          {chartMetric === 'bookings' ? 'Bookings over time' : 'Guests over time'}
                        </h2>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 22, fontWeight: 700, color: SLATE_HEAD, letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {new Intl.NumberFormat('en-CA').format(trendTotal)}
                          </span>
                          {trendDelta != null && <DeltaPill pct={trendDelta} />}
                          <span style={{ fontSize: bk.caption, color: SLATE_MUTED }}>vs previous period</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setComparePeriods((c) => !c)}
                          title="Overlay the previous period for comparison"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 7,
                            border: 'none',
                            borderRadius: 9,
                            padding: '8px 12px',
                            fontSize: bk.caption,
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: comparePeriods ? 'var(--bk-inverse)' : 'var(--bk-surface)',
                            color: comparePeriods ? 'var(--bk-inverse-text)' : SLATE_BODY,
                            transition: 'background 0.15s, color 0.15s',
                          }}
                        >
                          <span style={{ width: 13, borderTop: '2px dashed currentColor', display: 'inline-block', opacity: 0.75 }} />
                          Compare
                        </button>
                        <MetricToggle value={chartMetric} onChange={setChartMetric} />
                      </div>
                    </div>
                    <BookingsChart
                      series={report.series}
                      prevSeries={report.prevSeries}
                      isMobile={isMobile}
                      metric={chartMetric}
                      compare={comparePeriods}
                    />
                  </section>
                )
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: bk.gapMd }}>
                {/* Guest dynamics */}
                <section className="an-rise" style={{ ...bkCard, padding: '16px 18px', animationDelay: '300ms' }}>
                  <h2 style={{ margin: '0 0 4px', fontSize: bk.title, fontWeight: 700, color: SLATE_HEAD }}>
                    New vs returning guests
                  </h2>
                  <p style={{ margin: '0 0 10px', fontSize: bk.caption, color: SLATE_BODY }}>
                    {report.kpis.newGuests} new · {report.kpis.returningGuests} returning · {report.kpis.uniqueGuests} unique guests
                  </p>
                  <GuestMixChart series={report.series} isMobile={isMobile} />
                </section>

                {/* Zones */}
                <section className="an-rise" style={{ ...bkCard, padding: '16px 18px', animationDelay: '340ms' }}>
                  <h2 style={{ margin: '0 0 4px', fontSize: bk.title, fontWeight: 700, color: SLATE_HEAD }}>
                    Zone occupancy
                  </h2>
                  <p style={{ margin: '0 0 12px', fontSize: bk.caption, color: SLATE_BODY }}>
                    Share of bookings and peak utilization per dining zone
                  </p>
                  {report.zones.length === 0 ? (
                    <div style={{ fontSize: bk.body, color: SLATE_MUTED }}>No dining zones configured.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 12 }}>
                      {report.zones.map((z) => {
                        const hot = z.peakUtilizationPct != null && z.peakUtilizationPct >= 90
                        return (
                          <div key={z.zoneId} style={{ display: 'grid', gap: 5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                              <span style={{ fontSize: bk.body, fontWeight: 600, color: SLATE_HEAD }}>{z.zoneName}</span>
                              <span style={{ fontSize: bk.caption, color: SLATE_BODY }}>
                                {z.bookings} bookings · {z.covers} guests
                                {z.peakUtilizationPct != null && ` · peak ${z.peakUtilizationPct}%`}
                              </span>
                            </div>
                            <div style={{ height: 9, borderRadius: 99, background: 'var(--bk-surface)', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${Math.min(100, z.sharePct)}%`,
                                  height: '100%',
                                  borderRadius: 99,
                                  background: hot
                                    ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                    : 'linear-gradient(90deg, #0284c7, #22d3ee)',
                                  transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
                                }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              </div>

              {/* Peak hours */}
              <section className="an-rise" style={{ ...bkCard, padding: '16px 18px', animationDelay: '380ms' }}>
                <h2 style={{ margin: '0 0 4px', fontSize: bk.title, fontWeight: 700, color: SLATE_HEAD }}>
                  Peak hours
                </h2>
                <p style={{ margin: '0 0 12px', fontSize: bk.caption, color: SLATE_BODY }}>
                  Active bookings by weekday and hour (Calgary time)
                </p>
                <PeakHoursHeatmap
                  heatmap={report.heatmap}
                  heatmapMax={report.heatmapMax}
                  hourRange={report.heatmapHourRange}
                />
              </section>
            </>
          )}
        </main>
      )}
    </DashboardOceanNav>
  )
}
