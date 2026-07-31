import { notFound } from 'next/navigation'

import { OceanCoreLoader } from '@/components/oceancore-loader'

/**
 * A harness for staring at the brand loader without triggering a real
 * navigation. Useful locally, but it was shipping as a public URL — a blank
 * animated page anyone could find and index. Development only now.
 *
 * The gate that actually returns a 404 status lives in proxy.ts, because a
 * notFound() from here arrives as a streamed 200. This one is the backstop for
 * the day someone changes the proxy's matcher.
 */
export default function LoaderPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <OceanCoreLoader />
}
