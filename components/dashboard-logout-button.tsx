'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabase'
import { modalContent, modalOverlay } from '@/lib/ocean-motion'

export function DashboardLogoutButton({
  iconOnly,
  hidden,
  open: controlledOpen,
  onOpenChange,
}: {
  iconOnly?: boolean
  hidden?: boolean
  open?: boolean
  onOpenChange?: (v: boolean) => void
} = {}) {
  const router = useRouter()
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = useCallback(
    (v: boolean) => (onOpenChange ?? setInternalOpen)(v),
    [onOpenChange],
  )
  const [mounted, setMounted] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    // Client-only: avoid SSR/CSR mismatch for document.body portal
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount gate for createPortal
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSigningOut) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, isSigningOut, setOpen])

  async function confirmLogout() {
    setIsSigningOut(true)
    try {
      await supabase.auth.signOut()
      router.push('/auth/login')
    } finally {
      setIsSigningOut(false)
    }
  }

  const transition = reduceMotion ? { duration: 0.01 } : undefined

  const modal =
    mounted && typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {open ? (
              <motion.div
                key="logout-overlay"
                role="presentation"
                initial="closed"
                animate="open"
                exit="closed"
                variants={modalOverlay}
                transition={transition}
                onClick={() => {
                  if (!isSigningOut) {
                    setOpen(false)
                  }
                }}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 10000,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                  background: 'rgba(15, 23, 42, 0.45)',
                }}
              >
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="dashboard-logout-title"
                  aria-describedby="dashboard-logout-desc"
                  initial="closed"
                  animate="open"
                  exit="closed"
                  variants={modalContent}
                  transition={transition}
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    width: '100%',
                    maxWidth: 400,
                    background: '#ffffff',
                    borderRadius: 16,
                    padding: '28px 28px 24px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 10px 25px rgba(15,23,42,0.12)',
                  }}
                >
                  <h2
                    id="dashboard-logout-title"
                    style={{
                      margin: 0,
                      fontSize: 22,
                      fontWeight: 700,
                      color: '#0f172a',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    Log out?
                  </h2>
                  <p
                    id="dashboard-logout-desc"
                    style={{
                      margin: '10px 0 0',
                      fontSize: 15,
                      lineHeight: 1.5,
                      color: '#64748b',
                    }}
                  >
                    Are you sure you want to log out of OceanCore?
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      gap: 12,
                      marginTop: 26,
                      justifyContent: 'flex-end',
                    }}
                  >
                    <motion.button
                      type="button"
                      disabled={isSigningOut}
                      onClick={() => setOpen(false)}
                      whileHover={{ scale: isSigningOut ? 1 : 1.02 }}
                      whileTap={{ scale: isSigningOut ? 1 : 0.98 }}
                      style={{
                        borderRadius: 12,
                        border: '1px solid #e2e8f0',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontWeight: 600,
                        fontSize: 14,
                        padding: '10px 18px',
                        cursor: isSigningOut ? 'not-allowed' : 'pointer',
                        opacity: isSigningOut ? 0.6 : 1,
                      }}
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      type="button"
                      disabled={isSigningOut}
                      onClick={() => void confirmLogout()}
                      whileHover={{ scale: isSigningOut ? 1 : 1.02 }}
                      whileTap={{ scale: isSigningOut ? 1 : 0.98 }}
                      style={{
                        border: 'none',
                        borderRadius: 12,
                        background: isSigningOut ? '#f1f5f9' : '#dc2626',
                        color: isSigningOut ? '#94a3b8' : '#fff',
                        fontWeight: 600,
                        fontSize: 14,
                        padding: '10px 18px',
                        cursor: isSigningOut ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isSigningOut ? 'Logging out…' : 'Log out'}
                    </motion.button>
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body
        )
      : null

  if (hidden) {
    return <>{modal}</>
  }

  if (iconOnly) {
    return (
      <>
        <motion.button
          type="button"
          onClick={() => setOpen(true)}
          whileHover={{ scale: 1.05, backgroundColor: 'rgba(248,113,113,0.12)' }}
          whileTap={{ scale: 0.95 }}
          style={{
            width: 44,
            height: 44,
            border: 'none',
            borderRadius: 12,
            background: 'transparent',
            color: '#6b9e88',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </motion.button>
        {modal}
      </>
    )
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{
          scale: 1.01,
          borderColor: '#fecaca',
          backgroundColor: '#fef2f2',
        }}
        whileTap={{ scale: 0.98 }}
        style={{
          width: '100%',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.04)',
          color: '#5b8a9e',
          fontWeight: 600,
          fontSize: 13,
          padding: '11px 14px',
          cursor: 'pointer',
          textAlign: 'center',
          transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        Log out
      </motion.button>
      {modal}
    </>
  )
}
