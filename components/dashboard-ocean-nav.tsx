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
}

const SIDEBAR_WIDTH = 220

const navItems: NavItem[] = [
  { id: 'Dashboard', href: '/dashboard' },
  { id: 'Chats', href: '/dashboard/chats' },
  { id: 'Bookings', href: '/dashboard/bookings' },
  { id: 'CRM', href: '/dashboard/crm' },
  { id: 'Settings', href: '/dashboard/settings' },
]

function SidebarBrand() {
  return (
    <div style={{ padding: '28px 20px 20px', width: '100%' }}>
      <div className="flex flex-col items-start">
        <div className="text-2xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
          <span style={{ color: t.accent }}>Ocean</span>
          <span style={{ color: t.text }}>Core</span>
        </div>
      </div>
    </div>
  )
}

export function DashboardOceanNav({ activeNav, fillViewport, children }: DashboardOceanNavProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [isDrawerOpen, setDrawerOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()

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

  const renderProps = useMemo(
    () => ({ isMobile, openNav, closeNav }),
    [isMobile, openNav, closeNav],
  )

  const navList = (
    <motion.nav
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
      }}
      style={{ display: 'grid', gap: 4, padding: '8px 12px 0' }}
    >
      {navItems.map((item) => {
        const active = item.id === activeNav

        return (
          <motion.div
            key={item.id}
            variants={{
              hidden: { opacity: 0, x: -8 },
              visible: {
                opacity: 1,
                x: 0,
                transition: oceanTransition(reduceMotion, {
                  duration: 0.2,
                  ease: [0.4, 0, 0.2, 1],
                }),
              },
            }}
          >
            <Link
              href={item.href}
              onClick={closeNav}
              onMouseEnter={(event) => {
                if (!active) {
                  event.currentTarget.style.background = t.bgSurfaceMuted
                  event.currentTarget.style.color = t.text
                }
              }}
              onMouseLeave={(event) => {
                if (!active) {
                  event.currentTarget.style.background = 'transparent'
                  event.currentTarget.style.color = t.textMuted
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 10,
                textDecoration: 'none',
                color: active ? t.accent : t.textMuted,
                background: active ? t.accentSoftBg : 'transparent',
                borderLeft: active ? `3px solid ${t.accent}` : '3px solid transparent',
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                transition: 'all 0.15s ease',
              }}
            >
              <span>{item.id}</span>
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
        background: t.bgSurface,
        borderRight: `1px solid ${t.border}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 100,
      }}
    >
      <SidebarBrand />
      {navList}

      <div
        style={{
          marginTop: 'auto',
          padding: '18px 14px 20px',
          display: 'grid',
          gap: 12,
          borderTop: `1px solid ${t.border}`,
        }}
      >
        <div
          style={{
            padding: '0 6px',
            fontSize: 11,
            color: t.textMuted,
            lineHeight: 1.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minHeight: 16,
          }}
        >
          {userEmail ?? '\u00a0'}
        </div>
        <DashboardLogoutButton />
        <Link href="/dashboard/settings?tab=widget" onClick={closeNav} style={{ textDecoration: 'none' }}>
          <motion.div
            whileHover={reduceMotion ? undefined : { y: -1 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            style={{
              width: '100%',
              borderRadius: 10,
              background: t.accent,
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 13,
              padding: '11px 12px',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            Deploy Concierge
          </motion.div>
        </Link>
      </div>
    </aside>
  )

  const desktopSidebar = (
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: SIDEBAR_WIDTH,
        height: '100vh',
        zIndex: 100,
      }}
    >
      {sidebarInner}
    </div>
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
    minHeight: fillViewport ? '100vh' : '100vh',
    height: fillViewport ? '100vh' : undefined,
    padding: isMobile ? '20px 16px' : '32px',
    background: t.bgApp,
    overflow: fillViewport ? 'hidden' : undefined,
  }

  return (
    <div style={outerStyle}>
      {!isMobile && desktopSidebar}

      <AnimatePresence>
        {isMobile && isDrawerOpen ? (
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={drawerOverlay}
            transition={oceanTransition(reduceMotion)}
            onClick={closeNav}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 140,
              background: 'rgba(15, 23, 42, 0.45)',
            }}
          >
            <motion.div
              initial="closed"
              animate="open"
              exit="closed"
              variants={drawerPanelLeft}
              transition={oceanTransition(reduceMotion)}
              onClick={(event) => event.stopPropagation()}
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
