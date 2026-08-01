import type { Metadata } from 'next'

import { LegalPage, type LegalSection } from '@/components/legal-page'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The agreement between OceanCore and the venues that use it: what the subscription includes, who owns the data, and how either side ends it.',
  alternates: { canonical: '/terms' },
}

const SECTIONS: LegalSection[] = [
  {
    heading: 'The agreement',
    blocks: [
      'These terms are between OceanCore, Inc. ("OceanCore", "we") and the business that opens an account ("you", "the venue"). Creating an account accepts them. If you are accepting on behalf of a company, you are confirming you have the authority to do so.',
    ],
  },
  {
    heading: 'What the service does',
    blocks: [
      'OceanCore provides an AI concierge you embed on your website, plus a dashboard for the reservations, conversations, guest records and analytics it produces.',
      'The concierge answers guests and books tables using the information you give it — your hours, menu, seating layout and booking rules. It is software, not a member of staff: it can misread a question, and a language model can be wrong. You are responsible for the accuracy of what you configure, and for the reservations your venue honours.',
    ],
  },
  {
    heading: 'Your account',
    blocks: [
      [
        'Keep your password to yourself, and use the team feature rather than sharing one login. You are responsible for what happens under your account.',
        'Tell us promptly if you believe an account has been compromised.',
        'Everything you enter — menu, prices, hours, policies — must be accurate and yours to publish.',
        'You must have the right to collect the guest data the concierge gathers on your behalf, and you must handle it lawfully. You are the controller of that data; we process it for you.',
      ],
    ],
  },
  {
    heading: 'Fees and billing',
    blocks: [
      'The subscription is $29 per venue per month unless we have agreed something else in writing. It renews automatically each month until cancelled, and it is billed in advance.',
      'Cancel at any time from the dashboard. Cancellation stops the next renewal; it does not refund the month already running. We do not pro-rate partial months.',
      'If you use guest deposits, Stripe processes those payments and charges its own fees. The deposit money is yours, and any dispute about a deposit is between you and your guest.',
      'We may change the price with at least 30 days\' notice by email. Continuing after the change takes effect accepts the new price.',
    ],
  },
  {
    heading: 'Who owns what',
    blocks: [
      'You own your data: your venue details, your menu, your conversations, your guests, your reservations. We claim no ownership of it and we do not sell it. We use it only to run the service for you and as described in the Privacy Policy.',
      'We own the software, the design and the brand. Nothing here grants you a licence to copy, resell or reverse-engineer it.',
      'You can export your reservations and guest list at any time. On request within 30 days of closing an account, we will provide a final export before deletion.',
    ],
  },
  {
    heading: 'Acceptable use',
    blocks: [
      'Do not use OceanCore to send unsolicited marketing, to impersonate someone, to collect data you have no right to collect, or to break the law. Do not probe, overload or attempt to circumvent the service\'s limits or security, and do not resell access to it without our written agreement.',
      'We may suspend an account that is causing harm — to guests, to other customers, or to the service — and we will tell you why.',
    ],
  },
  {
    heading: 'Availability',
    blocks: [
      'We work to keep OceanCore running and we monitor it continuously, but we do not promise uninterrupted service. Maintenance, a provider outage or a failure upstream can take it offline.',
      'While the concierge is unavailable, guests will not be answered and bookings will not be created. Keep a fallback — a phone number, a form, an inbox — so a guest is never left with nowhere to go.',
    ],
  },
  {
    heading: 'Liability',
    blocks: [
      'The service is provided as-is. To the fullest extent the law allows, we disclaim implied warranties of merchantability and fitness for a particular purpose.',
      'We are not liable for indirect, incidental or consequential loss, including lost profits, lost bookings or lost goodwill. Where liability cannot be excluded, our total liability for any claim is limited to the fees you paid in the twelve months before the claim arose.',
      'Nothing here limits liability for fraud, for death or personal injury caused by negligence, or for anything else that cannot lawfully be limited.',
    ],
  },
  {
    heading: 'Ending it',
    blocks: [
      'You can close your account at any time. We can end this agreement with 30 days\' notice, or immediately if you materially breach these terms or if we are required to by law.',
      'When the agreement ends, access stops and we delete your data on the schedule set out in the Privacy Policy.',
    ],
  },
  {
    heading: 'Changes, law and contact',
    blocks: [
      'We may update these terms; material changes come with at least 30 days\' notice by email, and the date at the top of this page will change.',
      'These terms are governed by the laws of the Province of Alberta and the federal laws of Canada, and the courts of Alberta have jurisdiction.',
      'Questions: hello@oceancore.ai.',
    ],
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="The deal between us and the venues that run on OceanCore: what you get, what you owe, who owns the data, and how either of us walks away."
      updated="30 July 2026"
      sections={SECTIONS}
      footnote={
        <>
          <strong>Before you go live:</strong> these terms match how the product works
          today, but they are a starting draft and not legal advice. Have a lawyer review
          them, and insert your registered company name, address and governing
          jurisdiction, before your first paying customer signs up.
        </>
      }
    />
  )
}
