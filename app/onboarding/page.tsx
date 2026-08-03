'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { BusinessTimezoneSelect } from '@/components/business-timezone-select'
import { WELCOME_SPLASH_FLAG } from '@/components/dashboard-splash'
import {
  evaluateBusinessReadiness,
  loadBusinessReadiness,
  validateZoneCapacityInput,
} from '@/lib/business-readiness'
import { isDuplicateBusinessError } from '@/lib/duplicate-business'
import {
  isTimezoneSchemaError,
  parseBusinessTimezoneInput,
  suggestTimezoneFromAddress,
  type CanadianBusinessTimezone,
} from '@/lib/business-timezone'
import { defaultSystemPrompt } from '@/lib/default-system-prompt'
import { slugifyZoneName } from '@/lib/dining-zones'
import {
  clearPendingVenueDraft,
  readPendingVenueDraft,
} from '@/lib/pending-venue'
import {
  DAY_ORDER,
  DEFAULT_OPERATING_HOURS,
  parseOperatingHours,
  validateOperatingHours,
  type DayKey,
  type OperatingHours,
} from '@/lib/operating-hours'
import { supabase } from '@/lib/supabase'
import { tabContent } from '@/lib/ocean-motion'
import { VENUE_TYPE_OPTIONS, type VenueType } from '@/lib/venue-types'

type Phase = 'identity' | 'hours' | 'seating' | 'done'

const labelStyle = {
  display: 'block' as const,
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--ocean-text-muted)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  marginBottom: 6,
}

const inputStyle = {
  width: '100%' as const,
  borderRadius: 10,
  border: '1px solid var(--ocean-border)',
  padding: '11px 13px',
  fontSize: 14,
  outline: 'none' as const,
  background: 'var(--ocean-surface)',
  color: 'var(--ocean-text)',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box' as const,
}

export default function OnboardingPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('identity')
  const [dir, setDir] = useState(1)
  const [authChecked, setAuthChecked] = useState(false)
  const [businessId, setBusinessId] = useState<string | null>(null)

  // Identity
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState<VenueType>('restaurant')
  const [address, setAddress] = useState('')
  const [timezone, setTimezone] = useState<CanadianBusinessTimezone | ''>('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [agentName, setAgentName] = useState('')
  const [identityStep, setIdentityStep] = useState(1)

  // Hours — editor starts from defaults but is labeled Not configured until saved
  const [hours, setHours] = useState<OperatingHours>(() => ({
    ...DEFAULT_OPERATING_HOURS,
  }))
  const [hoursConfirmed, setHoursConfirmed] = useState(false)

  // First zone
  /*
   * A name and a minimum of one are safe assumptions about any restaurant.
   * How many people it seats, and the largest party it will take, are not — and
   * a prefilled "40" is indistinguishable from a number the owner chose. Both
   * start blank so the owner has to state them before the venue can open for
   * bookings.
   */
  const [zoneName, setZoneName] = useState('Main Dining')
  const [capacity, setCapacity] = useState('')
  const [minParty, setMinParty] = useState('1')
  const [maxParty, setMaxParty] = useState('')

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        router.replace('/auth/login')
        return
      }
      if (user.email) setEmail(user.email)

      const draft = readPendingVenueDraft()
      if (draft) {
        setBusinessName(draft.businessName)
        setBusinessType(draft.businessType)
        setAddress(draft.address)
        setTimezone(draft.timezone)
        setPhone(draft.phone)
        if (draft.agentName) setAgentName(draft.agentName)
      }

      /*
       * The confirmation column arrives with migration 024. Asking for it on a
       * deployment that has not run it fails the whole select, and the error was
       * being discarded — so an owner who already had a venue looked like an
       * owner who had none, landed on the first step, and the next save tried to
       * insert a second business for the same user.
       *
       * The retry drops only that column. Confirmation is then treated as
       * absent, which is the conservative reading: without the column there is
       * no evidence the owner ever confirmed anything, so the venue stays
       * incomplete rather than being assumed ready.
       */
      const SELECT_WITH_CONFIRMATION =
        'id, name, business_type, address, timezone, email, phone, agent_name, operating_hours, operating_hours_confirmed_at, menu_pdf_text'
      const SELECT_WITHOUT_CONFIRMATION =
        'id, name, business_type, address, timezone, email, phone, agent_name, operating_hours, menu_pdf_text'

      let loaded = await supabase
        .from('businesses')
        .select(SELECT_WITH_CONFIRMATION)
        .eq('user_id', user.id)
        .maybeSingle()

      let confirmationColumnPresent = true
      if (loaded.error && /operating_hours_confirmed_at/i.test(loaded.error.message)) {
        confirmationColumnPresent = false
        loaded = await supabase
          .from('businesses')
          .select(SELECT_WITHOUT_CONFIRMATION)
          .eq('user_id', user.id)
          .maybeSingle()
      }

      const existing = loaded.data as
        | (Record<string, unknown> & { id?: string })
        | null

      if (cancelled) return

      if (existing?.id) {
        const str = (value: unknown): string =>
          typeof value === 'string' ? value : ''
        // Present only when the column exists; otherwise deliberately null, so
        // readiness reads it as "never confirmed".
        const confirmedAt = confirmationColumnPresent
          ? (existing.operating_hours_confirmed_at as string | null | undefined) ?? null
          : null

        setBusinessId(existing.id)
        setBusinessName(str(existing.name))
        if (existing.business_type) {
          setBusinessType(existing.business_type as VenueType)
        }
        setAddress(str(existing.address))
        if (
          typeof existing.timezone === 'string' &&
          existing.timezone.trim()
        ) {
          setTimezone(existing.timezone as CanadianBusinessTimezone)
        }
        if (existing.email) setEmail(str(existing.email))
        setPhone(str(existing.phone))
        setAgentName(str(existing.agent_name))
        setHours(parseOperatingHours(existing.operating_hours))
        setHoursConfirmed(Boolean(confirmedAt))

        // Pre-migration column missing → select may error; fall back without it
        let readiness
        try {
          readiness = await loadBusinessReadiness(supabase, existing.id)
        } catch {
          readiness = evaluateBusinessReadiness({
            timezone: str(existing.timezone) || null,
            operatingHours: existing.operating_hours,
            operatingHoursConfirmedAt: confirmedAt,
            zones: [],
            menuItemCount: 0,
            menuPdfText: str(existing.menu_pdf_text) || null,
          })
        }

        if (readiness.bookingReady) {
          router.replace('/dashboard')
          return
        }
        if (!readiness.hoursConfirmed) {
          setPhase('hours')
        } else if (!readiness.hasUsableZone) {
          setPhase('seating')
        } else {
          setPhase('hours')
        }
      } else {
        setPhase('identity')
      }

      setAuthChecked(true)
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [router])

  const createBusinessIfNeeded = async (): Promise<string | null> => {
    if (businessId) return businessId
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/auth/login')
      return null
    }

    // Never create a duplicate if another tab already inserted.
    const { data: existing } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (existing?.id) {
      setBusinessId(existing.id)
      clearPendingVenueDraft()
      return existing.id
    }

    const tzParsed = parseBusinessTimezoneInput(timezone)
    if (!tzParsed.ok) {
      setError(tzParsed.message)
      return null
    }

    const insertPayload = {
      user_id: user.id,
      name: businessName.trim(),
      business_type: businessType,
      address: address.trim() || null,
      timezone: tzParsed.timezone,
      email: email.trim() || null,
      phone: phone.trim() || null,
      agent_name: agentName.trim() || `${businessName.trim()} Concierge`,
      system_prompt: defaultSystemPrompt(
        businessName,
        businessType,
        agentName.trim() || `${businessName.trim()} Concierge`,
      ),
    }
    let { data: created, error: insertError } = await supabase
      .from('businesses')
      .insert(insertPayload)
      .select('id')
      .maybeSingle()
    if (insertError && isTimezoneSchemaError(insertError.message)) {
      const { timezone: _tz, ...withoutTz } = insertPayload
      ;({ data: created, error: insertError } = await supabase
        .from('businesses')
        .insert(withoutTz)
        .select('id')
        .maybeSingle())
    }

    /*
     * The select above is a check, not a lock. Two tabs, a double-tapped button
     * or a retried request can both pass it and both insert. The database is the
     * only place that can actually decide, so when it refuses on the uniqueness
     * of user_id the answer is not an error message — the venue this owner was
     * trying to create already exists. Load it and carry on where they left off.
     */
    if (insertError && isDuplicateBusinessError(insertError)) {
      const { data: raced } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (raced?.id) {
        setBusinessId(raced.id)
        clearPendingVenueDraft()
        return raced.id
      }
    }

    if (insertError || !created?.id) {
      setError(insertError?.message ?? 'Could not save. Please try again.')
      return null
    }
    setBusinessId(created.id)
    clearPendingVenueDraft()
    return created.id
  }

  const saveHours = async () => {
    setError('')
    setSaving(true)
    try {
      const hoursError = validateOperatingHours(hours)
      if (hoursError) {
        setError(hoursError)
        setSaving(false)
        return
      }
      if (!DAY_ORDER.some(({ key }) => !hours[key].closed)) {
        setError('Keep at least one day open for reservations.')
        setSaving(false)
        return
      }

      const bizId = await createBusinessIfNeeded()
      if (!bizId) {
        setSaving(false)
        return
      }

      const tzParsed = parseBusinessTimezoneInput(timezone)
      const payload: Record<string, unknown> = {
        operating_hours: hours,
        operating_hours_confirmed_at: new Date().toISOString(),
      }
      if (tzParsed.ok) payload.timezone = tzParsed.timezone

      let { error: upErr } = await supabase
        .from('businesses')
        .update(payload)
        .eq('id', bizId)
      if (upErr && /operating_hours_confirmed_at/i.test(upErr.message)) {
        const { operating_hours_confirmed_at: _c, ...without } = payload
        ;({ error: upErr } = await supabase
          .from('businesses')
          .update(without)
          .eq('id', bizId))
      }
      if (upErr) {
        setError(upErr.message)
        setSaving(false)
        return
      }
      setHoursConfirmed(true)
      setDir(1)
      setPhase('seating')
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setSaving(false)
  }

  const saveSeating = async () => {
    setError('')
    setSaving(true)
    try {
      const validated = validateZoneCapacityInput({
        name: zoneName,
        capacity,
        minPartySize: minParty,
        maxPartySize: maxParty,
      })
      if (!validated.ok) {
        setError(validated.message)
        setSaving(false)
        return
      }

      const bizId = await createBusinessIfNeeded()
      if (!bizId) {
        setSaving(false)
        return
      }

      // Hours must be confirmed before seating completes launch readiness.
      if (!hoursConfirmed) {
        setDir(-1)
        setPhase('hours')
        setError('Save your operating hours before adding seating.')
        setSaving(false)
        return
      }

      const { data: existingZones } = await supabase
        .from('dining_zones')
        .select('id')
        .eq('business_id', bizId)
        .limit(1)
      if ((existingZones ?? []).length === 0) {
        const { error: zErr } = await supabase.from('dining_zones').insert({
          business_id: bizId,
          name: validated.name,
          slug: slugifyZoneName(validated.name),
          max_concurrent_parties: validated.capacity,
          min_party_size: validated.minParty,
          max_party_size: validated.maxParty,
          turnover_minutes: 90,
          is_active: true,
          sort_order: 0,
        })
        if (zErr) {
          setError(zErr.message)
          setSaving(false)
          return
        }
      }

      const readiness = await loadBusinessReadiness(supabase, bizId)
      if (!readiness.bookingReady) {
        setError(
          readiness.missingSteps
            .filter((s) => s.id !== 'menu')
            .map((s) => s.title)
            .join(' · ') || 'Finish the required setup steps.',
        )
        setSaving(false)
        return
      }

      try {
        sessionStorage.setItem(WELCOME_SPLASH_FLAG, '1')
      } catch {
        /* storage blocked */
      }
      setPhase('done')
      router.replace('/dashboard')
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setSaving(false)
  }

  const identityCanNext =
    identityStep === 1
      ? businessName.trim().length > 0 && Boolean(timezone)
      : email.trim().length > 0 && agentName.trim().length > 0

  const goIdentityNext = async () => {
    setError('')
    if (!identityCanNext) return
    if (identityStep === 1) {
      setDir(1)
      setIdentityStep(2)
      return
    }
    setSaving(true)
    const id = await createBusinessIfNeeded()
    setSaving(false)
    if (!id) return
    setDir(1)
    setPhase('hours')
  }

  if (!authChecked) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--ocean-deep)',
          color: 'var(--ocean-text-muted)',
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    )
  }

  const phaseTitle =
    phase === 'identity'
      ? identityStep === 1
        ? 'Your venue'
        : 'Contact & concierge'
      : phase === 'hours'
        ? 'Confirm opening hours'
        : phase === 'seating'
          ? 'Add seating & capacity'
          : 'You are ready'

  const phaseSubtitle =
    phase === 'identity'
      ? identityStep === 1
        ? 'Tell us where you are — your concierge will use this for guests.'
        : 'Where should we reach you, and what should guests call your host?'
      : phase === 'hours'
        ? 'Defaults below are not live. Review, edit if needed, then save to confirm.'
        : phase === 'seating'
          ? 'Enter real capacity — we will not invent covers or party limits for you.'
          : 'Online reservations can now accept guests.'

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px 40px',
        background: 'var(--ocean-canvas)',
        backgroundColor: 'var(--ocean-deep)',
        color: 'var(--ocean-text)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: '100%',
          maxWidth: 560,
          borderRadius: 20,
          border: '1px solid var(--ocean-border)',
          background: 'var(--ocean-card)',
          boxShadow: 'var(--ocean-shadow-lg)',
          padding: '28px 28px 24px',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ocean-text-muted)',
              marginBottom: 8,
            }}
          >
            Launch setup
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            {phaseTitle}
          </h1>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 14,
              lineHeight: 1.45,
              color: 'var(--ocean-text-muted)',
            }}
          >
            {phaseSubtitle}
          </p>
        </div>

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={`${phase}-${identityStep}`}
            custom={dir}
            variants={tabContent}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {phase === 'identity' && identityStep === 1 && (
              <div style={{ display: 'grid', gap: 14 }}>
                <label>
                  <span style={labelStyle}>Restaurant name</span>
                  <input
                    style={inputStyle}
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Riverstone Kitchen"
                  />
                </label>
                <label>
                  <span style={labelStyle}>Type</span>
                  <select
                    style={inputStyle}
                    value={businessType}
                    onChange={(e) =>
                      setBusinessType(e.target.value as VenueType)
                    }
                  >
                    {VENUE_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span style={labelStyle}>Address</span>
                  <input
                    style={inputStyle}
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value)
                      const suggested = suggestTimezoneFromAddress(e.target.value)
                      if (suggested && !timezone) setTimezone(suggested)
                    }}
                    placeholder="City, Province"
                  />
                </label>
                <div>
                  <span style={labelStyle}>Timezone</span>
                  <BusinessTimezoneSelect
                    value={timezone}
                    onChange={setTimezone}
                  />
                </div>
              </div>
            )}

            {phase === 'identity' && identityStep === 2 && (
              <div style={{ display: 'grid', gap: 14 }}>
                <label>
                  <span style={labelStyle}>Owner email</span>
                  <input
                    style={inputStyle}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                  />
                </label>
                <label>
                  <span style={labelStyle}>Phone (optional)</span>
                  <input
                    style={inputStyle}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
                <label>
                  <span style={labelStyle}>Concierge name</span>
                  <input
                    style={inputStyle}
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder={`${businessName.trim() || 'Venue'} Concierge`}
                  />
                </label>
              </div>
            )}

            {phase === 'hours' && (
              <div style={{ display: 'grid', gap: 12 }}>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: hoursConfirmed
                      ? 'rgba(56, 161, 105, 0.12)'
                      : 'rgba(214, 158, 46, 0.14)',
                    border: `1px solid ${
                      hoursConfirmed
                        ? 'rgba(56, 161, 105, 0.35)'
                        : 'rgba(214, 158, 46, 0.35)'
                    }`,
                    fontSize: 13,
                    color: 'var(--ocean-text)',
                  }}
                >
                  {hoursConfirmed
                    ? 'Hours confirmed and saved.'
                    : 'Not configured — these are editor defaults only. Guests cannot book until you save.'}
                </div>
                {DAY_ORDER.map(({ key, label }) => (
                  <DayRow
                    key={key}
                    dayKey={key}
                    label={label}
                    value={hours[key]}
                    onChange={(next) =>
                      setHours((prev) => ({ ...prev, [key]: next }))
                    }
                  />
                ))}
              </div>
            )}

            {phase === 'seating' && (
              <div style={{ display: 'grid', gap: 14 }}>
                <label>
                  <span style={labelStyle}>Seating area name</span>
                  <input
                    style={inputStyle}
                    value={zoneName}
                    onChange={(e) => setZoneName(e.target.value)}
                    placeholder="Main Dining"
                  />
                </label>
                <label>
                  <span style={labelStyle}>Total capacity (guests)</span>
                  <input
                    style={inputStyle}
                    type="number"
                    min={1}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                  />
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  <label>
                    <span style={labelStyle}>Min party size</span>
                    <input
                      style={inputStyle}
                      type="number"
                      min={1}
                      value={minParty}
                      onChange={(e) => setMinParty(e.target.value)}
                    />
                  </label>
                  <label>
                    <span style={labelStyle}>Max party size</span>
                    <input
                      style={inputStyle}
                      type="number"
                      min={1}
                      value={maxParty}
                      onChange={(e) => setMaxParty(e.target.value)}
                    />
                  </label>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {error ? (
          <p
            style={{
              margin: '14px 0 0',
              color: '#f6ad55',
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {error}
          </p>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            marginTop: 22,
          }}
        >
          <button
            type="button"
            disabled={saving || (phase === 'identity' && identityStep === 1)}
            onClick={() => {
              setError('')
              setDir(-1)
              if (phase === 'identity' && identityStep === 2) {
                setIdentityStep(1)
              } else if (phase === 'hours' && businessId) {
                /* stay — identity already saved */
              } else if (phase === 'seating') {
                setPhase('hours')
              }
            }}
            style={{
              borderRadius: 12,
              border: '1px solid var(--ocean-border)',
              background: 'transparent',
              color: 'var(--ocean-text-muted)',
              padding: '11px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: phase === 'identity' && identityStep === 1 ? 0.4 : 1,
            }}
          >
            Back
          </button>

          {phase === 'identity' && (
            <button
              type="button"
              disabled={saving || !identityCanNext}
              onClick={() => void goIdentityNext()}
              style={primaryBtn}
            >
              {saving ? 'Saving…' : identityStep === 1 ? 'Continue' : 'Save & continue'}
            </button>
          )}
          {phase === 'hours' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveHours()}
              style={primaryBtn}
            >
              {saving ? 'Saving…' : 'Save hours & continue'}
            </button>
          )}
          {phase === 'seating' && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveSeating()}
              style={primaryBtn}
            >
              {saving ? 'Saving…' : 'Enable reservations'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  borderRadius: 12,
  border: 'none',
  background: 'linear-gradient(135deg, #3d8bfd, #2563eb)',
  color: '#fff',
  padding: '11px 18px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

function DayRow({
  dayKey,
  label,
  value,
  onChange,
}: {
  dayKey: DayKey
  label: string
  value: OperatingHours[DayKey]
  onChange: (next: OperatingHours[DayKey]) => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '88px 1fr 1fr auto',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <input
        type="time"
        disabled={value.closed}
        style={{ ...inputStyle, padding: '8px 10px', opacity: value.closed ? 0.45 : 1 }}
        value={value.open}
        onChange={(e) => onChange({ ...value, open: e.target.value })}
      />
      <input
        type="time"
        disabled={value.closed}
        style={{ ...inputStyle, padding: '8px 10px', opacity: value.closed ? 0.45 : 1 }}
        value={value.close}
        onChange={(e) => onChange({ ...value, close: e.target.value })}
      />
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--ocean-text-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        <input
          type="checkbox"
          checked={value.closed}
          onChange={(e) => onChange({ ...value, closed: e.target.checked })}
        />
        Closed
      </label>
      <span style={{ display: 'none' }}>{dayKey}</span>
    </div>
  )
}
