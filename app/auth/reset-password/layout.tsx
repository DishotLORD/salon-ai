import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Reset your password',
}

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children
}
