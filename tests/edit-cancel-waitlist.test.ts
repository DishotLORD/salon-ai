import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  slotFreedRequestForStatusChange,
  slotFreedRequestForStatusTransition,
  statusFreesATable,
} from '../lib/waitlist-slot-freed.ts'

const APPT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

/**
 * The reported Edit → Save bug: Bookings → More actions → Edit → Cancelled →
 * Save updated the row but never called /api/waitlist/slot-freed. The quick
 * Cancel button did. These assert the transition gate the Edit path now shares
 * with updateStatus — fire only when a live status becomes a releasing one.
 */
describe('the reported bug: Edit → Cancelled → Save told the waitlist nothing', () => {
  it('confirmed → cancelled asks the waitlist, the way updateStatus does', () => {
    assert.deepEqual(
      slotFreedRequestForStatusTransition(APPT, 'confirmed', 'cancelled'),
      { appointment_id: APPT },
    )
    assert.deepEqual(
      slotFreedRequestForStatusTransition(APPT, 'confirmed', 'cancelled'),
      slotFreedRequestForStatusChange(APPT, 'cancelled'),
    )
  })

  it('pending → cancelled and seated → no-show also ask', () => {
    for (const [from, to] of [
      ['pending', 'cancelled'],
      ['pending', 'canceled'],
      ['confirmed', 'no-show'],
      ['seated', 'cancelled'],
      ['completed', 'no-show'],
    ] as const) {
      assert.deepEqual(
        slotFreedRequestForStatusTransition(APPT, from, to),
        { appointment_id: APPT },
        `${from} → ${to}`,
      )
    }
  })

  it('already cancelled / no-show does not ask again on Save', () => {
    for (const [from, to] of [
      ['cancelled', 'cancelled'],
      ['canceled', 'cancelled'],
      ['cancelled', 'no-show'],
      ['no-show', 'cancelled'],
      ['no-show', 'no-show'],
      [' Cancelled ', 'CANCELLED'],
    ] as const) {
      assert.equal(
        slotFreedRequestForStatusTransition(APPT, from, to),
        null,
        `${from} → ${to}`,
      )
      assert.equal(statusFreesATable(from), true, from)
    }
  })

  it('saving a non-releasing status never asks', () => {
    for (const [from, to] of [
      ['confirmed', 'confirmed'],
      ['confirmed', 'pending'],
      ['cancelled', 'confirmed'],
      ['no-show', 'seated'],
      ['pending', 'seated'],
    ] as const) {
      assert.equal(
        slotFreedRequestForStatusTransition(APPT, from, to),
        null,
        `${from} → ${to}`,
      )
    }
  })

  it('refuses a missing appointment id even on a real transition', () => {
    assert.equal(slotFreedRequestForStatusTransition('', 'confirmed', 'cancelled'), null)
    assert.equal(slotFreedRequestForStatusTransition(null, 'confirmed', 'cancelled'), null)
  })
})
