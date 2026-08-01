import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  guestOwnText,
  isNameGroundedInGuestMessages,
  type GroundingMessage,
} from '../lib/guest-name-grounding.ts'

/**
 * The live crossover, reproduced.
 *
 * A guest typed "RoNIN NARRRR". The concierge had a different customer's profile
 * ("Ronald Arauho") injected into its system prompt, wrote that name into the
 * conversation itself, and then booked it — because the old guard compared only
 * the first word, as a substring, against every message including its own.
 */
const CROSSOVER_THREAD: GroundingMessage[] = [
  { role: 'user', content: 'hi i want a table for 2 tonight' },
  {
    role: 'assistant',
    content:
      "Lovely to see you again, Ronald! Shall I put this under Ronald Arauho, at your usual spot?",
  },
  { role: 'user', content: 'RoNIN NARRRR' },
  { role: 'assistant', content: 'And your name for the reservation?' },
  { role: 'user', content: 'i said RoNIN NARRRR' },
]

describe('identity crossover: RoNIN NARRRR', () => {
  it('accepts the name the guest actually typed', () => {
    assert.equal(isNameGroundedInGuestMessages('RoNIN NARRRR', CROSSOVER_THREAD), true)
  })

  it('accepts it regardless of case and punctuation', () => {
    assert.equal(isNameGroundedInGuestMessages('ronin narrrr', CROSSOVER_THREAD), true)
    assert.equal(isNameGroundedInGuestMessages('  RoNIN,  NARRRR!  ', CROSSOVER_THREAD), true)
  })

  it('rejects the other customer\'s name the assistant introduced', () => {
    assert.equal(isNameGroundedInGuestMessages('Ronald Arauho', CROSSOVER_THREAD), false)
  })

  it('rejects the garbled name that was finally confirmed', () => {
    assert.equal(isNameGroundedInGuestMessages('RONAAA SASSS', CROSSOVER_THREAD), false)
  })

  it('rejects a first name that only the assistant said', () => {
    // The exact failure of the old guard: it matched "ronald" as a substring of
    // the whole transcript, which included the assistant's own greeting.
    assert.equal(isNameGroundedInGuestMessages('Ronald', CROSSOVER_THREAD), false)
  })

  it('never treats assistant turns as evidence', () => {
    const text = guestOwnText(CROSSOVER_THREAD)
    assert.equal(text.includes('Ronald'), false)
    assert.equal(text.includes('usual spot'), false)
    assert.ok(text.includes('RoNIN NARRRR'))
  })
})

describe('grounding rules', () => {
  const guestSaidFullName: GroundingMessage[] = [
    { role: 'user', content: 'Booking under Maria Petrova please' },
  ]

  it('requires the whole name, not just one word of it', () => {
    assert.equal(isNameGroundedInGuestMessages('Maria Petrova', guestSaidFullName), true)
    assert.equal(isNameGroundedInGuestMessages('Maria Ivanova', guestSaidFullName), false)
  })

  it('requires consecutive words in order', () => {
    assert.equal(isNameGroundedInGuestMessages('Petrova Maria', guestSaidFullName), false)
  })

  it('matches whole words, never a fragment of a longer one', () => {
    const thread: GroundingMessage[] = [{ role: 'user', content: 'my name is Alexander' }]
    assert.equal(isNameGroundedInGuestMessages('Alex', thread), false)
    assert.equal(isNameGroundedInGuestMessages('Alexander', thread), true)
  })

  it('handles non-ASCII names', () => {
    const thread: GroundingMessage[] = [{ role: 'user', content: 'меня зовут Дмитрий Чорный' }]
    assert.equal(isNameGroundedInGuestMessages('Дмитрий Чорный', thread), true)
    assert.equal(isNameGroundedInGuestMessages('Дмитрий Иванов', thread), false)
  })

  it('rejects empty and non-string input', () => {
    assert.equal(isNameGroundedInGuestMessages('', CROSSOVER_THREAD), false)
    assert.equal(isNameGroundedInGuestMessages('   ', CROSSOVER_THREAD), false)
    assert.equal(
      isNameGroundedInGuestMessages(undefined as unknown as string, CROSSOVER_THREAD),
      false,
    )
  })

  it('rejects any name when the guest has written nothing', () => {
    const assistantOnly: GroundingMessage[] = [
      { role: 'assistant', content: 'Welcome back, Ronald Arauho!' },
    ]
    assert.equal(isNameGroundedInGuestMessages('Ronald Arauho', assistantOnly), false)
  })
})
