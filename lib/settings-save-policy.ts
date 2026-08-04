/**
 * Which Settings save is allowed to touch operating hours.
 *
 * Every Settings category shared one save function, and that function always
 * attached `operating_hours` and `operating_hours_confirmed_at` to the payload.
 * Saving Integrations, or the AI personality, or a phone number therefore wrote
 * the hours editor's in-memory state to the database and stamped it as
 * owner-confirmed — including hours the owner had never opened, let alone
 * reviewed. Since confirmation is what makes a venue bookable, an unrelated save
 * could open a restaurant for public reservations on invented times.
 *
 * Hours are now written by one action and one action only. Not "the category
 * that contains the hours editor" — that category also holds the venue name,
 * address and phone number, and saving those is not a statement about opening
 * times either.
 *
 * Import-free so it can be unit-tested directly.
 */

/**
 * `working-hours` is the explicit Save on the Working Hours panel. Everything
 * else names the Settings category whose Save button was pressed.
 */
export type SettingsSaveAction =
  | { kind: 'working-hours' }
  | { kind: 'category'; category: string }

export const WORKING_HOURS_SAVE: SettingsSaveAction = { kind: 'working-hours' }

export function categorySave(category: string): SettingsSaveAction {
  return { kind: 'category', category }
}

/** True only for the explicit Working Hours save. */
export function writesOperatingHours(action: SettingsSaveAction): boolean {
  return action.kind === 'working-hours'
}

/**
 * Confirmation and the hours themselves travel together: a stored set of hours
 * nobody confirmed is exactly the state that used to make a venue look ready
 * when it was not, and a confirmation without the hours it refers to is
 * meaningless.
 */
export function writesOperatingHoursConfirmation(action: SettingsSaveAction): boolean {
  return writesOperatingHours(action)
}

/**
 * The operating-hours fields to merge into a save payload — empty for every
 * action but the explicit one, so a caller that spreads this unconditionally
 * still cannot confirm hours by accident.
 */
export function operatingHoursPatch(
  action: SettingsSaveAction,
  hours: unknown,
  nowIso: string,
): Record<string, unknown> {
  if (!writesOperatingHours(action)) return {}
  return {
    operating_hours: hours,
    operating_hours_confirmed_at: nowIso,
  }
}
