'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { AnalyticsView, type MessageStats } from '@/components/analytics-view'
import {
  buildAnalyticsReport,
  reportWindow,
  type AnalyticsAppointmentRow,
  type AnalyticsRange,
  type AnalyticsZone,
} from '@/lib/analytics'
import { resolveBusinessAccess } from '@/lib/business-access'
import { parseBookingSettings, type BookingSettings } from '@/lib/booking-settings'
import { supabase } from '@/lib/supabase'

type SampleMessage = { role: string; created_at: string; conversation_id: string }

/** Median seconds between a guest message and the next AI reply, per conversation. */
function medianReplySeconds(messages: SampleMessage[]): number | null {
  const byConversation = new Map<string, SampleMessage[]>()
  for (const m of messages) {
    const list = byConversation.get(m.conversation_id)
    if (list) list.push(m)
    else byConversation.set(m.conversation_id, [m])
  }
  const deltas: number[] = []
  for (const list of byConversation.values()) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at))
    let pendingUserMs: number | null = null
    for (const m of list) {
      const ms = Date.parse(m.created_at)
      if (!Number.isFinite(ms)) continue
      if (m.role === 'user') {
        pendingUserMs = ms
      } else if (m.role === 'assistant' && pendingUserMs != null) {
        const delta = (ms - pendingUserMs) / 1000
        if (delta >= 0 && delta <= 3600) deltas.push(delta)
        pendingUserMs = null
      }
    }
  }
  if (deltas.length === 0) return null
  deltas.sort((a, b) => a - b)
  return deltas[Math.floor(deltas.length / 2)]
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const [rows, setRows] = useState<AnalyticsAppointmentRow[]>([])
  const [zones, setZones] = useState<AnalyticsZone[]>([])
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [settings, setSettings] = useState<BookingSettings | null>(null)
  const [conversationIds, setConversationIds] = useState<string[] | null>(null)
  const [messageStats, setMessageStats] = useState<MessageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      const access = await resolveBusinessAccess()
      if (!access) {
        if (!cancelled) {
          setRows([])
          setConversationIds([])
          setLoading(false)
        }
        return
      }
      const { data: biz } = await supabase
        .from('businesses')
        .select('id, booking_settings')
        .eq('id', access.businessId)
        .maybeSingle()
      if (!biz?.id) {
        if (!cancelled) {
          setRows([])
          setConversationIds([])
          setLoading(false)
        }
        return
      }

      const [apptRes, zoneRes, convRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('customer_id, scheduled_at, status, party_size, service_name, zone_id')
          .eq('business_id', biz.id)
          .order('scheduled_at', { ascending: true }),
        supabase
          .from('dining_zones')
          .select('id, name, max_concurrent_parties, turnover_minutes, is_active')
          .eq('business_id', biz.id),
        supabase.from('conversations').select('id').eq('business_id', biz.id),
      ])

      if (cancelled) return
      if (apptRes.error) {
        setError("We couldn't load analytics data.")
        setLoading(false)
        return
      }
      setBusinessId(biz.id)
      setSettings(parseBookingSettings(biz.booking_settings))
      setRows((apptRes.data ?? []) as AnalyticsAppointmentRow[])
      setZones((zoneRes.data ?? []) as AnalyticsZone[])
      setConversationIds((convRes.data ?? []).map((r) => String(r.id)))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Message count + reply time for the selected range.
  useEffect(() => {
    if (conversationIds == null) return
    if (conversationIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- terminal state for the empty case; no fetch to run
      setMessageStats({ count: 0, medianReplySeconds: null })
      return
    }
    let cancelled = false
    setMessageStats(null)
    void (async () => {
      const startISO = new Date(reportWindow(range).start).toISOString()
      const chunkSize = 200
      let count = 0
      const sample: SampleMessage[] = []
      for (let i = 0; i < conversationIds.length; i += chunkSize) {
        const chunk = conversationIds.slice(i, i + chunkSize)
        const [countRes, sampleRes] = await Promise.all([
          supabase.from('messages').select('*', { count: 'exact', head: true }).in('conversation_id', chunk).gte('created_at', startISO),
          supabase
            .from('messages')
            .select('role, created_at, conversation_id')
            .in('conversation_id', chunk)
            .gte('created_at', startISO)
            .order('created_at', { ascending: true })
            .limit(1000),
        ])
        if (cancelled) return
        count += countRes.count ?? 0
        for (const m of sampleRes.data ?? []) sample.push(m as SampleMessage)
      }
      if (!cancelled) setMessageStats({ count, medianReplySeconds: medianReplySeconds(sample) })
    })()
    return () => {
      cancelled = true
    }
  }, [conversationIds, range])

  const report = useMemo(() => buildAnalyticsReport(rows, zones, range), [rows, zones, range])
  const avgCheck = settings?.average_check ?? 0

  const saveAvgCheck = useCallback(
    async (value: number): Promise<boolean> => {
      if (!businessId || !settings) return false
      const next = { ...settings, average_check: value }
      const { error: err } = await supabase.from('businesses').update({ booking_settings: next }).eq('id', businessId)
      if (err) return false
      setSettings(next)
      return true
    },
    [businessId, settings],
  )

  return (
    <AnalyticsView
      report={report}
      range={range}
      onRangeChange={setRange}
      messageStats={messageStats}
      avgCheck={avgCheck}
      onSaveAvgCheck={saveAvgCheck}
      loading={loading}
      error={error}
      hasAnyData={rows.length > 0}
    />
  )
}
