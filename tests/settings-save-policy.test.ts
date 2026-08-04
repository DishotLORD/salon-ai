import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  categorySave,
  operatingHoursPatch,
  writesOperatingHours,
  writesOperatingHoursConfirmation,
  WORKING_HOURS_SAVE,
} from '../lib/settings-save-policy.ts'

const HOURS = {
  mon: { open: '17:00', close: '22:30', closed: false },
  tue: { open: '17:00', close: '22:30', closed: false },
  wed: { open: '17:00', close: '22:30', closed: false },
  thu: { open: '17:00', close: '23:00', closed: false },
  fri: { open: '17:00', close: '23:30', closed: false },
  sat: { open: '11:30', close: '23:30', closed: false },
  sun: { open: '11:30', close: '21:30', closed: false },
}
const NOW = '2026-08-03T18:00:00.000Z'

/** Every Settings category that has a Save button. */
const CATEGORIES = [
  'restaurant',
  'reservations',
  'ai',
  'menu',
  'integrations',
  'team',
  'billing',
  'security',
] as const

describe('only an explicit Working Hours save confirms hours', () => {
  it('Integrations save does not write or confirm operating hours', () => {
    const action = categorySave('integrations')
    assert.equal(writesOperatingHours(action), false)
    assert.equal(writesOperatingHoursConfirmation(action), false)
    assert.deepEqual(operatingHoursPatch(action, HOURS, NOW), {})
  })

  it('AI save does not write or confirm operating hours', () => {
    const action = categorySave('ai')
    assert.equal(writesOperatingHours(action), false)
    assert.deepEqual(operatingHoursPatch(action, HOURS, NOW), {})
  })

  it('Reservations save does not write or confirm operating hours', () => {
    const action = categorySave('reservations')
    assert.equal(writesOperatingHours(action), false)
    assert.deepEqual(operatingHoursPatch(action, HOURS, NOW), {})
  })

  it('contact-details-only save does not confirm hours, though it shares a category', () => {
    // Name, address and phone live in the same tab as the hours editor. Saving
    // them says nothing about opening times, so the category cannot be the gate.
    const action = categorySave('restaurant')
    assert.equal(writesOperatingHours(action), false)
    assert.equal(writesOperatingHoursConfirmation(action), false)
    assert.deepEqual(operatingHoursPatch(action, HOURS, NOW), {})
  })

  it('explicit Working Hours save writes the hours and confirms them', () => {
    assert.equal(writesOperatingHours(WORKING_HOURS_SAVE), true)
    assert.equal(writesOperatingHoursConfirmation(WORKING_HOURS_SAVE), true)
    assert.deepEqual(operatingHoursPatch(WORKING_HOURS_SAVE, HOURS, NOW), {
      operating_hours: HOURS,
      operating_hours_confirmed_at: NOW,
    })
  })

  it('no category whatsoever confirms hours', () => {
    for (const category of CATEGORIES) {
      const action = categorySave(category)
      assert.equal(writesOperatingHours(action), false, category)
      assert.deepEqual(operatingHoursPatch(action, HOURS, NOW), {}, category)
    }
  })

  it('hours and their confirmation are never written apart', () => {
    // A stored set of hours nobody confirmed is the state that made a venue look
    // ready when it was not; a confirmation without hours means nothing.
    for (const action of [WORKING_HOURS_SAVE, ...CATEGORIES.map(categorySave)]) {
      assert.equal(
        writesOperatingHours(action),
        writesOperatingHoursConfirmation(action),
        JSON.stringify(action),
      )
      const patch = operatingHoursPatch(action, HOURS, NOW)
      assert.equal(
        'operating_hours' in patch,
        'operating_hours_confirmed_at' in patch,
        JSON.stringify(action),
      )
    }
  })
})

describe('the Settings page is wired to this policy', () => {
  const source = readFileSync(
    new URL('../app/dashboard/settings/page.tsx', import.meta.url),
    'utf8',
  )

  it('never spreads operating hours into a payload without going through the policy', () => {
    // A literal `operating_hours:` in a save payload would bypass the gate.
    const literalWrites = source
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /^operating_hours(_confirmed_at)?\s*:/.test(line))
    assert.deepEqual(
      literalWrites,
      [],
      `payload writes hours directly instead of via operatingHoursPatch: ${JSON.stringify(literalWrites)}`,
    )
  })

  it('imports the policy', () => {
    assert.match(source, /from '@\/lib\/settings-save-policy'/)
  })
})
