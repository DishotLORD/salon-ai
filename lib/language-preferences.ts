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

export function languageInstruction(preference: unknown): string {
  const language = normalizeLanguagePreference(preference)
  if (language === DEFAULT_LANGUAGE_PREFERENCE) {
    return 'LANGUAGE: detect the language of the guest’s latest message and reply naturally in that language. If the language is unclear, use English (Canada). If the guest switches languages, switch with them.'
  }
  return `LANGUAGE: default to ${language}. If the guest writes in a different language, reply naturally in their language and continue mirroring it.`
}
