'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { DashboardLogoutButton } from '@/components/dashboard-logout-button'
import { drawerOverlay, drawerPanelLeft } from '@/lib/ocean-motion'

export type OceanDashboardNavId = 'Dashboard' | 'Chats' | 'Bookings' | 'CRM' | 'Settings'

const navItems: OceanDashboardNavId[] = ['Dashboard', 'Chats', 'Bookings', 'CRM', 'Settings']

const navLinks: Record<OceanDashboardNavId, string> = {
  Dashboard: '/dashboard',
  Chats: '/dashboard/chats',
  Bookings: '/dashboard/bookings',
  CRM: '/dashboard/crm',
  Settings: '/dashboard/settings',
}

const letters = ['O', 'c', 'e', 'a', 'n']

const SIDEBAR_BG = '#0f172a'
const SIDEBAR_BORDER = '1px solid rgba(255, 255, 255, 0.06)'

const navHoverTransition = { duration: 0.15, ease: [0, 0, 0.2, 1] as const }

export type OceanNavRenderProps = {
  isMobile: boolean
  openNav: () => void
  closeNav: () => void
}

type DashboardOceanNavProps = {
  activeNav: OceanDashboardNavId
  /** Chats-style full viewport lock */
  fillViewport?: boolean
  children: (props: OceanNavRenderProps) => ReactNode
}

export function DashboardOceanNav({ activeNav, fillViewport, children }: DashboardOceanNavProps) {
  const [isMobile, setIsMobile] = useState(false)
  const [isDrawerOpen, setDrawerOpen] = useState(false)
  const [hoveredNavId, setHoveredNavId] = useState<OceanDashboardNavId | null>(null)

  useEffect(() => {
    function syncViewport() {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) {
        setDrawerOpen(false)
      }
    }
    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])

  const openNav = useCallback(() => setDrawerOpen(true), [])
  const closeNav = useCallback(() => setDrawerOpen(false), [])

  const renderProps = useMemo(
    () => ({ isMobile, openNav, closeNav }),
    [isMobile, openNav, closeNav],
  )

  const sidebar = (
    <motion.aside
      initial={{ x: -10 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      style={{
        position: 'relative',
        width: 268,
        background: SIDEBAR_BG,
        borderRight: SIDEBAR_BORDER,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        height: fillViewport ? '100%' : 'auto',
        minHeight: fillViewport ? '100%' : '100vh',
        boxSizing: 'border-box',
      }}
    >
      {isMobile && (
        <motion.button
          type="button"
          aria-label="Close menu"
          onClick={closeNav}
          whileHover={{ opacity: 0.85 }}
          whileTap={{ scale: 0.95 }}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 2,
            border: 'none',
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: 8,
            fontSize: 20,
            lineHeight: 1,
            color: '#e2e8f0',
            cursor: 'pointer',
            width: 36,
            height: 36,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          ×
        </motion.button>
      )}

      <motion.div
        style={{
          textAlign: 'center',
          padding: '32px 0 24px',
          width: '100%',
        }}
        aria-label="OceanCore"
      >
        <div style={{ display: 'inline-flex', alignItems: 'baseline', lineHeight: 1, justifyContent: 'center' }}>
          {letters.map((letter, i) => (
            <motion.span
              key={`${letter}-${i}`}
              animate={{ y: [0, -6, 0] }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: '#38bdf8',
                letterSpacing: '-0.03em',
                fontFamily: 'Georgia, serif',
                display: 'inline-block',
              }}
            >
              {letter}
            </motion.span>
          ))}
          <motion.span
            style={{
              fontSize: 18,
              fontWeight: 300,
              color: '#475569',
              letterSpacing: '0.05em',
              fontFamily: 'Georgia, serif',
            }}
          >
            Core
          </motion.span>
        </div>
      </motion.div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 0, width: '100%' }}>
        {navItems.map((item) => {
          const isActive = item === activeNav
          const isHovered = hoveredNavId === item

          let color = '#64748b'
          if (isActive) {
            color = '#38bdf8'
          } else if (isHovered) {
            color = '#e2e8f0'
          }

          return (
            <motion.div
              key={item}
              style={{ width: '100%' }}
              whileHover={{ x: 4 }}
              transition={navHoverTransition}
            >
              <Link
                href={navLinks[item]}
                onClick={closeNav}
                onMouseEnter={() => setHoveredNavId(item)}
                onMouseLeave={() => setHoveredNavId(null)}
                style={{
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 500,
                  color,
                  textDecoration: 'none',
                  background: isActive ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                  borderLeft: isActive ? '3px solid #38bdf8' : '3px solid transparent',
                  transition: 'color 0.15s ease, background 0.15s ease',
                }}
              >
                {item}
              </Link>
            </motion.div>
          )
        })}
      </nav>

      <div
        style={{
          marginTop: 'auto',
          padding: '20px 16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <DashboardLogoutButton />
        <motion.button
          type="button"
          whileHover={{ scale: 1.02, opacity: 0.95 }}
          whileTap={{ scale: 0.98 }}
          style={{
            width: '100%',
            border: 'none',
            borderRadius: 8,
            background: '#0ea5e9',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: 13,
            padding: '10px',
            cursor: 'pointer',
          }}
        >
          Deploy Agent
        </motion.button>
      </div>
    </motion.aside>
  )

  const outer: CSSProperties = {
    minHeight: fillViewport ? undefined : '100vh',
    height: fillViewport ? '100vh' : undefined,
    overflow: fillViewport ? 'hidden' : undefined,
    background: 'var(--ocean-mid)',
    color: 'var(--ocean-text)',
    fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
  }

  const row: CSSProperties = {
    display: 'flex',
    minHeight: fillViewport ? '100%' : '100vh',
    height: fillViewport ? '100%' : undefined,
  }

  const mainColumn: CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: fillViewport ? 'hidden' : undefined,
  }

  return (
    <div style={outer}>
      <div style={row}>
        {!isMobile && sidebar}

        <AnimatePresence>
          {isMobile && isDrawerOpen ? (
            <motion.div
              key="ocean-nav-drawer"
              role="presentation"
              initial="closed"
              animate="open"
              exit="closed"
              variants={drawerOverlay}
              onClick={closeNav}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 40,
                background: 'rgba(7, 11, 18, 0.62)',
                backdropFilter: 'blur(6px)',
              }}
            >
              <motion.div
                role="presentation"
                variants={drawerPanelLeft}
                initial="closed"
                animate="open"
                exit="closed"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 268,
                  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
                }}
              >
                {sidebar}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div style={mainColumn}>{children(renderProps)}</div>
      </div>
    </div>
  )
}
