'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { DashboardLogoutButton } from '@/components/dashboard-logout-button'
import { OceanCoreLogo } from '@/components/oceancore-logo'
import { type BusinessAccess, resolveBusinessAccess } from '@/lib/business-access'
import { drawerOverlay, drawerPanelLeft, oceanTransition } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'
import { t, sidebar } from '@/lib/dashboard-theme'

export type OceanDashboardNavId = 'Dashboard' | 'Chats' | 'Bookings' | 'CRM' | 'Analytics' | 'Settings'

type DashboardOceanNavProps = {
  activeNav: OceanDashboardNavId
  fillViewport?: boolean
  /** Solid app background without aurora blobs (e.g. light bookings layout) */
  flatBackground?: string
  children: (props: OceanNavRenderProps) => ReactNode
}

export type OceanNavRenderProps = {
  isMobile: boolean
  openNav: () => void
  closeNav: () => void
}

type NavItem = {
  id: OceanDashboardNavId
  href: string
  icon: ReactNode
}

/** The rail is captioned rather than uniform: work, records, then the account. */
type NavGroup = {
  label: string
  items: NavItem[]
}

const SIDEBAR_WIDTH = 240

// Theme lives on <html data-theme> (set pre-hydration by the inline script in
// app/layout.tsx); useSyncExternalStore keeps React in sync without a
// post-mount setState.
const themeListeners = new Set<() => void>()

function subscribeTheme(listener: () => void) {
  themeListeners.add(listener)
  return () => {
    themeListeners.delete(listener)
  }
}

function getThemeSnapshot(): 'dark' | 'light' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

/** Head-only count query — no rows travel, just the number. */
function buildChatCountQuery(businessId: string) {
  return supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
}

function setGlobalTheme(next: 'dark' | 'light') {
  localStorage.setItem('theme', next)
  document.documentElement.dataset.theme = next
  for (const listener of themeListeners) listener()
}

function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
function IconChats() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
function IconBookings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
function IconCRM() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function IconAnalytics() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

const navGroups: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { id: 'Dashboard', href: '/dashboard', icon: <IconDashboard /> },
      { id: 'Chats', href: '/dashboard/chats', icon: <IconChats /> },
      { id: 'Bookings', href: '/dashboard/bookings', icon: <IconBookings /> },
    ],
  },
  {
    label: 'Manage',
    items: [
      { id: 'CRM', href: '/dashboard/crm', icon: <IconCRM /> },
      { id: 'Analytics', href: '/dashboard/analytics', icon: <IconAnalytics /> },
    ],
  },
  {
    label: 'System',
    items: [{ id: 'Settings', href: '/dashboard/settings', icon: <IconSettings /> }],
  },
]

function AnimatedWaveLogo() {
  return (
    <Link href="/dashboard" style={{ textDecoration: 'none' }}>
      <div style={{ padding: '24px 20px 22px' }}>
        <OceanCoreLogo variant="sidebar" theme="dark" />
      </div>
    </Link>
  )
}

function IconSun() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="5.1" fill="currentColor"/>
      <path
        d="M12 2.25v2.1M12 19.65v2.1M5.1 5.1l1.48 1.48M17.42 17.42l1.48 1.48M2.25 12h2.1M19.65 12h2.1M5.1 18.9l1.48-1.48M17.42 6.58l1.48-1.48"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconMoon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.55 14.25A8.75 8.75 0 1 1 9.75 3.45a7.15 7.15 0 0 0 10.8 10.8Z"
        fill="currentColor"
      />
      <path
        d="M13.55 5.05c.17.93.63 1.67 1.39 2.16.58.38 1.26.6 2.05.66-.79.06-1.47.28-2.05.66-.76.49-1.22 1.23-1.39 2.16-.17-.93-.63-1.67-1.39-2.16a4.14 4.14 0 0 0-2.05-.66c.79-.06 1.47-.28 2.05-.66.76-.49 1.22-1.23 1.39-2.16ZM18.78 2.05c.08.47.32.84.7 1.09.29.19.63.3 1.03.33-.4.03-.74.14-1.03.33-.38.25-.62.62-.7 1.09-.09-.47-.32-.84-.7-1.09a2.08 2.08 0 0 0-1.04-.33c.4-.03.75-.14 1.04-.33.38-.25.61-.62.7-1.09ZM9.1 3.7c.06.34.23.61.51.79.21.14.46.22.75.24-.29.02-.54.1-.75.24-.28.18-.45.45-.51.79-.06-.34-.23-.61-.51-.79a1.52 1.52 0 0 0-.75-.24c.29-.02.54-.1.75-.24.28-.18.45-.45.51-.79Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ThemeIcon({ theme, reduceMotion }: { theme: 'dark' | 'light'; reduceMotion: boolean | null }) {
  const isDark = theme === 'dark'
  const transition = reduceMotion
    ? { duration: 0.12 }
    : { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const }

  const layer: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    willChange: 'transform, opacity',
  }

  // Layers only — the toggle button itself provides the box and tint.
  return (
    <>
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={reduceMotion
          ? { opacity: isDark ? 1 : 0 }
          : { opacity: isDark ? 1 : 0, rotate: isDark ? 0 : -55, scale: isDark ? 1 : 0.5 }}
        transition={transition}
        style={{ ...layer, color: '#d9e9ff' }}
      >
        <IconMoon />
      </motion.span>
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={reduceMotion
          ? { opacity: isDark ? 0 : 1 }
          : { opacity: isDark ? 0 : 1, rotate: isDark ? 55 : 0, scale: isDark ? 0.5 : 1 }}
        transition={transition}
        style={{ ...layer, color: '#ffcf5a' }}
      >
        <IconSun />
      </motion.span>
    </>
  )
}

type IconButtonTone = {
  bg: string
  border: string
  bgHover: string
  borderHover: string
  color: string
  colorHover?: string
}

const SIGN_OUT_TONE: IconButtonTone = {
  // Zero-alpha rgba, not `transparent`: framer cannot interpolate the keyword
  // and warns, leaving the hover tint to snap instead of fade.
  bg: 'rgba(255,255,255,0)',
  border: sidebar.border,
  bgHover: 'rgba(248,113,113,0.14)',
  borderHover: 'rgba(248,113,113,0.34)',
  color: sidebar.textSubtle,
  colorHover: '#f87171',
}

const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', host: 'Host' } as const

/** Square control for the account row. One shape for every session action. */
function SidebarIconButton({
  label,
  onClick,
  tone,
  reduceMotion,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  tone: IconButtonTone
  reduceMotion: boolean | null
  pressed?: boolean
  children: ReactNode
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      whileTap={reduceMotion ? undefined : { scale: 0.9 }}
      // Hover stays declarative: imperative style writes would capture `tone`
      // from this render, so flipping the theme with the pointer resting on the
      // button would restore the previous theme's tint on mouseleave.
      initial={false}
      animate={{ backgroundColor: tone.bg, borderColor: tone.border, color: tone.color }}
      whileHover={{
        backgroundColor: tone.bgHover,
        borderColor: tone.borderHover,
        color: tone.colorHover ?? tone.color,
      }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] }}
      style={{
        width: 30,
        height: 30,
        padding: 0,
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        borderRadius: 9,
        cursor: 'pointer',
        borderWidth: 1,
        borderStyle: 'solid',
      }}
    >
      {children}
    </motion.button>
  )
}

/**
 * Who is answering guests right now. The ripple only runs when a chat is
 * actually open, so a still dot means a quiet room rather than a dead widget.
 */
function ServiceStatus({
  chats,
  reduceMotion,
}: {
  chats: { live: number; human: number } | null
  reduceMotion: boolean | null
}) {
  if (!chats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 16 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sidebar.surfaceHover, flexShrink: 0 }} />
        <span style={{ height: 7, width: 108, borderRadius: 99, background: sidebar.surfaceHover }} />
      </div>
    )
  }

  const waiting = chats.human
  const live = chats.live
  const tone = waiting > 0 ? '#fbbf24' : live > 0 ? t.accent : sidebar.textSubtle
  const alive = waiting > 0 || live > 0
  const label =
    waiting > 0
      ? `${waiting} ${waiting === 1 ? 'chat needs' : 'chats need'} you`
      : live > 0
        ? `AI handling ${live} ${live === 1 ? 'chat' : 'chats'}`
        : 'All quiet'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 16 }}>
      {/* color feeds both the dot and the ripple through currentColor. */}
      <span style={{ position: 'relative', width: 7, height: 7, flexShrink: 0, color: tone }}>
        {alive && !reduceMotion ? <span className="oc-pulse" aria-hidden="true" /> : null}
        <span style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'currentColor',
          boxShadow: alive ? '0 0 8px currentColor' : 'none',
        }} />
      </span>
      <span style={{
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: 0.1,
        color: alive ? sidebar.text : sidebar.textMuted,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
    </div>
  )
}

export function DashboardOceanNav({ activeNav, fillViewport, flatBackground, children }: DashboardOceanNavProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [isDrawerOpen, setDrawerOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [access, setAccess] = useState<BusinessAccess | null>(null)
  const [venueName, setVenueName] = useState<string | null>(null)
  // null while the first count is in flight, so the status line can hold its
  // height with a skeleton instead of shifting when the numbers land.
  const [chats, setChats] = useState<{ live: number; human: number } | null>(null)
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => 'dark' as const)
  const reduceMotion = useReducedMotion()

  const toggleTheme = useCallback(() => {
    setGlobalTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme])

  // The icon carries the state on its own, so the button needs a label for
  // screen readers and a tooltip for everyone else.
  const themeActionLabel = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`
  // Literal rgba rather than --t-* tokens: the tint tracks the icon (cool for
  // the moon, warm for the sun) rather than the sidebar accent.
  // `color` is only the type contract: ThemeIcon paints its own two layers.
  const themeBtn: IconButtonTone = theme === 'dark'
    ? { bg: 'rgba(96,184,255,0.10)', border: 'rgba(122,196,255,0.16)', bgHover: 'rgba(96,184,255,0.18)', borderHover: 'rgba(122,196,255,0.32)', color: sidebar.textMuted }
    : { bg: 'rgba(255,190,66,0.12)', border: 'rgba(255,190,66,0.20)', bgHover: 'rgba(255,190,66,0.20)', borderHover: 'rgba(255,190,66,0.36)', color: sidebar.textMuted }

  // Replaces the old hardcoded "Free plan": real role, real venue.
  const accountSubtitle = [access ? ROLE_LABEL[access.role] : null, venueName]
    .filter(Boolean)
    .join(' · ')

  useEffect(() => {
    let mounted = true
    const syncViewport = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (!mobile) setDrawerOpen(false)
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUserEmail(data.user?.email ?? null)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUserEmail(session?.user?.email ?? null)
    })

    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
      window.removeEventListener('resize', syncViewport)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    void resolveBusinessAccess().then(async (resolved) => {
      if (!mounted || !resolved) return
      setAccess(resolved)
      const { data } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', resolved.businessId)
        .maybeSingle()
      if (mounted) setVenueName(typeof data?.name === 'string' ? data.name : null)
    })
    return () => {
      mounted = false
    }
  }, [])

  // Open conversations, split by who is answering. 'closed' is the only
  // terminal status the app writes, so everything else is still open.
  useEffect(() => {
    const businessId = access?.businessId
    if (!businessId) return
    let mounted = true

    const load = async () => {
      const [live, human] = await Promise.all([
        buildChatCountQuery(businessId).or('status.is.null,status.eq.active'),
        buildChatCountQuery(businessId).eq('status', 'human'),
      ])
      if (!mounted) return
      const next = { live: live.count ?? 0, human: human.count ?? 0 }
      // Keep the previous object when the counts are unchanged: a fresh object
      // every 30s re-rendered the whole sidebar for nothing.
      setChats((prev) =>
        prev && prev.live === next.live && prev.human === next.human ? prev : next,
      )
    }

    void load()
    const id = setInterval(() => void load(), 30_000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [access?.businessId])

  const openChats = chats ? chats.live + chats.human : 0

  const openNav = useCallback(() => setDrawerOpen(true), [])
  const closeNav = useCallback(() => setDrawerOpen(false), [])
  const renderProps = useMemo(() => ({ isMobile, openNav, closeNav }), [isMobile, openNav, closeNav])

  // Each row carries its own delay instead of inheriting a `staggerChildren`
  // variant from the nav: the captions split the list across three wrappers,
  // and a container-driven stagger only orders its own direct children. Counted
  // across the whole rail, the entrance still runs top to bottom in one pass.
  const enter = (index: number) => ({
    initial: { opacity: 0, x: -10 },
    animate: { opacity: 1, x: 0 },
    transition: oceanTransition(reduceMotion, {
      duration: 0.22,
      delay: 0.1 + index * 0.07,
      ease: [0.4, 0, 0.2, 1] as const,
    }),
  })

  // Index of each group's caption in that single top-to-bottom count.
  const groupStart: number[] = []
  navGroups.reduce((index, group, i) => {
    groupStart[i] = index
    return index + group.items.length + 1
  }, 0)

  const navList = (
    <nav style={{ padding: '4px 16px 0' }}>
      {navGroups.map((group, groupIndex) => (
        <div key={group.label} className="oc-side-group" style={{ display: 'grid', gap: 4 }}>
          <motion.p className="oc-side-caption" {...enter(groupStart[groupIndex])}>
            {group.label}
          </motion.p>
          {group.items.map((item, itemIndex) => {
            const active = item.id === activeNav
            // Chats is the only queue that goes stale while you sit on another
            // page, so it is the only item that carries a count.
            const badge = item.id === 'Chats' && openChats > 0 ? openChats : null
            return (
              <motion.div key={item.id} {...enter(groupStart[groupIndex] + 1 + itemIndex)}>
                {/* Resting, hover and active states all live in globals.css
                    (.oc-side-link): imperative hover writes used to fight the
                    active styling and captured stale colours on re-render. */}
                <Link
                  href={item.href}
                  onClick={closeNav}
                  className="oc-side-link"
                  data-active={active}
                  aria-current={active ? 'page' : undefined}
                >
                  {active ? (
                    <motion.span
                      layoutId="nav-active-marker"
                      className="oc-side-marker"
                      aria-hidden="true"
                      transition={oceanTransition(reduceMotion, { duration: 0.3, ease: [0.23, 1, 0.32, 1] as const })}
                    />
                  ) : null}
                  <span className="oc-side-icon">{item.icon}</span>
                  <span className="oc-side-label">{item.id}</span>
                  {/* Telegram-style counter: flat fill, no glow or ring — the
                      bump is the only flourish. key={badge} swaps in a fresh
                      element on every count change so it pops rather than
                      just relabels — same trick the calendar month slide uses
                      for its transitions. mode="popLayout" pulls the outgoing
                      badge out of flow so it doesn't sit beside the incoming
                      one; the child itself skips the `layout` prop, since
                      that's for animating a box's own size/position changes
                      and this one only ever fades and scales in place.
                      AnimatePresence's own initial={false} only guards the
                      very first paint; badge is null then, so the first real
                      count still plays its full entrance. */}
                  <AnimatePresence mode="popLayout" initial={false}>
                    {badge !== null ? (
                      <motion.span
                        key={badge}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={oceanTransition(reduceMotion, { type: 'spring', stiffness: 500, damping: 20 })}
                        className="oc-badge"
                      >
                        {badge > 99 ? '99+' : badge}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </Link>
              </motion.div>
            )
          })}
        </div>
      ))}
    </nav>
  )

  const sidebarInner = (
    <aside
      className="oc-sidebar"
      style={{
        width: SIDEBAR_WIDTH,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 100,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      <AnimatedWaveLogo />

      {/* No rule under the logo: the section captions separate the rail now,
          and a divider on top of them read as two competing dividers. */}
      {navList}

      <div style={{ flex: 1 }} />


      {/* Bottom — what the room is doing, who is signed in, and the two
          controls that belong to a session rather than to a page. Both rows
          park their control in the same trailing column. */}
      <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${sidebar.border}`, display: 'grid', gap: 10 }}>
        {/* minWidth:0 on both rows: as grid items they default to min-width
            auto, which sizes them to the untruncated email and pushes the
            buttons outside the sidebar. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ServiceStatus chats={chats} reduceMotion={reduceMotion} />
          </div>
          <SidebarIconButton
            label={themeActionLabel}
            onClick={toggleTheme}
            tone={themeBtn}
            reduceMotion={reduceMotion}
            pressed={theme === 'dark'}
          >
            <ThemeIcon theme={theme} reduceMotion={reduceMotion} />
          </SidebarIconButton>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg, ${t.accent}, #6366f1)`,
            display: 'grid', placeItems: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff',
            boxShadow: '0 0 12px rgba(96,184,255,0.3)',
          }}>
            {userEmail ? userEmail[0].toUpperCase() : '?'}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              title={userEmail ?? undefined}
              style={{
                fontSize: 12, fontWeight: 600, color: sidebar.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {userEmail ?? 'Account'}
            </div>
            {accountSubtitle ? (
              <div
                title={accountSubtitle}
                style={{
                  fontSize: 11, color: sidebar.textMuted, marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {accountSubtitle}
              </div>
            ) : (
              <div style={{ height: 7, width: 72, borderRadius: 99, background: sidebar.surfaceHover, marginTop: 4 }} />
            )}
          </div>

          <SidebarIconButton
            label="Sign out"
            onClick={() => setLogoutOpen(true)}
            tone={SIGN_OUT_TONE}
            reduceMotion={reduceMotion}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </SidebarIconButton>
        </div>
        <DashboardLogoutButton hidden open={logoutOpen} onOpenChange={setLogoutOpen} />
      </div>
    </aside>
  )

  const outerStyle: CSSProperties = {
    minHeight: fillViewport ? undefined : '100vh',
    height: fillViewport ? '100vh' : undefined,
    overflow: fillViewport ? 'hidden' : undefined,
    position: 'relative',
    background: flatBackground ?? t.bgApp,
    color: t.text,
  }

  const contentStyle: CSSProperties = {
    position: 'relative',
    zIndex: 10,
    marginLeft: isMobile ? 0 : SIDEBAR_WIDTH,
    minHeight: '100vh',
    height: fillViewport ? '100vh' : undefined,
    padding: isMobile ? '20px 16px' : '36px',
    overflow: fillViewport ? 'hidden' : undefined,
  }

  return (
    <div style={outerStyle}>
      {!flatBackground ? (
        <div className="aurora-bg"><div className="blob3"/><div className="grain"/></div>
      ) : null}

      {!isMobile && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: SIDEBAR_WIDTH, height: '100vh', zIndex: 100 }}>
          {sidebarInner}
        </div>
      )}

      <AnimatePresence>
        {isMobile && isDrawerOpen ? (
          <motion.div
            initial="closed" animate="open" exit="closed"
            variants={drawerOverlay}
            transition={oceanTransition(reduceMotion)}
            onClick={closeNav}
            style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(2,12,20,0.7)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial="closed" animate="open" exit="closed"
              variants={drawerPanelLeft}
              transition={oceanTransition(reduceMotion)}
              onClick={(e) => e.stopPropagation()}
              style={{ width: SIDEBAR_WIDTH, height: '100vh' }}
            >
              {sidebarInner}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div style={contentStyle}>{children(renderProps)}</div>
    </div>
  )
}
