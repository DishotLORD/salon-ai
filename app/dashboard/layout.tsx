import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { resolveBusinessAccessServer } from '@/lib/business-access-server'
import { createClient } from '@/lib/supabase-server'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const access = await resolveBusinessAccessServer(supabase, user.id)

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
      {children}
    </div>
  )
}
