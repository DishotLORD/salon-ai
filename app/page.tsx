import type { Metadata } from 'next'

import { OceanLandingPage } from '@/components/ocean-landing-page'

export const metadata: Metadata = {
  title: 'OceanCore — AI-powered operations',
  description: 'AI-powered operations for modern business. Chat agent, smart bookings, CRM & analytics.',
}

export default function Home() {
  return <OceanLandingPage />
}
