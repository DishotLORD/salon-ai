import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase-server'

type GeoapifyAutocompleteResponse = {
  results?: Array<{
    place_id?: string
    formatted?: string
    address_line1?: string
    address_line2?: string
    country_code?: string
    city?: string
    state?: string
    postcode?: string
    lat?: number
    lon?: number
  }>
  message?: string
}

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

function safeLanguageCode(value: string | null) {
  const primaryCode = value?.trim().toLowerCase().split(/[-_]/)[0]
  return primaryCode && /^[a-z]{2}$/.test(primaryCode) ? primaryCode : 'en'
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ suggestions: [], error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS })
  }

  const apiKey = process.env.GEOAPIFY_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json(
      { suggestions: [], configured: false },
      { status: 503, headers: NO_STORE_HEADERS },
    )
  }

  const url = new URL(request.url)
  const input = url.searchParams.get('q')?.trim().slice(0, 160) ?? ''

  if (input.length < 3) {
    return NextResponse.json({ suggestions: [], configured: true }, { headers: NO_STORE_HEADERS })
  }

  try {
    const geoapifyUrl = new URL('https://api.geoapify.com/v1/geocode/autocomplete')
    geoapifyUrl.search = new URLSearchParams({
      text: input,
      format: 'json',
      filter: 'countrycode:ca',
      lang: safeLanguageCode(url.searchParams.get('lang')),
      limit: '5',
      apiKey,
    }).toString()

    const geoapifyResponse = await fetch(geoapifyUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })

    const payload = (await geoapifyResponse.json()) as GeoapifyAutocompleteResponse
    if (!geoapifyResponse.ok) {
      console.error('Geoapify autocomplete failed:', geoapifyResponse.status, payload.message)
      return NextResponse.json(
        { suggestions: [], configured: true, error: 'Address suggestions are temporarily unavailable.' },
        { status: 502, headers: NO_STORE_HEADERS },
      )
    }

    const seenAddresses = new Set<string>()
    const suggestions = (payload.results ?? [])
      .flatMap((result) => {
        const address = result.formatted?.trim()
        if (!address || (result.country_code && result.country_code.toLowerCase() !== 'ca')) return []

        const normalizedAddress = address.toLocaleLowerCase('en-CA')
        if (seenAddresses.has(normalizedAddress)) return []
        seenAddresses.add(normalizedAddress)

        const secondaryText = result.address_line2?.trim()
          || [result.city, result.state, result.postcode].filter(Boolean).join(', ')

        return [{
          id: result.place_id || `${result.lat ?? ''}:${result.lon ?? ''}:${address}`,
          address,
          mainText: result.address_line1?.trim() || address,
          secondaryText,
        }]
      })
      .slice(0, 5)

    return NextResponse.json({ suggestions, configured: true }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    console.error('Geoapify autocomplete request error:', error)
    return NextResponse.json(
      { suggestions: [], configured: true, error: 'Address suggestions are temporarily unavailable.' },
      { status: 502, headers: NO_STORE_HEADERS },
    )
  }
}
