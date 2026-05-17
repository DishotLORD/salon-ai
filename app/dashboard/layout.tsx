import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase-server'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!business) {
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
