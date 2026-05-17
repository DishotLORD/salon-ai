'use client'

import { useEffect } from 'react'

export default function WidgetError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[widget]', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'var(--ocean-deep, #0a1628)',
        color: 'var(--ocean-text, #e8f4fc)',
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div>
        <p style={{ marginBottom: 12 }}>Chat unavailable</p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#38bdf8',
            color: '#0a1628',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    </div>
  )
}
