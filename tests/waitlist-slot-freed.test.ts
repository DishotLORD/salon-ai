import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isDeletionRequest,
  slotFreedRequestForDeletion,
  slotFreedRequestForStatusChange,
  statusFreesATable,
  SLOT_FREEING_STATUSES,
} from '../lib/waitlist-slot-freed.ts'

const BIZ = '11111111-2222-3333-4444-555555555555'
const APPT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('the reported bug: deleting a booking told the waitlist nothing', () => {
  it('a deletion produces a request, the way a cancellation does', () => {
    // Deleting frees exactly the capacity cancelling does. Before this, only one
    // of them asked the queue.
    assert.deepEqual(slotFreedRequestForDeletion(BIZ, '2026-08-07'), {
      business_id: BIZ,
      date_key: '2026-08-07',
    })
  })

  it('both paths end up asking, in the shape each can be served by', () => {
    const cancelled = slotFreedRequestForStatusChange(APPT, 'cancelled')
    const deleted = slotFreedRequestForDeletion(BIZ, '2026-08-07')
    assert.ok(cancelled)
    assert.ok(deleted)
    // A cancelled booking still exists, so the server resolves it by id; a
    // deleted one is gone and the caller has to carry the context.
    assert.equal(isDeletionRequest(cancelled), false)
    assert.equal(isDeletionRequest(deleted), true)
  })
})

describe('status changes that free a table', () => {
  for (const status of SLOT_FREEING_STATUSES) {
    it(`${status} frees a table`, () => {
      assert.equal(statusFreesATable(status), true)
      assert.deepEqual(slotFreedRequestForStatusChange(APPT, status), { appointment_id: APPT })
    })
  }

  it('accepts either spelling of cancelled', () => {
    assert.equal(statusFreesATable('cancelled'), true)
    assert.equal(statusFreesATable('canceled'), true)
  })

  it('is case- and whitespace-insensitive', () => {
    for (const status of [' Cancelled ', 'NO-SHOW', 'No-Show']) {
      assert.equal(statusFreesATable(status), true, status)
    }
  })

  it('statuses that free nothing produce no request', () => {
    for (const status of ['pending', 'confirmed', 'seated', 'completed', '']) {
      assert.equal(statusFreesATable(status), false, status)
      assert.equal(slotFreedRequestForStatusChange(APPT, status), null, status)
    }
  })

  it('refuses to build a request without an appointment id', () => {
    assert.equal(slotFreedRequestForStatusChange('', 'cancelled'), null)
    assert.equal(slotFreedRequestForStatusChange('   ', 'cancelled'), null)
    assert.equal(slotFreedRequestForStatusChange(null, 'cancelled'), null)
  })

  it('survives a null status', () => {
    assert.equal(statusFreesATable(null), false)
    assert.equal(statusFreesATable(undefined), false)
  })
})

describe('deletion context must be complete, or nothing is sent', () => {
  it('refuses a missing business id', () => {
    // Better no notification than one aimed at the wrong venue.
    assert.equal(slotFreedRequestForDeletion('', '2026-08-07'), null)
    assert.equal(slotFreedRequestForDeletion(null, '2026-08-07'), null)
    assert.equal(slotFreedRequestForDeletion(undefined, '2026-08-07'), null)
  })

  it('refuses a missing or malformed date key', () => {
    for (const key of ['', '   ', '2026-8-7', '07/08/2026', 'tomorrow', '2026-08-07T19:00:00']) {
      assert.equal(slotFreedRequestForDeletion(BIZ, key), null, JSON.stringify(key))
    }
  })

  it('trims surrounding whitespace', () => {
    assert.deepEqual(slotFreedRequestForDeletion(` ${BIZ} `, ' 2026-08-07 '), {
      business_id: BIZ,
      date_key: '2026-08-07',
    })
  })

  it('carries the venue day it was given, not a reformatted one', () => {
    // A 12:30 AM booking belongs to the day the venue calls it; the caller
    // resolves that with calgaryCalendarDayKey and this must not second-guess it.
    assert.deepEqual(slotFreedRequestForDeletion(BIZ, '2026-12-31'), {
      business_id: BIZ,
      date_key: '2026-12-31',
    })
  })
})

describe('one deletion asks once', () => {
  it('builds a single request, not a list', () => {
    const request = slotFreedRequestForDeletion(BIZ, '2026-08-07')
    assert.ok(request)
    assert.deepEqual(Object.keys(request).sort(), ['business_id', 'date_key'])
  })

  it('a status change and a deletion never both fire for one action', () => {
    // The two call sites are exclusive: updateStatus never deletes, and
    // deleteReservation never sets a status. Asserted on the shapes so a future
    // refactor that merges them has to think about it.
    const fromStatus = slotFreedRequestForStatusChange(APPT, 'cancelled')
    const fromDeletion = slotFreedRequestForDeletion(BIZ, '2026-08-07')
    assert.ok(fromStatus && fromDeletion)
    assert.notDeepEqual(Object.keys(fromStatus), Object.keys(fromDeletion))
  })
})
