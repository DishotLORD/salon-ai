'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabase'

export function DashboardLogoutButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

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

  const modal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <>
            <style>{`
              @keyframes dashboard-logout-overlay-in {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes dashboard-logout-card-in {
                from {
                  opacity: 0;
                  transform: scale(0.97) translateY(10px);
                }
                to {
                  opacity: 1;
                  transform: scale(1) translateY(0);
                }
              }
              .dashboard-logout-overlay {
                animation: dashboard-logout-overlay-in 0.22s ease-out forwards;
              }
              .dashboard-logout-card {
                animation: dashboard-logout-card-in 0.26s ease-out 0.04s both;
              }
            `}</style>
            <div
              className="dashboard-logout-overlay"
              role="presentation"
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
                background: 'rgba(15, 23, 42, 0.55)',
                backdropFilter: 'blur(4px)',
              }}
            >
              <div
                className="dashboard-logout-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dashboard-logout-title"
                aria-describedby="dashboard-logout-desc"
                onClick={(event) => event.stopPropagation()}
                style={{
                  width: '100%',
                  maxWidth: 400,
                  background: '#ffffff',
                  borderRadius: 16,
                  padding: '28px 28px 24px',
                  boxShadow:
                    '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04)',
                  fontFamily:
                    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }}
              >
                <h2
                  id="dashboard-logout-title"
                  style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 700,
                    color: '#111827',
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
                    color: '#6b7280',
                  }}
                >
                  Are you sure you want to log out of Salon AI?
                </p>
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    marginTop: 26,
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    type="button"
                    disabled={isSigningOut}
                    onClick={() => setOpen(false)}
                    style={{
                      borderRadius: 10,
                      border: '1px solid #d1d5db',
                      background: '#ffffff',
                      color: '#374151',
                      fontWeight: 600,
                      fontSize: 14,
                      padding: '10px 18px',
                      cursor: isSigningOut ? 'not-allowed' : 'pointer',
                      opacity: isSigningOut ? 0.6 : 1,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSigningOut}
                    onClick={() => void confirmLogout()}
                    style={{
                      border: 'none',
                      borderRadius: 10,
                      background: isSigningOut ? '#f87171' : '#dc2626',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 14,
                      padding: '10px 18px',
                      cursor: isSigningOut ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isSigningOut ? 'Logging out…' : 'Log out'}
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          borderRadius: 10,
          border: '1px solid #d1d5db',
          background: '#ffffff',
          color: '#374151',
          fontWeight: 600,
          fontSize: 14,
          padding: '11px 14px',
          cursor: 'pointer',
        }}
      >
        Log out
      </button>
      {modal}
    </>
  )
}
