import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  COMPACT_DELETE_CONFIRM_MESSAGE,
  compactRowAllowsDelete,
  requestConfirmedDelete,
} from '../lib/bookings-compact-delete.ts'

/**
 * The reported bug: cancelled rows in the desktop compact bookings table had
 * Confirm/Cancel/More actions but no Delete, so deleteReservation (and its
 * waitlist slot-freed follow-up) was unreachable from the main UI.
 */
describe('the reported bug: cancelled compact rows had no Delete', () => {
  it('offers Delete for cancelled and no-show', () => {
    for (const status of ['cancelled', 'canceled', 'no-show', ' Cancelled ', 'NO-SHOW']) {
      assert.equal(compactRowAllowsDelete(status), true, status)
    }
  })

  it('does not offer Delete for active bookings', () => {
    for (const status of ['pending', 'confirmed', 'seated', 'completed', '']) {
      assert.equal(compactRowAllowsDelete(status), false, status)
    }
    assert.equal(compactRowAllowsDelete(null), false)
    assert.equal(compactRowAllowsDelete(undefined), false)
  })
})

describe('Delete requires a clear confirmation', () => {
  it('calls deleteReservation only after the owner confirms', () => {
    const deleted: string[] = []
    const ran = requestConfirmedDelete(
      'appt-1',
      (id) => {
        deleted.push(id)
      },
      () => true,
    )
    assert.equal(ran, true)
    assert.deepEqual(deleted, ['appt-1'])
  })

  it('does nothing when the owner dismisses the confirm', () => {
    const deleted: string[] = []
    let asked = ''
    const ran = requestConfirmedDelete(
      'appt-1',
      (id) => {
        deleted.push(id)
      },
      (message) => {
        asked = message
        return false
      },
    )
    assert.equal(ran, false)
    assert.deepEqual(deleted, [])
    assert.equal(asked, COMPACT_DELETE_CONFIRM_MESSAGE)
  })

  it('refuses an empty id without prompting', () => {
    let prompts = 0
    const ran = requestConfirmedDelete(
      '   ',
      () => {
        throw new Error('should not delete')
      },
      () => {
        prompts += 1
        return true
      },
    )
    assert.equal(ran, false)
    assert.equal(prompts, 0)
  })
})
