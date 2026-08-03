import type { SupabaseClient } from '@supabase/supabase-js'

import {
  DEFAULT_BUSINESS_TIMEZONE,
  isTimezoneSchemaError,
  resolveBusinessTimezone,
  type CanadianBusinessTimezone,
} from '@/lib/business-timezone'

/**
 * Read one business's venue timezone, resolved once at the data boundary.
 *
 * Everything downstream takes a required `CanadianBusinessTimezone`, so this is
 * the single place a null or unrecognised database value becomes the
 * America/Edmonton fallback that keeps existing Alberta venues unchanged.
 *
 * Tolerates the column not existing yet: until migration 023 is applied,
 * PostgREST rejects the select, and a dashboard that cannot render is worse
 * than one showing Mountain Time for one more deploy.
 */
export async function loadBusinessTimezone(
  supabase: SupabaseClient,
  businessId: string,
): Promise<CanadianBusinessTimezone> {
  const { data, error } = await supabase
    .from('businesses')
    .select('timezone')
    .eq('id', businessId)
    .maybeSingle()

  if (error) {
    if (!isTimezoneSchemaError(error.message)) {
      console.error('[timezone] failed to read businesses.timezone', error.message)
    }
    return DEFAULT_BUSINESS_TIMEZONE
  }

  const stored = (data as { timezone?: unknown } | null)?.timezone
  return resolveBusinessTimezone(typeof stored === 'string' ? stored : null)
}
