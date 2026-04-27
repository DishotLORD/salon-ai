'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabase'
import { modalContent, modalOverlay } from '@/lib/ocean-motion'

export function DashboardLogoutButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
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
  }, [open, isSigningOut])

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
                  background: 'rgba(7, 11, 18, 0.65)',
                  backdropFilter: 'blur(6px)',
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
                    background: 'var(--ocean-card)',
                    borderRadius: 'var(--ocean-radius-lg)',
                    padding: '28px 28px 24px',
                    border: '1px solid var(--ocean-border)',
                    boxShadow: 'var(--ocean-shadow-lg)',
                  }}
                >
                  <h2
                    id="dashboard-logout-title"
                    style={{
                      margin: 0,
                      fontSize: 22,
                      fontWeight: 700,
                      color: 'var(--ocean-text)',
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
                      color: 'var(--ocean-text-muted)',
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
                        borderRadius: 'var(--ocean-radius-md)',
                        border: '1px solid var(--ocean-border)',
                        background: 'var(--ocean-surface)',
                        color: 'var(--ocean-text)',
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
                        borderRadius: 'var(--ocean-radius-md)',
                        background: isSigningOut ? 'var(--ocean-surface)' : 'var(--ocean-danger)',
                        color: '#fff',
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

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{ color: '#64748b' }}
        whileTap={{ scale: 0.98 }}
        style={{
          width: '100%',
          border: 'none',
          background: 'transparent',
          color: '#475569',
          fontWeight: 500,
          fontSize: 13,
          padding: '8px 4px',
          cursor: 'pointer',
          textAlign: 'center',
        }}
      >
        Log out
      </motion.button>
      {modal}
    </>
  )
}
