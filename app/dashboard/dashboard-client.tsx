'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { DashboardOceanNav } from '@/components/dashboard-ocean-nav'
import { t } from '@/lib/dashboard-theme'
import { supabase } from '@/lib/supabase'

export type RecentActivity = {
  id: string
  title: string
  timestamp: string
  role: 'assistant' | 'guest'
}

export type ZoneOccupancy = {
  id: string
  name: string
  capacity: number
  guestsToday: number
}

type DashboardClientProps = {
  businessDisplayName: string
  conciergeName: string
  businessId: string
  activeChats: number
  messageCount: number
  recentActivity: RecentActivity[]
  zoneOccupancy: ZoneOccupancy[]
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatRelativeTime(timestamp: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ─── Icons ────────────────────────────────────────────────────
function IcBolt() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
  )
}
function IcChat() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 1 1-3-6.2L21 4l-1.2 3.5A7.95 7.95 0 0 1 21 12Z" />
    </svg>
  )
}
function IcCal() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  )
}
function IcWave() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" />
    </svg>
  )
}
function IcUp() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}
function IcArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
function IcCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

// ─── Stat card ────────────────────────────────────────────────
type StatCardProps = {
  label: string
  value: string | number
  delta?: string
  hint?: string
  icon: React.ReactNode
}
function StatCard({ label, value, delta, hint, icon }: StatCardProps) {
  return (
    <div
      style={{
        background: t.bgSurface,
        border: `1px solid ${t.border}`,
        borderRadius: 16,
        padding: '24px',
        boxShadow: t.shadowCard,
        transition: 'box-shadow 0.15s',
        fontFamily: 'var(--font-plus-jakarta, system-ui, sans-serif)',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = t.shadowMd)}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = t.shadowCard)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.textMuted }}>
          {label}
        </span>
        <span style={{ width: 32, height: 32, borderRadius: 8, background: t.accentSoftBg, display: 'grid', placeItems: 'center', color: t.accent }}>
          {icon}
        </span>
      </div>
      <div style={{
        fontSize: 32, fontWeight: 700, color: t.text, marginTop: 12,
        lineHeight: 1.1, letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"',
      }}>
        {value}
      </div>
      {(delta || hint) && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
          {delta && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600, color: t.green }}>
              <IcUp />{delta}
            </span>
          )}
          {hint && <span style={{ color: t.textMuted }}>{hint}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Avatar bubble ────────────────────────────────────────────
function AvatarBubble({ role, name }: { role: 'assistant' | 'guest'; name?: string }) {
  if (role === 'assistant') {
    return (
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, #38bdf8, #0284c7)',
        display: 'grid', placeItems: 'center', color: '#fff',
        boxShadow: '0 2px 6px rgba(56,189,248,0.25)',
      }}>
        <IcWave />
      </div>
    )
  }
  const initials = (name || 'G').split(' ').map((s: string) => s[0]).slice(0, 2).join('')
  return (
    <div style={{
      width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
      background: t.bgSurfaceMuted, border: `1px solid ${t.border}`,
      display: 'grid', placeItems: 'center',
      color: t.textMuted, fontWeight: 700, fontSize: 13,
    }}>
      {initials}
    </div>
  )
}

// ─── Zone occupancy ────────────────────────────────────────────

function zoneIcon(name: string) {
  const n = name.toLowerCase()
  if (n.includes('bar') || n.includes('lounge')) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 22h8M12 11v11M3 3h18l-5 8H8L3 3Z"/>
    </svg>
  )
  if (n.includes('patio') || n.includes('outdoor') || n.includes('terrace')) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v6M5.5 5.5 8 8M18.5 5.5 16 8M2 12h4M18 12h4M12 22c-4 0-7-3-7-7h14c0 4-3 7-7 7Z"/>
    </svg>
  )
  if (n.includes('private') || n.includes('vip') || n.includes('room')) return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l19-9-9 19-2-8-8-2Z"/>
    </svg>
  )
}

function zoneTone(pct: number): { label: string; color: string } {
  if (pct === 0) return { label: 'Empty',       color: 'var(--t-text-subtle, #64748b)' }
  if (pct < 50)  return { label: 'Steady',      color: 'var(--t-accent, #38bdf8)' }
  if (pct < 85)  return { label: 'Filling',     color: '#f59e0b' }
  return              { label: 'At capacity',  color: '#ef4444' }
}

function Ring({ pct, color, mounted }: { pct: number; color: string; mounted: boolean }) {
  const size = 64, stroke = 6, r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (mounted ? pct : 0) / 100 * c
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={t.bgSurfaceMuted} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }} />
    </svg>
  )
}

function ZoneOccupancyPanel({ zones }: { zones: ZoneOccupancy[] }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const totalBooked   = zones.reduce((s, z) => s + z.guestsToday, 0)
  const totalCapacity = zones.reduce((s, z) => s + z.capacity, 0)
  const totalPct      = totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0

  return (
    <section style={{
      background: t.bgSurface,
      border: `1px solid ${t.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: t.shadowCard,
      marginBottom: 28,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            border: `1px solid ${t.border}`, background: t.bgSurfaceMuted,
            display: 'grid', placeItems: 'center', color: t.textMuted, flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text, letterSpacing: '-0.01em' }}>Today&apos;s covers</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: t.textMuted }}>Seat fill across all zones</p>
          </div>
        </div>
        <Link href="/dashboard/bookings" style={{
          textDecoration: 'none', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '6px 12px', borderRadius: 8,
          border: `1px solid ${t.border}`, background: t.bgSurfaceMuted,
          fontSize: 13, fontWeight: 600, color: t.text,
          transition: 'background 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = t.bgSurfaceHover)}
          onMouseLeave={e => (e.currentTarget.style.background = t.bgSurfaceMuted)}
        >
          All bookings
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7M7 7h10v10"/>
          </svg>
        </Link>
      </div>

      {/* Total summary row */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        borderTop: `1px solid ${t.border}`, padding: '18px 24px',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.textMuted, marginBottom: 4 }}>
            Total occupancy
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: t.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              {totalPct}%
            </span>
            <span style={{ fontSize: 13, color: t.textMuted }}>
              {totalBooked} of {totalCapacity} guests
            </span>
          </div>
        </div>
        {/* Mini bar chart */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 44 }} aria-hidden="true">
          {zones.map((z) => {
            const p = z.capacity > 0 ? Math.min(100, Math.round((z.guestsToday / z.capacity) * 100)) : 0
            const { color } = zoneTone(p)
            return (
              <div key={z.id} style={{
                width: 10, borderRadius: 99,
                background: color,
                opacity: p === 0 ? 0.2 : 0.85,
                height: mounted ? `${Math.max(p, 8)}%` : '8%',
                transition: 'height 900ms cubic-bezier(0.22,1,0.36,1)',
              }} />
            )
          })}
        </div>
      </div>

      {/* Zone grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(zones.length, 3)}, 1fr)`,
        gap: '1px',
        background: t.border,
        borderTop: `1px solid ${t.border}`,
      }}>
        {zones.map((zone) => {
          const pct = zone.capacity > 0 ? Math.min(100, Math.round((zone.guestsToday / zone.capacity) * 100)) : 0
          const { label, color } = zoneTone(pct)
          return (
            <div key={zone.id}
              style={{ background: t.bgSurface, padding: '20px 24px', transition: 'background 0.12s', cursor: 'default' }}
              onMouseEnter={e => (e.currentTarget.style.background = t.bgSurfaceHover)}
              onMouseLeave={e => (e.currentTarget.style.background = t.bgSurface)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.textMuted, fontSize: 13, fontWeight: 600 }}>
                {zoneIcon(zone.name)}
                <span style={{ color: t.text }}>{zone.name}</span>
              </div>

              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Ring */}
                <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
                  <Ring pct={pct} color={color} mounted={mounted} />
                  <span style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: t.text, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {pct}%
                  </span>
                </div>

                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: t.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                    {zone.guestsToday}
                    <span style={{ color: t.textMuted, fontWeight: 400 }}>/{zone.capacity}</span>
                  </div>
                  <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    {label}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Main client component ────────────────────────────────────
export function DashboardClient({
  businessDisplayName,
  conciergeName,
  businessId,
  activeChats,
  messageCount,
  recentActivity,
  zoneOccupancy,
}: DashboardClientProps) {
  const [unreadCount, setUnreadCount] = useState(activeChats)

  useEffect(() => {
    const fetchCount = async () => {
      const { count } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .or('status.is.null,status.eq.active,status.eq.human')
      if (count !== null) setUnreadCount(count)
    }
    void fetchCount()
    const id = setInterval(() => void fetchCount(), 30_000)
    return () => clearInterval(id)
  }, [businessId])

  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())

  return (
    <DashboardOceanNav activeNav="Dashboard">
      {({ isMobile, openNav }) => (
        <main style={{
          background: t.bgApp,
          margin: isMobile ? '-20px -16px' : '-36px',
          padding: isMobile ? '24px 16px' : '40px',
          minHeight: '100vh',
          fontFamily: 'var(--font-plus-jakarta, system-ui, sans-serif)',
        }}>

          {isMobile && (
            <button
              type="button"
              onClick={openNav}
              style={{
                width: 40, height: 40, borderRadius: 10,
                border: `1px solid ${t.border}`,
                background: t.bgSurface, color: t.text,
                fontSize: 18, cursor: 'pointer', marginBottom: 20,
              }}
            >
              ☰
            </button>
          )}

          {/* Greeting */}
          <section style={{ marginBottom: 28 }}>
            <h1 style={{
              margin: 0,
              fontSize: isMobile ? 24 : 30,
              fontWeight: 700,
              color: t.text,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
            }}>
              {getGreeting()}, {businessDisplayName}
            </h1>
            <p style={{ margin: '6px 0 0', color: t.textMuted, fontSize: 14 }}>
              {today}
            </p>
          </section>

          {/* Stats */}
          <section style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: 16,
            marginBottom: 28,
          }}>
            <StatCard label="Active Chats"    value={activeChats}   delta="+4"    hint="vs. yesterday"    icon={<IcChat />} />
            <StatCard label="Messages Today"  value={messageCount}  delta="+18%"  hint="vs. last 7 days"  icon={<IcWave />} />
            <StatCard label="Response Time"   value="2s"            delta="-0.6s" hint="faster"            icon={<IcBolt />} />
          </section>

          {/* Actions */}
          <section style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 32 }}>
            <Link href="/dashboard/settings?tab=widget" style={{ textDecoration: 'none' }}>
              <button
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', borderRadius: 8,
                  background: '#0ea5e9', border: 'none',
                  color: '#fff', fontWeight: 600, fontSize: 14,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 2px 8px rgba(14,165,233,0.35)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#0284c7')}
                onMouseLeave={e => (e.currentTarget.style.background = '#0ea5e9')}
              >
                <IcBolt /> Deploy Concierge
              </button>
            </Link>

            <Link href="/dashboard/chats" style={{ textDecoration: 'none' }}>
              <button
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', borderRadius: 8,
                  background: t.bgSurface, border: `1px solid ${t.border}`,
                  color: t.text, fontWeight: 600, fontSize: 14,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = t.bgSurfaceHover)}
                onMouseLeave={e => (e.currentTarget.style.background = t.bgSurface)}
              >
                <IcChat /> Unread Chats
                {unreadCount > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    padding: '2px 6px', borderRadius: 6,
                    background: t.dangerBg, color: t.danger,
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>
            </Link>

            <Link href="/dashboard/bookings" style={{ textDecoration: 'none' }}>
              <button
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', borderRadius: 8,
                  background: t.bgSurface, border: `1px solid ${t.border}`,
                  color: t.text, fontWeight: 600, fontSize: 14,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = t.bgSurfaceHover)}
                onMouseLeave={e => (e.currentTarget.style.background = t.bgSurface)}
              >
                <IcCal /> Reservations
              </button>
            </Link>
          </section>

          {/* Zone occupancy */}
          {zoneOccupancy.length > 0 && (
            <ZoneOccupancyPanel zones={zoneOccupancy} />
          )}

          {/* Recent activity */}
          <section style={{
            background: t.bgSurface,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: t.shadowCard,
          }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: `1px solid ${t.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.text, letterSpacing: '-0.01em' }}>
                  Recent activity
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: t.textMuted }}>
                  What {conciergeName} has been up to today
                </p>
              </div>
              <Link href="/dashboard/chats" style={{
                textDecoration: 'none', fontSize: 13, fontWeight: 600,
                color: t.accent, display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                View all <IcArrow />
              </Link>
            </div>

            {recentActivity.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: t.textMuted, fontSize: 14 }}>
                Quiet so far — activity will appear here once guests start chatting
              </div>
            ) : (
              recentActivity.map((item, i) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '16px 24px',
                    borderTop: i === 0 ? 'none' : `1px solid ${t.borderSoft}`,
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = t.bgSurfaceHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <AvatarBubble role={item.role} name={item.role === 'guest' ? item.title.split(' ')[0] : undefined} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: t.text, fontWeight: 600, lineHeight: 1.3 }}>
                      {item.role === 'assistant' ? conciergeName : 'Guest'}
                      <span style={{ color: t.textMuted, fontWeight: 400 }}>
                        {item.role === 'assistant' ? ' · AI' : ' · guest'}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 13.5, color: t.textMuted, marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.title}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: t.textSubtle, whiteSpace: 'nowrap', paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {formatRelativeTime(item.timestamp)}
                  </div>
                </div>
              ))
            )}

            <div style={{
              padding: '12px 24px',
              borderTop: `1px solid ${t.border}`,
              background: t.bgSurfaceMuted,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 12, color: t.textMuted }}>
                Showing {recentActivity.length} most recent events
              </span>
              <span style={{ fontSize: 12, color: t.green, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <IcCheck /> All caught up
              </span>
            </div>
          </section>

        </main>
      )}
    </DashboardOceanNav>
  )
}

export default DashboardClient
