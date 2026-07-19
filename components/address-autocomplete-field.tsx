'use client'

import { useEffect, useId, useRef, useState } from 'react'

type AddressSuggestion = {
  id: string
  address: string
  mainText: string
  secondaryText: string
}

type SuggestionResponse = {
  suggestions?: AddressSuggestion[]
  configured?: boolean
  error?: string
}

type SearchState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'

export function AddressAutocompleteField({
  value,
  onChange,
  hint,
}: {
  value: string
  onChange: (value: string) => void
  hint?: string
}) {
  const fieldId = useId()
  const listboxId = `${fieldId}-suggestions`
  const helpId = `${fieldId}-help`
  const [focused, setFocused] = useState(false)
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [searchState, setSearchState] = useState<SearchState>('idle')
  const suppressNextSearchRef = useRef(false)

  useEffect(() => {
    const query = value.trim()
    if (!focused || query.length < 3) {
      return
    }
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearchState('loading')
      setOpen(true)

      const language = typeof navigator !== 'undefined' ? navigator.language : 'en-CA'
      const params = new URLSearchParams({
        q: query,
        lang: language,
      })

      try {
        const response = await fetch(`/api/places/autocomplete?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        const data = (await response.json()) as SuggestionResponse
        if (controller.signal.aborted) return

        if (data.configured === false) {
          setSuggestions([])
          setSearchState('unavailable')
          setHighlightedIndex(-1)
          return
        }
        if (!response.ok || data.error) {
          setSuggestions([])
          setSearchState('error')
          setHighlightedIndex(-1)
          return
        }

        const nextSuggestions = data.suggestions ?? []
        setSuggestions(nextSuggestions)
        setSearchState('ready')
        setHighlightedIndex(nextSuggestions.length > 0 ? 0 : -1)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setSuggestions([])
        setSearchState('error')
        setHighlightedIndex(-1)
      }
    }, 320)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [focused, value])

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    suppressNextSearchRef.current = true
    onChange(suggestion.address)
    setSuggestions([])
    setOpen(false)
    setHighlightedIndex(-1)
    setSearchState('idle')
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && suggestions.length > 0) {
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex((current) => (current + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1))
    } else if (event.key === 'Enter' && open && highlightedIndex >= 0) {
      event.preventDefault()
      selectSuggestion(suggestions[highlightedIndex])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      setHighlightedIndex(-1)
    }
  }

  const showPanel = focused && open && value.trim().length >= 3
  const floated = focused || value.length > 0

  return (
    <div style={{ position: 'relative', display: 'grid', gap: 5, minWidth: 0 }}>
      <div
        style={{
          position: 'relative',
          borderRadius: 10,
          border: focused ? '1px solid var(--t-accent)' : '1px solid var(--t-border)',
          background: 'var(--t-bg-surface)',
          boxShadow: focused ? '0 0 0 3px var(--t-accent-soft-bg)' : '0 1px 2px rgba(15,23,42,0.025)',
          transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
        }}
      >
        <label
          htmlFor={fieldId}
          style={{
            position: 'absolute',
            left: 16,
            top: floated ? 6 : 16,
            color: focused ? 'var(--t-accent)' : 'var(--t-text-muted)',
            fontSize: floated ? 10 : 14,
            fontWeight: floated ? 700 : 400,
            letterSpacing: floated ? '0.16em' : 0,
            textTransform: floated ? 'uppercase' : 'none',
            pointerEvents: 'none',
            transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          Street Address
        </label>
        <span aria-hidden style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: focused ? 'var(--t-accent)' : 'var(--bk-muted)', display: 'grid', placeItems: 'center' }}>
          {searchState === 'loading' ? (
            <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--bk-border)', borderTopColor: 'var(--t-accent)' }} />
          ) : (
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
              <path d="M10 17s5-4.5 5-9a5 5 0 1 0-10 0c0 4.5 5 9 5 9Z" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="10" cy="8" r="1.7" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          )}
        </span>
        <input
          id={fieldId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listboxId : undefined}
          aria-activedescendant={showPanel && highlightedIndex >= 0 ? `${fieldId}-option-${highlightedIndex}` : undefined}
          aria-describedby={hint ? helpId : undefined}
          autoComplete="street-address"
          value={value}
          onFocus={() => {
            setFocused(true)
            if (value.trim().length >= 3) setOpen(true)
          }}
          onBlur={() => {
            setFocused(false)
            setOpen(false)
          }}
          onChange={(event) => {
            const nextValue = event.target.value
            onChange(nextValue)
            const shouldSearch = nextValue.trim().length >= 3
            setOpen(shouldSearch)
            if (!shouldSearch) {
              setSuggestions([])
              setHighlightedIndex(-1)
              setSearchState('idle')
            }
          }}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            padding: '24px 44px 10px 16px',
            border: 0,
            borderRadius: 10,
            outline: 0,
            background: 'transparent',
            color: 'var(--t-text)',
            fontSize: 15,
            fontFamily: 'inherit',
          }}
        />
      </div>

      {hint ? <span id={helpId} style={{ paddingLeft: 3, color: 'var(--t-text-muted)', fontSize: 10.5, lineHeight: 1.4 }}>{hint}</span> : null}

      {showPanel ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Suggested Canadian addresses"
          style={{
            position: 'absolute',
            zIndex: 50,
            top: hint ? 75 : 58,
            left: 0,
            right: 0,
            overflow: 'hidden',
            borderRadius: 12,
            border: '1px solid var(--bk-border)',
            background: 'var(--bk-card)',
            boxShadow: '0 18px 40px rgba(15,23,42,0.18)',
          }}
        >
          {suggestions.map((suggestion, index) => (
            <button
              id={`${fieldId}-option-${index}`}
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected={highlightedIndex === index}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault()
                selectSuggestion(suggestion)
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                display: 'grid',
                gridTemplateColumns: '28px minmax(0, 1fr)',
                gap: 9,
                alignItems: 'center',
                border: 0,
                borderBottom: '1px solid var(--bk-border)',
                background: highlightedIndex === index ? 'var(--bk-accent-soft)' : 'transparent',
                color: 'var(--bk-head)',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span aria-hidden style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--bk-surface)', color: 'var(--bk-accent)' }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 17s5-4.5 5-9a5 5 0 1 0-10 0c0 4.5 5 9 5 9Z" stroke="currentColor" strokeWidth="1.6" /><circle cx="10" cy="8" r="1.5" fill="currentColor" /></svg>
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', color: 'var(--bk-head)', fontSize: 12.5, fontWeight: 700, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{suggestion.mainText}</span>
                {suggestion.secondaryText ? <span style={{ display: 'block', marginTop: 2, overflow: 'hidden', color: 'var(--bk-body)', fontSize: 10.5, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{suggestion.secondaryText}</span> : null}
              </span>
            </button>
          ))}

          {searchState === 'loading' ? <div style={messageStyle}>Finding Canadian addresses…</div> : null}
          {searchState === 'ready' && suggestions.length === 0 ? <div style={messageStyle}>No matching address yet. Keep typing or enter it manually.</div> : null}
          {searchState === 'unavailable' ? <div style={messageStyle}>Address suggestions are not configured yet. Manual entry still works.</div> : null}
          {searchState === 'error' ? <div style={messageStyle}>Suggestions are temporarily unavailable. You can keep typing manually.</div> : null}

          <div translate="no" style={{ padding: '7px 12px', display: 'flex', justifyContent: 'flex-end', gap: 4, background: 'var(--bk-surface)', color: 'var(--bk-muted)', fontFamily: 'Roboto, Arial, sans-serif', fontSize: 10.5, whiteSpace: 'nowrap' }}>
            Powered by{' '}
            <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 700 }}>Geoapify</a>
            <span aria-hidden>·</span>
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>© OpenStreetMap</a>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const messageStyle: React.CSSProperties = {
  padding: '13px 14px',
  color: 'var(--bk-body)',
  fontSize: 11.5,
  lineHeight: 1.45,
}
