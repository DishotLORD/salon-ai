import type { Metadata } from 'next'
import Link from 'next/link'

import { BrandNotice, noticeButtonStyle } from '@/components/brand-notice'

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <BrandNotice
      code="404"
      title="This table isn't set."
      body={
        <>
          The page you were looking for has moved or never existed. Everything else is still
          where you left it.
        </>
      }
      actions={
        <>
          <Link href="/" style={noticeButtonStyle.primary}>
            Back to home
          </Link>
          <Link href="/dashboard" style={noticeButtonStyle.ghost}>
            Open dashboard
          </Link>
        </>
      }
    />
  )
}
