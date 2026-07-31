import type { Metadata } from 'next'

import { LegalPage, type LegalSection } from '@/components/legal-page'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'What OceanCore collects, who processes it, how long it is kept, and how a restaurant or a guest can have it deleted.',
  alternates: { canonical: '/privacy' },
}

/**
 * Written against what the code actually does — the subprocessor list below is
 * the real one (Supabase, OpenAI, Stripe, Resend, Geoapify, Vercel), not a
 * template's. Stripe requires a reachable privacy policy before it will take a
 * live payment, and a product that stores guest phone numbers needs one anyway.
 */
const SECTIONS: LegalSection[] = [
  {
    heading: 'Who this covers',
    blocks: [
      'OceanCore sells software to restaurants, bars and similar venues. Two different groups of people show up in our systems, and they are treated differently.',
      [
        'Venue accounts — the owner or staff who sign in to the dashboard. We are the controller of that data: it is our relationship with them.',
        'Guests — people who chat with a venue\'s concierge widget. The venue is the controller of that data; we process it on the venue\'s instructions. A guest asking to be forgotten should contact the venue, and the venue can act on it from the dashboard.',
      ],
    ],
  },
  {
    heading: 'What we collect',
    blocks: [
      'From a venue account: the email address and password hash used to sign in (or a Google account ID if Google sign-in is used), the venue name, address, phone number, opening hours, menu, seating layout, and any settings entered in the dashboard.',
      'From a guest conversation: the messages sent to the concierge, and whatever the guest chooses to give in order to book — usually a name, a phone number or email, party size, requested date and time, and any note they add such as an allergy, a dietary requirement or an occasion. Reservation history is kept against that guest so a returning guest does not have to repeat themselves.',
      'Automatically: the IP address a request came from (used for rate limiting, then discarded from our own logs within days), plus standard server logs from our hosting provider.',
      'We do not use advertising cookies, we do not run third-party trackers on the marketing site, and we do not sell data to anyone.',
    ],
  },
  {
    heading: 'What we use it for',
    blocks: [
      [
        'Running the concierge: answering guest questions, checking availability, and creating, moving or cancelling reservations.',
        'Sending the transactional email a booking implies — a confirmation to the guest, an alert to the venue.',
        'Showing the venue its own reservations, conversations, guest profiles and analytics.',
        'Taking a deposit, when the venue has turned deposits on.',
        'Keeping the service up: error reports, abuse and rate limiting, security investigation.',
        'Billing the venue for its subscription.',
      ],
      'Guest conversations are sent to a large language model so the concierge can reply. They are not used to train anyone\'s model.',
    ],
  },
  {
    heading: 'Who else processes it',
    blocks: [
      'We use a small number of subprocessors. Each one sees only what its job requires.',
      [
        'Supabase — database, authentication and file storage. Holds venue accounts, conversations, guests and reservations.',
        'OpenAI — generates the concierge\'s replies. Receives the conversation and the venue\'s context (hours, menu, seating). Under OpenAI\'s API terms this data is not used for model training.',
        'Stripe — deposit and subscription payments. Card details go directly to Stripe; they never touch our servers.',
        'Resend — sends transactional email. Sees the recipient address and the contents of that email.',
        'Geoapify — address suggestions while a venue types its address in settings. Sees the partial address, not the account.',
        'Vercel — hosting and content delivery. Sees request metadata such as IP address and user agent.',
      ],
      'Some of these operate outside Canada, which means guest and account data may be processed in the United States and the European Union.',
    ],
  },
  {
    heading: 'How long it is kept',
    blocks: [
      'Venue account data lives as long as the account does. Close the account and we delete it, and everything belonging to it, within 30 days — except records we are required to keep for tax or accounting, which are held for the statutory period.',
      'Guest conversations and reservations are kept for as long as the venue keeps them; a venue can delete an individual guest or conversation from the dashboard at any time, and the deletion is immediate and permanent.',
      'Backups roll off on their own schedule, which can extend the above by up to 30 days.',
    ],
  },
  {
    heading: 'Your rights',
    blocks: [
      'Depending on where you live, you can ask to see the data we hold about you, correct it, have it deleted, get a copy of it in a portable form, or object to a particular use of it. Canadian residents have these rights under PIPEDA; residents of the EU and UK under the GDPR; residents of California under the CCPA.',
      'For a venue account, write to hello@oceancore.ai from the account\'s email address and we will act within 30 days. For a guest, contact the venue you spoke to — they control that record and can remove it themselves. If you cannot reach the venue, write to us and we will pass the request on.',
    ],
  },
  {
    heading: 'Security',
    blocks: [
      'Traffic is encrypted in transit with TLS, and data is encrypted at rest by our database and storage providers. Dashboard access requires a password or a Google sign-in, and every query is scoped to the signed-in account at the database level, so one venue cannot read another\'s data.',
      'We do not store card numbers. Passwords are stored only as salted hashes and are not recoverable by us — which is why a forgotten password is reset rather than retrieved.',
      'No system is perfect. If we become aware of a breach affecting personal data, we will notify the affected accounts and the relevant regulator as the law requires.',
    ],
  },
  {
    heading: 'Children',
    blocks: [
      'OceanCore is a business tool and is not directed at children. We do not knowingly collect data from anyone under 16. If a guest conversation contains a child\'s details, that record belongs to the venue and can be deleted on request.',
    ],
  },
  {
    heading: 'Changes and contact',
    blocks: [
      'If we change this policy in a way that matters, we will email account holders before it takes effect and update the date at the top of this page.',
      'Questions, requests and complaints: hello@oceancore.ai.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="What we collect, why we have it, who else touches it, and how to get it back or get rid of it. Written to be read, not skimmed past."
      updated="30 July 2026"
      sections={SECTIONS}
      footnote={
        <>
          <strong>Before you go live:</strong> this policy describes how the software
          actually behaves, but it has not been reviewed by a lawyer. Have counsel check
          it against your jurisdiction, and fill in your registered company name and
          address, before you take real payments or sign your first venue.
        </>
      }
    />
  )
}
