'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'

import { DashboardLogoutButton } from '@/components/dashboard-logout-button'
import { drawerOverlay, drawerPanelLeft, oceanTransition } from '@/lib/ocean-motion'
import { supabase } from '@/lib/supabase'

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
  {
    id: 'Dashboard',
    href: '/dashboard',
  },
  {
    id: 'Chats',
    href: '/dashboard/chats',
  },
  {
    id: 'Bookings',
    href: '/dashboard/bookings',
  },
  {
    id: 'CRM',
    href: '/dashboard/crm',
  },
  {
    id: 'Settings',
    href: '/dashboard/settings',
  },
]

const glassSurface = 'rgba(5, 12, 28, 0.7)'

const logoStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '28px 20px 20px',
  justifyContent: 'flex-start',
  width: '100%',
}

function SidebarBrand() {
  return (
    <>
      <style>{`
        @keyframes oceanicFloat {
          0%, 100% { transform: translateY(0px); filter: drop-shadow(0 4px 12px rgba(14, 165, 233, 0.3)); }
          50% { transform: translateY(-4px); filter: drop-shadow(0 8px 16px rgba(56, 189, 248, 0.5)); }
        }
        @keyframes textShimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes coreGlow {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); box-shadow: 0 0 12px #38bdf8; }
        }
      `}</style>
      <div style={logoStyle}>
        
        <div style={{
          position: 'relative',
          width: '34px',
          height: '34px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          animation: 'oceanicFloat 5s ease-in-out infinite',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(145deg, rgba(14,165,233,0.2) 0%, rgba(5,13,26,0.8) 100%)',
            borderRadius: '12px',
            border: '1px solid rgba(56,189,248,0.2)',
            transform: 'rotate(15deg)',
            transition: 'all 0.3s ease',
          }} />
          
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative', zIndex: 1, left: '-1px' }}>
            <path d="M2 12c4-4 6-4 10 0s6 4 10 0" />
            <path d="M2 17c4-4 6-4 10 0s6 4 10 0" opacity="0.4" />
          </svg>

          <div style={{
            position: 'absolute',
            width: '6px',
            height: '6px',
            background: '#ffffff',
            borderRadius: '50%',
            top: '6px',
            right: '8px',
            zIndex: 2,
            animation: 'coreGlow 3s ease-in-out infinite',
          }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', letterSpacing: '-0.01em' }}>
          <span
            style={{
              fontSize: '24px',
              fontFamily: 'var(--font-playfair), Playfair Display, Georgia, serif',
              fontWeight: 700,
              background: 'linear-gradient(to right, #ffffff 20%, #38bdf8 50%, #ffffff 80%)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'textShimmer 6s linear infinite',
            }}
          >
            Ocean
          </span>
          <span
            style={{
              fontSize: '24px',
              fontFamily: 'var(--font-playfair), Playfair Display, Georgia, serif',
              fontWeight: 400,
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            Core
          </span>
        </div>
      </div>
    </>
  )
}

export function DashboardOceanNav({ activeNav, fillViewport, children }: DashboardOceanNavProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [isDrawerOpen, setDrawerOpen] = useState(false)
  const [userEmail, setUserEmail] = useState('operator@oceancore.ai')
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    let mounted = true
    const syncViewport = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (!mobile) {
        setDrawerOpen(false)
      }
    }

    void supabase.auth.getUser().then(({ data }) => {
      if (mounted && data.user?.email) {
        setUserEmail(data.user.email)
      }
    })

    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => {
      mounted = false
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
        visible: {
          transition: { staggerChildren: 0.06, delayChildren: 0.08 },
        },
      }}
      style={{ display: 'grid', gap: 8, padding: '8px 12px 0' }}
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
            whileHover={reduceMotion ? undefined : { x: 3 }}
          >
            <Link
              href={item.href}
              onClick={closeNav}
              onMouseEnter={(event) => {
                if (!active) {
                  event.currentTarget.style.color = 'rgba(255,255,255,0.8)'
                }
              }}
              onMouseLeave={(event) => {
                if (!active) {
                  event.currentTarget.style.color = 'rgba(255,255,255,0.4)'
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 16px',
                borderRadius: 10,
                textDecoration: 'none',
                color: active ? '#38bdf8' : 'rgba(255,255,255,0.4)',
                background: 'transparent',
                borderLeft: active ? '2px solid #38bdf8' : '2px solid transparent',
                fontSize: 14,
                fontWeight: 400,
                transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
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
        background: glassSurface,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
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
        }}
      >
        <div
          style={{
            padding: '0 6px',
            fontSize: 11,
            color: 'rgba(255,255,255,0.3)',
            lineHeight: 1.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {userEmail}
        </div>
        <DashboardLogoutButton />
        <motion.button
          type="button"
          whileHover={reduceMotion ? undefined : { y: -1, boxShadow: '0 14px 30px rgba(14,165,233,0.32)' }}
          whileTap={reduceMotion ? undefined : { scale: 0.98 }}
          style={{
            width: '100%',
            border: 'none',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: 13,
            padding: '11px 12px',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(14,165,233,0.24)',
          }}
        >
          Deploy Agent
        </motion.button>
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
    background: 'transparent',
    color: '#fff',
  }

  const contentStyle: CSSProperties = {
    position: 'relative',
    zIndex: 10,
    marginLeft: isMobile ? 0 : SIDEBAR_WIDTH,
    minHeight: fillViewport ? '100vh' : '100vh',
    height: fillViewport ? '100vh' : undefined,
    padding: isMobile ? '20px 16px' : '32px',
    background: 'transparent',
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
              background: 'rgba(5, 15, 30, 0.7)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
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
