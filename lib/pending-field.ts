/**
 * Which single field the concierge is waiting on right now.
 *
 * The chips under a reply used to be whatever the last tool produced, carried
 * forward until something replaced them — so a guest who picked 7:00 PM and was
 * then asked "Main, Patio or Bar?" still saw a 7:00 PM chip, and tapping it
 * answered a question nobody had asked. Reading the reply text fixed that case
 * but only that case: it is a guess about what a language model meant.
 *
 * The tools already say what is missing. `create_reservation` refuses with
 * `missing_fields: ["seating_area"]`; the date guards refuse with `past_date`;
 * the contact rule refuses with `missing_contact`. Those are facts about the
 * booking's state, not inferences about prose, so they decide the field and the
 * text is consulted only when no tool ran — which happens on the opening turn
 * and whenever the model simply asks a question in words.
 *
 * Import-free so it can be unit-tested directly.
 */

export type PendingField =
  | 'party_size'
  | 'date'
  | 'time'
  | 'seating_area'
  | 'guest_name'
  | 'contact_method'
  | 'confirmation'
  | 'special_requests'
  | 'completed'

/**
 * The order the concierge collects things in (see BOOKING_FLOW_RULES): date,
 * party size, time, seating, then the name last. When a tool reports several
 * missing fields at once, the guest is asked for the earliest one, so the chips
 * have to match that same choice.
 */
const COLLECTION_ORDER: PendingField[] = [
  'date',
  'party_size',
  'time',
  'seating_area',
  'guest_name',
]

/**
 * Tool refusals that name their own field. A refusal is a fact: the booking
 * cannot proceed without this, whatever the model went on to write.
 */
const ERROR_TO_FIELD: Record<string, PendingField> = {
  missing_contact: 'contact_method',
  past_date: 'date',
  beyond_booking_window: 'date',
  invalid_date: 'date',
  closed_day: 'date',
  closed: 'date',
  party_too_large: 'party_size',
  party_size_not_accepted: 'party_size',
  not_available: 'time',
  activity_taken: 'time',
  invalid_datetime: 'time',
  bad_datetime: 'time',
}

type ToolResult = Record<string, unknown>

/** One tool's outcome, in the shape the chat route already has to hand. */
export type ToolSignal = {
  result: ToolResult
  created?: boolean
  cancelled?: boolean
  rescheduled?: boolean
}

function missingFieldsOf(result: ToolResult): PendingField[] {
  const raw = result.missing_fields
  if (!Array.isArray(raw)) return []
  const named = raw.filter((f): f is string => typeof f === 'string')
  return COLLECTION_ORDER.filter((field) => named.includes(field))
}

/**
 * The field a single tool outcome *demands*, or null.
 *
 * Only refusals and completions qualify. A successful availability lookup does
 * not: it reports what is open, which the concierge is free to state and then
 * move on from — "2:30 PM is available. Where would you prefer to sit?" is one
 * message whose open question is seating, not time. Treating the lookup as a
 * demand is what put a 2:30 PM chip under that question.
 */
export function pendingFieldFromToolResult(signal: ToolSignal): PendingField | null {
  const { result } = signal
  if (!result || typeof result !== 'object') return null

  // A booking that just happened, moved or was cancelled ends the questioning.
  if (signal.created || signal.cancelled || signal.rescheduled) return 'completed'

  const error = typeof result.error === 'string' ? result.error : null

  if (error === 'missing_fields') {
    const missing = missingFieldsOf(result)
    if (missing.length > 0) return missing[0]
  }

  if (error && ERROR_TO_FIELD[error]) return ERROR_TO_FIELD[error]

  return null
}

/**
 * The field the tools demand for a whole turn. Later tools win: a turn that
 * checks availability and then fails to book on a missing name is waiting for
 * the name, not a time.
 */
export function pendingFieldFromToolSignals(signals: ToolSignal[]): PendingField | null {
  let field: PendingField | null = null
  for (const signal of signals) {
    const next = pendingFieldFromToolResult(signal)
    if (next) field = next
  }
  return field
}

/**
 * Informational only: the tools found open times. Whether the guest should be
 * picking one depends on what the concierge actually asked, so this is consulted
 * last — after the refusals and after the message's closing question.
 */
export function offersTimeChoice(signals: ToolSignal[]): boolean {
  return signals.some(({ result }) => {
    if (!result || typeof result !== 'object') return false
    if (Array.isArray(result.matches) && result.matches.length > 0) return true
    if (Array.isArray(result.available_times) && result.available_times.length > 0) return true
    if (Array.isArray(result.nearby_alternatives) && result.nearby_alternatives.length > 0) {
      return true
    }
    return false
  })
}

// ─── Text fallback ────────────────────────────────────────────────────────────

/** Said while confirming a booking, not while asking about one. */
const CONFIRMATION_STATEMENT =
  /\b(booked|all set|confirmed|reserved for|see you|look forward|is set|has been placed)\b/i

const PATTERNS: { field: PendingField; re: RegExp }[] = [
  // Most specific first: several of these mention a date or a time in passing.
  {
    field: 'contact_method',
    re: /\b(phone number or email|phone or email|number or email|best number|contact details?|email address)\b/i,
  },
  {
    field: 'special_requests',
    re: /\b(special requests?|dietary|allerg|occasion|anything else (?:we|i) should know|celebrating)\b/i,
  },
  {
    field: 'seating_area',
    re: /\b(seating|dining area|dining room|where would you like to sit|prefer to sit|like to sit|which area|what area|table area|anywhere fine|anywhere works|no preference)\b/i,
  },
  {
    field: 'guest_name',
    re: /\b(your name|name for the reservation|whose name|may i (?:have|take) your name|under what name)\b/i,
  },
  {
    field: 'confirmation',
    re: /\b(shall i (?:book|confirm|go ahead)|does that (?:look|sound) (?:right|good)|is that (?:correct|right)|ready to confirm|confirm (?:this|the) (?:booking|reservation))\b/i,
  },
  {
    field: 'party_size',
    re: /\b(how many (?:people|guests|of you)|party size|for how many|how large)\b/i,
  },
  { field: 'date', re: /\b(what day|which day|what date|which date|when were you|what evening)\b/i },
  { field: 'time', re: /\b(what time|which time|time works|time suits|time would you)\b/i },
]

function mentionsAtLeastTwoZones(text: string, zoneNames: string[]): boolean {
  const lower = text.toLowerCase()
  return zoneNames.filter((z) => z.trim() && lower.includes(z.trim().toLowerCase())).length >= 2
}

/**
 * The last question in the message, which is the one the guest is answering.
 *
 * A reply often states something and then asks about the next thing: "2:30 PM is
 * available. Where would you prefer to sit?" Matching patterns against the whole
 * message finds "2:30 PM" and answers the wrong question; the guest is looking
 * at the sentence with the question mark on it.
 */
export function finalQuestionOf(text: string): string | null {
  if (typeof text !== 'string') return null
  const questions = text.match(/[^.!?]*\?/g)
  if (!questions || questions.length === 0) return null
  return questions[questions.length - 1].trim() || null
}

/**
 * The field implied by the message's closing question.
 *
 * Consulted after tool refusals (a refusal is a fact) but before the merely
 * informational "here are some open times" — because a message that ends by
 * asking about seating is asking about seating, whatever it mentioned first.
 */
export function pendingFieldFromText(
  assistantText: string,
  zoneNames: string[] = [],
): PendingField | null {
  if (typeof assistantText !== 'string' || !assistantText.trim()) return null
  // Checked against the whole message: a confirmation is a statement about the
  // booking, not a question, wherever it sits.
  if (CONFIRMATION_STATEMENT.test(assistantText)) return 'completed'

  const question = finalQuestionOf(assistantText)
  if (!question) return null

  for (const { field, re } of PATTERNS) {
    if (re.test(question)) return field
  }
  // "Main, Patio or Bar?" — the zone names alone, with no seating vocabulary.
  if (mentionsAtLeastTwoZones(question, zoneNames)) return 'seating_area'

  return null
}

/**
 * Precedence, strongest first:
 *   1. a tool refusal or completion — a fact about the booking's state;
 *   2. the message's closing question — what the guest is being asked;
 *   3. open times were found and nothing else claimed the turn.
 *
 * Step 2 sits above step 3 deliberately. Availability is information the
 * concierge may state in passing; only an actual question about time means the
 * guest is choosing one.
 */
export function resolvePendingField(params: {
  toolSignals?: ToolSignal[]
  assistantText?: string
  zoneNames?: string[]
}): PendingField | null {
  const signals = params.toolSignals ?? []

  const demanded = pendingFieldFromToolSignals(signals)
  if (demanded) return demanded

  const asked = pendingFieldFromText(params.assistantText ?? '', params.zoneNames ?? [])
  if (asked) return asked

  return offersTimeChoice(signals) ? 'time' : null
}

// ─── Quick replies ────────────────────────────────────────────────────────────

export const NO_PREFERENCE_REPLY = 'No preference'
export const NO_SPECIAL_REQUESTS_REPLY = 'No special requests'

const PARTY_SIZE_REPLIES = ['Just me', '2 people', '3 people', '4 people', '5 people', '6 people']
const DATE_REPLIES = ['Today', 'Tomorrow', 'Weekend']
const CONTACT_REPLIES = ['Phone', 'Email']
const CONFIRMATION_REPLIES = ['Confirm', 'Change details']

const MAX_REPLIES = 6

/**
 * Chips for one field and nothing else. Every branch returns a fresh list, so
 * there is no path by which the previous step's chips survive into this one.
 */
export function quickRepliesForField(
  field: PendingField | null,
  context: { zoneNames?: string[]; availableTimes?: string[] } = {},
): string[] {
  const zoneNames = (context.zoneNames ?? []).map((z) => z.trim()).filter(Boolean)
  const availableTimes = (context.availableTimes ?? []).filter(
    (t) => typeof t === 'string' && t.trim(),
  )

  switch (field) {
    case 'party_size':
      return [...PARTY_SIZE_REPLIES]
    case 'date':
      return [...DATE_REPLIES]
    // Only real slots. An empty list is the honest answer when nothing is open —
    // inventing a chip here would offer a table that does not exist.
    case 'time':
      return availableTimes.slice(0, MAX_REPLIES)
    case 'seating_area':
      return zoneNames.length > 0
        ? [...zoneNames, NO_PREFERENCE_REPLY].slice(0, MAX_REPLIES)
        : []
    case 'contact_method':
      return [...CONTACT_REPLIES]
    case 'confirmation':
      return [...CONFIRMATION_REPLIES]
    case 'special_requests':
      return [NO_SPECIAL_REQUESTS_REPLY]
    // A name is typed, never tapped; a finished booking asks nothing.
    case 'guest_name':
    case 'completed':
    default:
      return []
  }
}

/** The whole decision for one turn: which field, then that field's chips. */
export function buildQuickReplies(params: {
  toolSignals?: ToolSignal[]
  assistantText?: string
  zoneNames?: string[]
  availableTimes?: string[]
}): string[] {
  const field = resolvePendingField(params)
  return quickRepliesForField(field, {
    zoneNames: params.zoneNames,
    availableTimes: params.availableTimes,
  })
}
