export function isOperatingHoursSchemaError(message: string | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return lower.includes('operating_hours') && (lower.includes('schema') || lower.includes('column'))
}

export const OPERATING_HOURS_MIGRATION_HINT =
  'To save working hours, run supabase/migrations/005_operating_hours.sql in Supabase Dashboard → SQL Editor, then reload this page.'
