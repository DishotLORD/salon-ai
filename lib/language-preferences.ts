export const DEFAULT_LANGUAGE_PREFERENCE = 'Auto-detect (Canada)'

export const CANADIAN_LANGUAGE_OPTIONS = [
  { value: DEFAULT_LANGUAGE_PREFERENCE, label: 'Auto-detect · Recommended' },
  { value: 'English (Canada)', label: 'English (Canada)' },
  { value: 'French (Canada)', label: 'French (Canada)' },
  { value: 'Spanish', label: 'Spanish · Español' },
  { value: 'Mandarin Chinese', label: 'Mandarin Chinese · 普通话' },
  { value: 'Punjabi', label: 'Punjabi · ਪੰਜਾਬੀ' },
  { value: 'Arabic', label: 'Arabic · العربية' },
  { value: 'Hindi', label: 'Hindi · हिन्दी' },
  { value: 'Tagalog', label: 'Tagalog · Filipino' },
  { value: 'Cantonese', label: 'Cantonese · 廣東話' },
  { value: 'Urdu', label: 'Urdu · اردو' },
  { value: 'Portuguese', label: 'Portuguese · Português' },
  { value: 'Russian', label: 'Russian · Русский' },
  { value: 'Ukrainian', label: 'Ukrainian · Українська' },
  { value: 'Persian (Farsi)', label: 'Persian · فارسی' },
  { value: 'Vietnamese', label: 'Vietnamese · Tiếng Việt' },
  { value: 'Korean', label: 'Korean · 한국어' },
] as const

const supportedValues = new Set<string>(CANADIAN_LANGUAGE_OPTIONS.map((option) => option.value))

export function normalizeLanguagePreference(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_LANGUAGE_PREFERENCE
  const normalized = value.trim()
  const lower = normalized.toLowerCase()

  if (lower === 'en' || lower === 'english (us)' || lower === 'english (uk)' || lower === 'english') {
    return 'English (Canada)'
  }
  if (lower === 'fr' || lower === 'french') return 'French (Canada)'
  if (lower === 'mandarin') return 'Mandarin Chinese'
  if (lower === 'farsi' || lower === 'persian') return 'Persian (Farsi)'

  return supportedValues.has(normalized) ? normalized : DEFAULT_LANGUAGE_PREFERENCE
}

/**
 * Language rules for the system prompt.
 *
 * The bot never switches language on its own. Mirroring the guest sounds
 * helpful but misfires constantly: one borrowed word, a dish name, a "merci",
 * or a guest typing on a phone keyboard that autocorrects into another
 * language would flip the whole conversation, and the guest had no say in it.
 * So a different language is treated as a question to ask, not an instruction
 * to obey, and the question is asked in that language so it is understood.
 */
export function languageInstruction(preference: unknown): string {
  const language = normalizeLanguagePreference(preference)
  const opening =
    language === DEFAULT_LANGUAGE_PREFERENCE
      ? "LANGUAGE: answer in the language of the guest's first message and keep the whole conversation in it. If that first message is too short to tell, use English (Canada)."
      : `LANGUAGE: answer in ${language} and keep the whole conversation in it.`

  return [
    opening,
    'Never switch language on your own, even if the guest writes a whole message in another one.',
    "When the guest writes in a different language, work out which language it is and ask — in that language, as one short question — whether they would like to continue in it (for example “Хотите, чтобы я продолжил на русском?”). Answer their actual question in the language you were already using, so nothing is left hanging while they decide.",
    'Switch only once they agree, then stay in the new language for the rest of the chat.',
    'If they say no, or reply without agreeing, stay in the current language and never ask about that language again in this conversation.',
    'If you cannot tell which language it is, ask in English which language they would prefer.',
  ].join('\n')
}
