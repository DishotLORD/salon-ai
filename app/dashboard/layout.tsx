import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { DashboardSplash } from '@/components/dashboard-splash'
import { getDashboardContext } from '@/lib/dashboard-context'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, access } = await getDashboardContext()

  if (!user) {
    redirect('/auth/login')
  }

  if (!access) {
    redirect('/onboarding')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a1628',
        color: '#e8f4fc',
      }}
    >
      <DashboardSplash />
      {children}
    </div>
  )
}
