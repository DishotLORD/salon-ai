'use client'

import { useEffect } from 'react'

import { BrandNotice, noticeButtonStyle } from '@/components/brand-notice'

/**
 * Last line of defence: this replaces the root layout, so it catches the errors
 * `app/dashboard/error.tsx` cannot — a throw in the layout itself, or on any
 * route without a boundary of its own. Before this existed, one of those showed
 * Next's unstyled default page in production.
 *
 * It must render its own <html> and <body>: there is no layout above it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side log for this failure —
    // production strips the message before it reaches the browser.
    console.error('[global]', error.digest ?? '', error)
  }, [error])

  return (
    <html lang="en" data-theme="dark">
      <body style={{ margin: 0 }}>
        <title>Something went wrong — OceanCore</title>
        <BrandNotice
          code="500"
          title="Something went wrong on our side."
          body={
            <>
              The page failed to load. Trying again usually clears it — if it keeps happening,
              send us the reference below at{' '}
              <a href="mailto:hello@oceancore.ai" style={{ color: '#38bdf8' }}>
                hello@oceancore.ai
              </a>
              .
              {error.digest ? (
                <div
                  style={{
                    marginTop: 18,
                    fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                    fontSize: 12.5,
                    letterSpacing: '0.04em',
                    color: '#6b7f9c',
                  }}
                >
                  Reference {error.digest}
                </div>
              ) : null}
            </>
          }
          actions={
            <>
              <button type="button" onClick={() => reset()} style={noticeButtonStyle.primary}>
                Try again
              </button>
              {/* A plain anchor on purpose: this boundary catches failures in the
                  root layout, where the client router may never have finished
                  initialising. A hard navigation always works; Link may not. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" style={noticeButtonStyle.ghost}>
                Back to home
              </a>
            </>
          }
        />
      </body>
    </html>
  )
}
