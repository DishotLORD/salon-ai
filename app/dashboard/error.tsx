'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard]', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#0a1628',
        color: '#e8f4fc',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 400 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 20 }}>
          {error.message || 'The dashboard hit an unexpected error.'}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '10px 20px',
            borderRadius: 10,
            border: 'none',
            background: '#38bdf8',
            color: '#0a1628',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
