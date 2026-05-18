'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { DashboardLogoutButton } from '@/components/dashboard-logout-button'
import { drawerOverlay, drawerPanelLeft, oceanTransition } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'
import { t } from '@/lib/dashboard-theme'

export type OceanDashboardNavId = 'Dashboard' | 'Chats' | 'Bookings' | 'CRM' | 'Settings'

type DashboardOceanNavProps = {
  activeNav: OceanDashboardNavId
  fillViewport?: boolean
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

const SIDEBAR_WIDTH = 240

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

const navItems: NavItem[] = [
  { id: 'Dashboard', href: '/dashboard', icon: <IconDashboard /> },
  { id: 'Chats', href: '/dashboard/chats', icon: <IconChats /> },
  { id: 'Bookings', href: '/dashboard/bookings', icon: <IconBookings /> },
  { id: 'CRM', href: '/dashboard/crm', icon: <IconCRM /> },
  { id: 'Settings', href: '/dashboard/settings', icon: <IconSettings /> },
]

function AnimatedWaveLogo() {
  const ocean = 'Ocean'.split('')
  const core = 'Core'.split('')

  return (
    <Link href="/dashboard" style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '28px 24px 20px' }}>

        {/* Icon */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -15 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
          style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}
        >
          <motion.div
            animate={{ boxShadow: [`0 0 0px rgba(96,184,255,0)`, `0 0 16px rgba(96,184,255,0.5)`, `0 0 0px rgba(96,184,255,0)`] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            style={{ borderRadius: 10, overflow: 'hidden' }}
          >
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="10" fill="rgba(96,184,255,0.12)" />
              <motion.path
                d="M6 22c3-5 5-8 9-8s6 5 9 5 4-2.5 6-5"
                stroke={t.accent}
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1, d: [
                  'M6 22c3-5 5-8 9-8s6 5 9 5 4-2.5 6-5',
                  'M6 20c3-3 5-6 9-6s6 4 9 6 4-1 6-4',
                  'M6 22c3-5 5-8 9-8s6 5 9 5 4-2.5 6-5',
                ]}}
                transition={{ pathLength: { duration: 0.8, delay: 0.3 }, opacity: { duration: 0.3, delay: 0.3 }, d: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1.2 } }}
              />
              <motion.path
                d="M6 17c3-3 5-5 9-5s6 3 9 3 4-1.5 6-3"
                stroke={t.accent}
                strokeWidth="1.2"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.35, d: [
                  'M6 17c3-3 5-5 9-5s6 3 9 3 4-1.5 6-3',
                  'M6 15c3-2 5-4 9-4s6 3 9 4 4-1 6-3',
                  'M6 17c3-3 5-5 9-5s6 3 9 3 4-1.5 6-3',
                ]}}
                transition={{ pathLength: { duration: 0.8, delay: 0.5 }, opacity: { duration: 0.3, delay: 0.5 }, d: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1.7 } }}
              />
            </svg>
          </motion.div>
        </motion.div>

        {/* Text */}
        <div>
          <div style={{ fontFamily: 'var(--font-playfair, Georgia, serif)', fontSize: 18, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.01em', display: 'flex', overflow: 'hidden' }}>
            {ocean.map((char, i) => (
              <motion.span
                key={`o-${i}`}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                style={{ color: t.accent, display: 'inline-block' }}
              >
                {char}
              </motion.span>
            ))}
            {core.map((char, i) => (
              <motion.span
                key={`c-${i}`}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.35 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                style={{ color: t.text, display: 'inline-block' }}
              >
                {char}
              </motion.span>
            ))}
          </div>
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.7 }}
            style={{ fontSize: 10, color: t.textMuted, letterSpacing: '0.22em', textTransform: 'uppercase', marginTop: 4, fontWeight: 600 }}
          >
            Restaurant AI
          </motion.div>
        </div>
      </div>
    </Link>
  )
}

function IconSun() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M5 5l1.4 1.4M17.6 17.6 19 19M2 12h2M20 12h2M5 19l1.4-1.4M17.6 6.4 19 5"/>
    </svg>
  )
}

function IconMoon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z"/>
    </svg>
  )
}

export function DashboardOceanNav({ activeNav, fillViewport, children }: DashboardOceanNavProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [isDrawerOpen, setDrawerOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const initial = stored === 'light' ? 'light' : 'dark'
    setTheme(initial)
    document.documentElement.dataset.theme = initial
  }, [])

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
    document.documentElement.dataset.theme = next
  }, [theme])

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

  const openNav = useCallback(() => setDrawerOpen(true), [])
  const closeNav = useCallback(() => setDrawerOpen(false), [])
  const renderProps = useMemo(() => ({ isMobile, openNav, closeNav }), [isMobile, openNav, closeNav])

  const navList = (
    <motion.nav
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
      style={{ display: 'grid', gap: 2, padding: '8px 16px 0' }}
    >
      {navItems.map((item) => {
        const active = item.id === activeNav
        return (
          <motion.div
            key={item.id}
            variants={{
              hidden: { opacity: 0, x: -10 },
              visible: { opacity: 1, x: 0, transition: oceanTransition(reduceMotion, { duration: 0.22, ease: [0.4, 0, 0.2, 1] }) },
            }}
          >
            <Link
              href={item.href}
              onClick={closeNav}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 14px',
                borderRadius: 12,
                textDecoration: 'none',
                color: active ? t.accent : t.textMuted,
                background: active ? t.accentSoftBg : 'transparent',
                border: `1px solid ${active ? t.accentSoftBorder : 'transparent'}`,
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                transition: 'all 0.18s ease',
                boxShadow: active ? t.accentGlow : 'none',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.color = t.text
                  e.currentTarget.style.borderColor = t.borderSoft
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = t.textMuted
                  e.currentTarget.style.borderColor = 'transparent'
                }
              }}
            >
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
              <span>{item.id}</span>
              {active && (
                <motion.span
                  layoutId="nav-active-dot"
                  style={{
                    marginLeft: 'auto',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: t.accent,
                    boxShadow: `0 0 8px ${t.accent}`,
                  }}
                />
              )}
            </Link>
          </motion.div>
        )
      })}
    </motion.nav>
  )

  const sidebarInner = (
    <aside
      style={{
        width: SIDEBAR_WIDTH,
        height: '100vh',
        background: t.bgSidebar,
        borderRight: `1px solid ${t.border}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 100,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      <AnimatedWaveLogo />

      <div style={{ margin: '0 16px 12px', height: 1, background: t.border }} />

      {navList}

      {/* AI status + waveform filler */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        style={{ margin: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}
      >
        {/* AI Online card */}
        <div style={{
          padding: '12px 14px',
          borderRadius: 12,
          background: t.accentSoftBg,
          border: `1px solid ${t.accentSoftBorder}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <motion.span
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: 8, height: 8, borderRadius: '50%', background: t.accent, flexShrink: 0, boxShadow: `0 0 8px ${t.accent}` }}
          />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.accent }}>AI Online</div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>Ready for service</div>
          </div>
        </div>

        {/* Usage card */}
        <div style={{
          borderRadius: 12,
          border: `1px solid ${t.border}`,
          background: 'rgba(255,255,255,0.02)',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {/* Usage row */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: t.textMuted }}>Free plan</span>
              <span style={{ fontSize: 11, color: t.textSubtle }}>61 / 500</span>
            </div>
            <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '12.2%' }}
                transition={{ duration: 1, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
                style={{ height: '100%', borderRadius: 99, background: t.accent }}
              />
            </div>
          </div>

          {/* Upgrade CTA — matches nav item style */}
          <motion.div
            whileHover={{ background: t.accentSoftBg, borderColor: t.accentSoftBorder }}
            whileTap={{ scale: 0.98 }}
            style={{
              borderRadius: 8,
              border: `1px solid ${t.border}`,
              background: 'transparent',
              padding: '7px 12px',
              textAlign: 'center',
              cursor: 'pointer',
              color: t.textMuted,
              fontSize: 12,
              fontWeight: 500,
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            }}
          >
            Upgrade to Pro
          </motion.div>
        </div>
      </motion.div>


      {/* Theme toggle */}
      <div style={{ padding: '0 16px 8px' }}>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: 10,
            border: `1px solid ${t.border}`,
            background: 'transparent',
            color: t.textMuted,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'border-color 0.15s ease, background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = t.accentSoftBg
            e.currentTarget.style.borderColor = t.accentSoftBorder
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = t.border
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {theme === 'dark' ? <IconMoon /> : <IconSun />}
            <span>Dark mode</span>
          </span>
          {/* Toggle pill */}
          <span style={{
            display: 'inline-block',
            width: 34,
            height: 18,
            borderRadius: 9,
            background: theme === 'dark' ? t.accent : 'rgba(255,255,255,0.15)',
            border: `1px solid ${theme === 'dark' ? 'transparent' : t.border}`,
            position: 'relative',
            flexShrink: 0,
            transition: 'background 0.2s',
          }}>
            <span style={{
              position: 'absolute',
              top: 2,
              left: theme === 'dark' ? 16 : 2,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </span>
        </button>
      </div>

      {/* Bottom — profile */}
      <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${t.border}` }}>
        <motion.div
          whileHover={{ background: 'rgba(255,255,255,0.06)' }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${t.border}`,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onClick={() => setLogoutOpen(true)}
        >
          {/* Avatar */}
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg, ${t.accent}, #6366f1)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff',
            boxShadow: `0 0 12px rgba(96,184,255,0.3)`,
          }}>
            {userEmail ? userEmail[0].toUpperCase() : '?'}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userEmail ?? 'Account'}
            </div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>Free plan</div>
          </div>

          {/* Log out icon */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.textSubtle} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </motion.div>
        <DashboardLogoutButton hidden open={logoutOpen} onOpenChange={setLogoutOpen} />
      </div>
    </aside>
  )

  const outerStyle: CSSProperties = {
    minHeight: fillViewport ? undefined : '100vh',
    height: fillViewport ? '100vh' : undefined,
    overflow: fillViewport ? 'hidden' : undefined,
    position: 'relative',
    background: t.bgApp,
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
      {/* Aurora background — pure CSS, no JS */}
      <div className="aurora-bg"><div className="blob3"/><div className="grain"/></div>

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
