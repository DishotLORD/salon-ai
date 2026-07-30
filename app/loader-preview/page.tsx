import { notFound } from 'next/navigation'

import { OceanCoreLoader } from '@/components/oceancore-loader'

/**
 * A harness for staring at the brand loader without triggering a real
 * navigation. Useful locally, but it was shipping as a public URL — a blank
 * animated page anyone could find and index. Development only now.
 */
export default function LoaderPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <OceanCoreLoader />
}
