import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isPlausibleGuestName } from '../lib/guest-display.ts'
import {
  isNameGroundedInGuestMessages,
  looksLikeContactNotName,
  type GroundingMessage,
} from '../lib/guest-name-grounding.ts'
import { checkGuestSession, generateGuestToken, hashGuestToken } from '../lib/guest-session.ts'

/**
 * End-to-end reconstruction of the live failure, at the level of the decisions
 * the booking path makes. Each test names the specific guarantee it protects.
 *
 * What happened: a guest typed "RoNIN NARRRR". The concierge had another
 * customer's profile ("Ronald Arauho") injected into its system prompt because a
 * contact typed in chat had been looked up in `customers`. It greeted them by
 * that name, offered their "usual spot", asked for the name again, and finally
 * confirmed the booking as "RONAAA SASSS".
 *
 * Three separate defects: the returning-guest lookup (source of the foreign
 * name), the prompt claiming knowledge it should not have, and a name guard weak
 * enough to accept the model's own output as evidence.
 */

const CROSSOVER_THREAD: GroundingMessage[] = [
  { role: 'user', content: 'hey, table for two tonight?' },
  {
    role: 'assistant',
    content:
      'Welcome back, Ronald! Shall I put this under Ronald Arauho, at your usual spot on the Patio?',
  },
  { role: 'user', content: 'RoNIN NARRRR' },
  { role: 'assistant', content: 'And your name for the reservation?' },
  { role: 'user', content: 'RoNIN NARRRR' },
]

/** The exact guard runCreateReservation applies to guest_name. */
function bookingAcceptsName(name: string, messages: GroundingMessage[]): boolean {
  return (
    isPlausibleGuestName(name) &&
    !looksLikeContactNotName(name) &&
    isNameGroundedInGuestMessages(name, messages)
  )
}

describe('C-1 crossover: the name that reaches the reservation', () => {
  it('books the name the guest typed', () => {
    assert.equal(bookingAcceptsName('RoNIN NARRRR', CROSSOVER_THREAD), true)
  })

  it('refuses the pre-existing customer\'s name', () => {
    // The exact value that was wrongly booked.
    assert.equal(bookingAcceptsName('Ronald Arauho', CROSSOVER_THREAD), false)
  })

  it('refuses the garbled name that was finally confirmed', () => {
    assert.equal(bookingAcceptsName('RONAAA SASSS', CROSSOVER_THREAD), false)
  })

  it('refuses a name that only the assistant introduced', () => {
    // The old guard matched "ronald" as a substring of the whole transcript,
    // including the assistant's own greeting. That is why it let this through.
    assert.equal(bookingAcceptsName('Ronald', CROSSOVER_THREAD), false)
  })

  it('is not fooled by the assistant repeating a name many times', () => {
    const insistent: GroundingMessage[] = [
      { role: 'user', content: 'table for 2' },
      { role: 'assistant', content: 'Ronald Arauho? Ronald? Mr Arauho?' },
      { role: 'assistant', content: 'Booking for Ronald Arauho.' },
    ]
    assert.equal(bookingAcceptsName('Ronald Arauho', insistent), false)
  })
})

describe('C-1: no identity is derived from a typed contact', () => {
  /*
   * The removed path was: extract a phone/email from the guest's text, SELECT the
   * matching customer, then treat the caller as that person. There is no function
   * left in the codebase that maps a contact to a stored customer, so the only
   * thing to assert here is the rule the remaining code follows — a contact is
   * data the guest supplied, never an authorisation.
   */
  const withStrangersPhone: GroundingMessage[] = [
    { role: 'user', content: 'hi, my number is 403-555-0134' },
    { role: 'assistant', content: 'Thanks! And your name for the reservation?' },
  ]

  it('a typed phone number grounds no name at all', () => {
    assert.equal(bookingAcceptsName('Ronald Arauho', withStrangersPhone), false)
    assert.equal(bookingAcceptsName('Guest', withStrangersPhone), false)
  })

  it('a contact does not become a name', () => {
    // Grounding alone accepts this — the guest did type it — so the booking
    // guard also has to reject strings that are contact details, not names.
    assert.equal(bookingAcceptsName('403-555-0134', withStrangersPhone), false)
    assert.equal(bookingAcceptsName('+1 (403) 555 0134', withStrangersPhone), false)
  })

  it('rejects an email address offered as a name', () => {
    const thread: GroundingMessage[] = [
      { role: 'user', content: 'you can reach me at ronin@example.com' },
    ]
    assert.equal(bookingAcceptsName('ronin@example.com', thread), false)
  })

  it('still accepts a name containing a digit', () => {
    const thread: GroundingMessage[] = [{ role: 'user', content: 'book it for Elena 2nd' }]
    assert.equal(looksLikeContactNotName('Elena 2nd'), false)
    assert.equal(bookingAcceptsName('Elena 2nd', thread), true)
  })
})

describe('C-1: conversation session is a capability, not an identity', () => {
  const now = new Date('2026-08-01T12:00:00.000Z')
  const token = generateGuestToken()
  const conversation = {
    guest_access_token_hash: hashGuestToken(token),
    guest_access_expires_at: '2026-08-01T13:00:00.000Z',
  }

  it('holding the token resumes the conversation', () => {
    assert.deepEqual(checkGuestSession(conversation, token, now), { ok: true })
  })

  it('knowing the conversation id is not enough', () => {
    // Before migration 021 the anon role could list every conversation id, so
    // the id alone must never grant anything.
    assert.deepEqual(checkGuestSession(conversation, null, now), {
      ok: false,
      reason: 'invalid_token',
    })
  })

  it('a conversation from before tokens cannot be resumed', () => {
    assert.deepEqual(
      checkGuestSession(
        { guest_access_token_hash: null, guest_access_expires_at: null },
        token,
        now,
      ),
      { ok: false, reason: 'no_session' },
    )
  })

  it('another guest\'s token does not open this conversation', () => {
    assert.deepEqual(checkGuestSession(conversation, generateGuestToken(), now), {
      ok: false,
      reason: 'invalid_token',
    })
  })
})
