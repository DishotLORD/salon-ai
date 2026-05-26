export function isOperatingHoursSchemaError(message: string | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return lower.includes('operating_hours') && (lower.includes('schema') || lower.includes('column'))
}

export const OPERATING_HOURS_MIGRATION_HINT =
  'To save working hours, run supabase/migrations/005_operating_hours.sql in Supabase Dashboard → SQL Editor, then reload this page.'

export function isBookingSettingsSchemaError(message: string | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return lower.includes('booking_settings') && (lower.includes('schema') || lower.includes('column'))
}

export const BOOKING_SETTINGS_MIGRATION_HINT =
  'To save reservation capacity, run supabase/migrations/008_booking_settings.sql in Supabase Dashboard → SQL Editor, then reload this page.'

export function isDiningZonesSchemaError(message: string | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes('dining_zones') ||
    (lower.includes('zone_id') && lower.includes('appointments'))
  )
}

export const DINING_ZONES_MIGRATION_HINT =
  'To save dining zones, run supabase/migrations/009_dining_zones.sql in Supabase Dashboard → SQL Editor, then reload this page.'
