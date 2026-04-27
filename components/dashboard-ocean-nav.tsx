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
    <aside
      style={{
        width: 268,
        background: 'var(--ocean-card)',
        borderRight: '1px solid var(--ocean-border)',
        padding: '24px 14px 20px',
        display: 'flex',
        flexDirection: 'column',
        height: fillViewport ? '100%' : 'auto',
        minHeight: fillViewport ? '100%' : '100vh',
        boxShadow: 'var(--ocean-shadow-sm)',
      }}
    >
      <p
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.22em',
          color: 'var(--ocean-sky)',
          margin: '0 12px 6px',
          fontWeight: 700,
        }}
      >
        OceanCore
      </p>
      <div style={{ margin: '0 12px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--ocean-text)' }}>Operations</h2>
        {isMobile && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={closeNav}
            style={{
              border: 'none',
              background: 'rgba(56, 189, 248, 0.1)',
              borderRadius: 10,
              fontSize: 22,
              lineHeight: 1,
              color: 'var(--ocean-text)',
              cursor: 'pointer',
              width: 40,
              height: 40,
            }}
          >
            ×
          </button>
        )}
      </div>
      <nav style={{ display: 'grid', gap: 6 }}>
        {navItems.map((item) => {
          const isActive = item === activeNav
          return (
            <Link
              key={item}
              href={navLinks[item]}
              onClick={closeNav}
              style={{
                padding: '11px 13px',
                borderRadius: 'var(--ocean-radius-md)',
                fontSize: 14,
                fontWeight: 600,
                color: isActive ? 'var(--ocean-sky-bright)' : 'var(--ocean-text-muted)',
                background: isActive ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                border: isActive ? '1px solid var(--ocean-border-strong)' : '1px solid transparent',
                textDecoration: 'none',
                transition: `background var(--ocean-duration-fast) var(--ocean-ease-out), border-color var(--ocean-duration-fast) var(--ocean-ease-out), color var(--ocean-duration-fast) var(--ocean-ease-out)`,
              }}
            >
              {item}
            </Link>
          )
        })}
      </nav>
      <div style={{ marginTop: 'auto', padding: '0 8px', display: 'grid', gap: 10 }}>
        <DashboardLogoutButton />
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            width: '100%',
            border: 'none',
            borderRadius: 'var(--ocean-radius-md)',
            background: 'linear-gradient(135deg, var(--ocean-sky) 0%, #0ea5e9 100%)',
            color: 'var(--ocean-black)',
            fontWeight: 700,
            fontSize: 14,
            padding: '11px 14px',
            cursor: 'pointer',
            boxShadow: 'var(--ocean-shadow-glow)',
          }}
        >
          Deploy Agent
        </motion.button>
      </div>
    </aside>
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
                  boxShadow: 'var(--ocean-shadow-lg)',
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
