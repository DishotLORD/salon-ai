import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildQuickReplies,
  finalQuestionOf,
  offersTimeChoice,
  pendingFieldFromText,
  pendingFieldFromToolSignals,
  quickRepliesForField,
  resolvePendingField,
  type PendingField,
  type ToolSignal,
} from '../lib/pending-field.ts'

const ZONES = ['Main', 'Patio', 'Bar']
const TIMES = ['7:00 PM', '7:15 PM', '7:30 PM']

/** Shorthand for a tool that refused, naming the fields it still needs. */
const missing = (...fields: string[]): ToolSignal => ({
  result: { ok: false, error: 'missing_fields', missing_fields: fields },
})

// ─── Field → chips ────────────────────────────────────────────────────────────

describe('each field offers its own replies and nothing else', () => {
  const cases: { field: PendingField; expected: string[] }[] = [
    {
      field: 'party_size',
      expected: ['Just me', '2 people', '3 people', '4 people', '5 people', '6 people'],
    },
    { field: 'date', expected: ['Today', 'Tomorrow', 'Weekend'] },
    { field: 'time', expected: TIMES },
    { field: 'seating_area', expected: ['Main', 'Patio', 'Bar', 'No preference'] },
    { field: 'guest_name', expected: [] },
    { field: 'contact_method', expected: ['Phone', 'Email'] },
    { field: 'confirmation', expected: ['Confirm', 'Change details'] },
    { field: 'special_requests', expected: ['No special requests'] },
    { field: 'completed', expected: [] },
  ]

  for (const { field, expected } of cases) {
    it(`${field}`, () => {
      assert.deepEqual(
        quickRepliesForField(field, { zoneNames: ZONES, availableTimes: TIMES }),
        expected,
      )
    })
  }

  it('no field means no replies', () => {
    assert.deepEqual(quickRepliesForField(null, { zoneNames: ZONES, availableTimes: TIMES }), [])
  })
})

describe('time chips never appear under another question', () => {
  for (const field of ['guest_name', 'contact_method', 'seating_area', 'special_requests'] as const) {
    it(`no times when asking for ${field}`, () => {
      const replies = quickRepliesForField(field, { zoneNames: ZONES, availableTimes: TIMES })
      for (const t of TIMES) {
        assert.equal(replies.includes(t), false, `${t} leaked into ${field}`)
      }
    })
  }

  it('offers no time chips when nothing is actually open', () => {
    // An empty list is the honest answer; a chip here would offer a table that
    // does not exist.
    assert.deepEqual(quickRepliesForField('time', { availableTimes: [] }), [])
  })
})

// ─── Tools are authoritative ──────────────────────────────────────────────────

describe('the pending field comes from tool state, not from prose', () => {
  it('reads a refusal that names its missing field', () => {
    assert.equal(pendingFieldFromToolSignals([missing('seating_area')]), 'seating_area')
    assert.equal(pendingFieldFromToolSignals([missing('guest_name')]), 'guest_name')
  })

  it('asks for the earliest missing field when several are missing', () => {
    // Collection order is date → party_size → time → seating_area → guest_name.
    assert.equal(
      pendingFieldFromToolSignals([missing('guest_name', 'date', 'seating_area')]),
      'date',
    )
    assert.equal(pendingFieldFromToolSignals([missing('guest_name', 'time')]), 'time')
  })

  it('maps each refusal code to its field', () => {
    const codes: [string, PendingField][] = [
      ['missing_contact', 'contact_method'],
      ['past_date', 'date'],
      ['beyond_booking_window', 'date'],
      ['closed_day', 'date'],
      ['party_too_large', 'party_size'],
      ['party_size_not_accepted', 'party_size'],
      ['not_available', 'time'],
      ['activity_taken', 'time'],
    ]
    for (const [error, field] of codes) {
      assert.equal(pendingFieldFromToolSignals([{ result: { ok: false, error } }]), field, error)
    }
  })

  it('does NOT let a successful availability lookup demand the turn', () => {
    // Availability is information the concierge may state and move on from. It
    // offers a time choice; it does not insist the guest is making one.
    const lookups: ToolSignal[][] = [
      [{ result: { ok: true, available_times: TIMES } }],
      [{ result: { ok: true, matches: [{ date: '2026-08-07', times: ['7:00 PM'] }] } }],
    ]
    for (const signals of lookups) {
      assert.equal(pendingFieldFromToolSignals(signals), null)
      assert.equal(offersTimeChoice(signals), true)
    }
  })

  it('an availability lookup still ends at "time" when nothing else claims the turn', () => {
    assert.equal(
      resolvePendingField({
        toolSignals: [{ result: { ok: true, available_times: TIMES } }],
        assistantText: 'Here is what we have that evening.',
      }),
      'time',
    )
  })

  it('a created, cancelled or moved booking ends the questioning', () => {
    assert.equal(pendingFieldFromToolSignals([{ result: { ok: true }, created: true }]), 'completed')
    assert.equal(
      pendingFieldFromToolSignals([{ result: { ok: true }, cancelled: true }]),
      'completed',
    )
    assert.equal(
      pendingFieldFromToolSignals([{ result: { ok: true }, rescheduled: true }]),
      'completed',
    )
  })

  it('the last tool of a turn wins', () => {
    // Availability was checked, then booking failed on the name: the open
    // question is the name, not a time.
    assert.equal(
      pendingFieldFromToolSignals([
        { result: { ok: true, available_times: TIMES } },
        missing('guest_name'),
      ]),
      'guest_name',
    )
  })

  it('tool state overrides what the reply text seems to say', () => {
    const field = resolvePendingField({
      toolSignals: [missing('seating_area')],
      // The model wrote something that reads like a time question.
      assistantText: 'What time works for you?',
      zoneNames: ZONES,
    })
    assert.equal(field, 'seating_area')
  })

  it('silent tools do not override the text', () => {
    // save_guest_details returns a bare ok and says nothing about what is next.
    const field = resolvePendingField({
      toolSignals: [{ result: { ok: true } }],
      assistantText: 'And your name for the reservation?',
      zoneNames: ZONES,
    })
    assert.equal(field, 'guest_name')
  })
})

// ─── Mixed-intent replies ─────────────────────────────────────────────────────

describe('mixed intent: a statement followed by a different question', () => {
  /** The reported bug, verbatim. */
  const MIXED = '2:30 PM is available. Where would you prefer to sit?'

  it('"2:30 PM is available. Where would you prefer to sit?" → zone chips only', () => {
    const replies = buildQuickReplies({
      // check_availability succeeded and confirmed the requested time.
      toolSignals: [
        {
          result: {
            ok: true,
            requested_time: '2:30 PM',
            requested_time_available: true,
            available_times: ['2:30 PM', '2:45 PM', '3:00 PM'],
          },
        },
      ],
      assistantText: MIXED,
      zoneNames: ZONES,
      availableTimes: ['2:30 PM', '2:45 PM', '3:00 PM'],
    })

    assert.deepEqual(replies, ['Main', 'Patio', 'Bar', 'No preference'])
  })

  it('never offers the confirmed time as a chip', () => {
    const replies = buildQuickReplies({
      toolSignals: [
        {
          result: {
            ok: true,
            requested_time: '2:30 PM',
            requested_time_available: true,
            available_times: ['2:30 PM', '2:45 PM'],
          },
        },
      ],
      assistantText: MIXED,
      zoneNames: ZONES,
      availableTimes: ['2:30 PM', '2:45 PM'],
    })
    assert.equal(replies.includes('2:30 PM'), false)
  })

  it('resolves the field to seating_area, not time', () => {
    assert.equal(
      resolvePendingField({
        toolSignals: [{ result: { ok: true, available_times: ['2:30 PM'] } }],
        assistantText: MIXED,
        zoneNames: ZONES,
      }),
      'seating_area',
    )
  })

  it('an availability confirmation alone is informational, not a demand', () => {
    // The tools no longer claim the turn just because they found open times.
    assert.equal(
      pendingFieldFromToolSignals([{ result: { ok: true, available_times: TIMES } }]),
      null,
    )
  })

  it('only the FINAL question counts', () => {
    const cases: [string, PendingField][] = [
      ['7:00 PM works. And your name for the reservation?', 'guest_name'],
      ['That time is free. Any special requests?', 'special_requests'],
      ['Great, 8 PM it is. What is the best number to reach you?', 'contact_method'],
      // The other direction: a seating remark, then a time question.
      ['The Patio is lovely. What time suits you?', 'time'],
    ]
    for (const [text, field] of cases) {
      assert.equal(pendingFieldFromText(text, ZONES), field, text)
    }
  })

  it('extracts the closing question from a multi-sentence reply', () => {
    assert.equal(
      finalQuestionOf('2:30 PM is available. Where would you prefer to sit?'),
      'Where would you prefer to sit?',
    )
    assert.equal(finalQuestionOf('No question here.'), null)
    assert.equal(finalQuestionOf('First? Second?'), 'Second?')
  })

  it('still offers times when the closing question IS about time', () => {
    assert.deepEqual(
      buildQuickReplies({
        toolSignals: [{ result: { ok: true, available_times: TIMES } }],
        assistantText: 'We have a few tables that evening. What time suits you?',
        zoneNames: ZONES,
        availableTimes: TIMES,
      }),
      TIMES,
    )
  })

  it('still offers times when open slots were found and nothing was asked', () => {
    // Informational signal is the last resort, so this behaviour is preserved.
    assert.deepEqual(
      buildQuickReplies({
        toolSignals: [{ result: { ok: true, available_times: TIMES } }],
        assistantText: 'We have tables from 5 PM to 9 PM that evening.',
        zoneNames: ZONES,
        availableTimes: TIMES,
      }),
      TIMES,
    )
  })

  it('a refusal still overrides the closing question', () => {
    // Facts about the booking beat prose: the seating field is genuinely missing.
    assert.equal(
      resolvePendingField({
        toolSignals: [missing('seating_area')],
        assistantText: 'What time works for you?',
        zoneNames: ZONES,
      }),
      'seating_area',
    )
  })
})

// ─── Text fallback ────────────────────────────────────────────────────────────

describe('text is the fallback for turns where no tool ran', () => {
  const cases: [string, PendingField][] = [
    ['What day were you thinking?', 'date'],
    ['For how many guests?', 'party_size'],
    ['What time suits you?', 'time'],
    ['Do you have a seating preference — Main, Patio or Bar?', 'seating_area'],
    ['Main, Patio or Bar?', 'seating_area'],
    ['And your name for the reservation?', 'guest_name'],
    ["What's the best number for the team to reach you?", 'contact_method'],
    ['Any special requests? Dietary needs, an occasion?', 'special_requests'],
    ['Shall I book that for you?', 'confirmation'],
  ]

  for (const [text, field] of cases) {
    it(`"${text}" → ${field}`, () => {
      assert.equal(pendingFieldFromText(text, ZONES), field)
    })
  }

  it('a statement is not a question', () => {
    assert.equal(pendingFieldFromText('The Patio is lovely this time of year.', ZONES), null)
  })

  it('a confirmation ends the flow even though it names a zone', () => {
    assert.equal(
      pendingFieldFromText("You're all set — Patio at 7:00 PM. We look forward to seeing you!", ZONES),
      'completed',
    )
  })

  it('handles empty and non-string input', () => {
    assert.equal(pendingFieldFromText('', ZONES), null)
    assert.equal(pendingFieldFromText(undefined as unknown as string, ZONES), null)
  })
})

// ─── The full booking flow ────────────────────────────────────────────────────

describe('full booking flow: date → confirmation', () => {
  /** One turn as the chat route sees it. */
  const turn = (toolSignals: ToolSignal[], assistantText: string) =>
    buildQuickReplies({ toolSignals, assistantText, zoneNames: ZONES, availableTimes: TIMES })

  it('walks every step, never repeating the previous step\'s chips', () => {
    const steps: { name: string; replies: string[]; expected: string[] }[] = [
      {
        name: '1. opening — asks for the date',
        replies: turn([], 'Happy to help! What day were you thinking?'),
        expected: ['Today', 'Tomorrow', 'Weekend'],
      },
      {
        name: '2. asks party size',
        replies: turn([], 'Lovely. And for how many guests?'),
        expected: ['Just me', '2 people', '3 people', '4 people', '5 people', '6 people'],
      },
      {
        name: '3. availability checked — choose a time',
        replies: turn(
          [{ result: { ok: true, available_times: TIMES } }],
          'We have a few tables that evening — what time suits you?',
        ),
        expected: TIMES,
      },
      {
        name: '4. booking refused on seating — zones, NOT the time just picked',
        replies: turn([missing('seating_area')], 'Where would you like to sit?'),
        expected: ['Main', 'Patio', 'Bar', 'No preference'],
      },
      {
        name: '5. booking refused on the name — nothing to tap',
        replies: turn([missing('guest_name')], 'And your name for the reservation?'),
        expected: [],
      },
      {
        name: '6. contact required',
        replies: turn(
          [{ result: { ok: false, error: 'missing_contact' } }],
          'Could I take a phone number or email for the confirmation?',
        ),
        expected: ['Phone', 'Email'],
      },
      {
        name: '7. special requests',
        replies: turn([], 'Any special requests? Dietary needs, an occasion?'),
        expected: ['No special requests'],
      },
      {
        name: '8. confirmation',
        replies: turn([], 'Table for four on the Patio at 7:00 PM. Shall I confirm that?'),
        expected: ['Confirm', 'Change details'],
      },
      {
        name: '9. booked — nothing left to ask',
        replies: turn(
          [{ result: { ok: true }, created: true }],
          "You're all set — we look forward to seeing you!",
        ),
        expected: [],
      },
    ]

    for (const step of steps) {
      assert.deepEqual(step.replies, step.expected, step.name)
    }

    // The reported bug, stated as an invariant over the whole flow: once past
    // the time step, no later step may show a time.
    for (const step of steps.slice(3)) {
      for (const t of TIMES) {
        assert.equal(step.replies.includes(t), false, `${t} carried into ${step.name}`)
      }
    }

    // And no two consecutive steps offer the same list.
    for (let i = 1; i < steps.length; i++) {
      if (steps[i].expected.length === 0) continue
      assert.notDeepEqual(
        steps[i].replies,
        steps[i - 1].replies,
        `${steps[i].name} repeated the previous step's chips`,
      )
    }
  })

  it('a re-asked field offers its own chips again, not the last ones', () => {
    // Guest gives a past date after choosing a time: back to the date chips.
    assert.deepEqual(
      buildQuickReplies({
        toolSignals: [{ result: { ok: false, error: 'past_date' } }],
        assistantText: 'That date has already passed — what day works instead?',
        zoneNames: ZONES,
        availableTimes: TIMES,
      }),
      ['Today', 'Tomorrow', 'Weekend'],
    )
  })

  it('a full slot offers the alternatives it actually found', () => {
    const alternatives = ['6:45 PM', '9:15 PM']
    assert.deepEqual(
      buildQuickReplies({
        toolSignals: [
          { result: { ok: false, error: 'not_available', nearby_alternatives: alternatives } },
        ],
        assistantText: 'That time is taken — 6:45 PM or 9:15 PM?',
        zoneNames: ZONES,
        availableTimes: alternatives,
      }),
      alternatives,
    )
  })
})

describe('input hygiene', () => {
  it('trims and drops blank zone names', () => {
    assert.deepEqual(
      quickRepliesForField('seating_area', { zoneNames: ['  Patio  ', '', '   ', 'Bar'] }),
      ['Patio', 'Bar', 'No preference'],
    )
  })

  it('offers nothing for seating when the venue has no zones', () => {
    assert.deepEqual(quickRepliesForField('seating_area', { zoneNames: [] }), [])
  })

  it('drops blank time suggestions', () => {
    assert.deepEqual(quickRepliesForField('time', { availableTimes: ['7:00 PM', '', '  '] }), [
      '7:00 PM',
    ])
  })

  it('caps at six chips', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    assert.equal(quickRepliesForField('time', { availableTimes: many }).length, 6)
    assert.equal(
      quickRepliesForField('seating_area', { zoneNames: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }).length,
      6,
    )
  })

  it('survives a turn with no signals at all', () => {
    assert.deepEqual(buildQuickReplies({}), [])
  })
})
