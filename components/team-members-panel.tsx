'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  BUSINESS_MEMBERS_MIGRATION_HINT,
  isBusinessMembersSchemaError,
  type BusinessRole,
} from '@/lib/business-access'
import { supabase } from '@/lib/supabase'

type MemberRow = {
  id: string
  email: string
  role: BusinessRole
  status: 'invited' | 'active'
}

type TeamMembersPanelProps = {
  businessId: string
  ownerEmail: string | null
  /** Light settings-page styles. */
  s: {
    bg: string
    panel: string
    text: string
    textMuted: string
    border: string
    accent: string
    shadow: string
  }
}

const ROLE_DESCRIPTIONS: Record<BusinessRole, string> = {
  owner: 'Full access, billing & team',
  manager: 'Operations, settings & menu',
  host: 'Bookings, chats & guests',
}

export function TeamMembersPanel({ businessId, ownerEmail, s }: TeamMembersPanelProps) {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [schemaReady, setSchemaReady] = useState(true)
  const [error, setError] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'manager' | 'host'>('host')
  const [inviting, setInviting] = useState(false)
  const [authEmail, setAuthEmail] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void supabase.auth.getUser().then(({ data }) => {
      if (mounted) setAuthEmail(data.user?.email ?? null)
    })
    return () => {
      mounted = false
    }
  }, [])

  const displayOwnerEmail = ownerEmail?.trim() || authEmail

  const loadMembers = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('business_members')
      .select('id, email, role, status')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true })
    if (err) {
      if (isBusinessMembersSchemaError(err.message)) setSchemaReady(false)
      else setError(err.message)
      setMembers([])
    } else {
      setSchemaReady(true)
      setMembers(
        (data ?? []).map((r) => ({
          id: String(r.id),
          email: String(r.email),
          role: (r.role === 'owner' || r.role === 'manager' ? r.role : 'host') as BusinessRole,
          status: r.status === 'active' ? 'active' : 'invited',
        })),
      )
    }
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch syncs external Supabase state
    void loadMembers()
  }, [loadMembers])

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.')
      return
    }
    if (displayOwnerEmail && email === displayOwnerEmail.trim().toLowerCase()) {
      setError('That is the owner account — it already has full access.')
      return
    }
    if (members.some((m) => m.email.toLowerCase() === email)) {
      setError('This email is already on the team.')
      return
    }
    setError('')
    setInviting(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('business_members').insert({
      business_id: businessId,
      email,
      role: inviteRole,
      status: 'invited',
      invited_by: user?.id ?? null,
    })
    setInviting(false)
    if (err) {
      if (isBusinessMembersSchemaError(err.message)) setSchemaReady(false)
      else setError(err.message)
      return
    }
    setInviteEmail('')
    await loadMembers()
  }

  const handleRoleChange = async (id: string, role: 'manager' | 'host') => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)))
    const { error: err } = await supabase.from('business_members').update({ role }).eq('id', id)
    if (err) {
      setError(err.message)
      await loadMembers()
    }
  }

  const handleRemove = async (id: string) => {
    const prev = members
    setMembers((p) => p.filter((m) => m.id !== id))
    const { error: err } = await supabase.from('business_members').delete().eq('id', id)
    if (err) {
      setError(err.message)
      setMembers(prev)
    }
  }

  if (!schemaReady) {
    return (
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px solid rgba(220, 38, 38, 0.35)',
          background: 'rgba(220, 38, 38, 0.06)',
          color: 'var(--bk-danger)',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {BUSINESS_MEMBERS_MIGRATION_HINT}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Invite form */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          placeholder="staff@example.com"
          style={{
            flex: '1 1 220px',
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${s.border}`,
            fontSize: 14,
            color: s.text,
            background: 'var(--bk-card)',
          }}
        />
        <select
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value === 'manager' ? 'manager' : 'host')}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px solid ${s.border}`,
            fontSize: 14,
            color: s.text,
            background: 'var(--bk-card)',
          }}
        >
          <option value="host">Host</option>
          <option value="manager">Manager</option>
        </select>
        <button
          type="button"
          onClick={() => void handleInvite()}
          disabled={inviting}
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            background: s.accent,
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            opacity: inviting ? 0.7 : 1,
          }}
        >
          {inviting ? 'Inviting…' : 'Invite'}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: s.textMuted, lineHeight: 1.6 }}>
        Invited staff get access the first time they sign in with this email.
        Managers: {ROLE_DESCRIPTIONS.manager.toLowerCase()}. Hosts: {ROLE_DESCRIPTIONS.host.toLowerCase()}.
      </p>

      {error && (
        <div style={{ fontSize: 13, color: 'var(--bk-danger)' }}>{error}</div>
      )}

      {/* Members list */}
      <div style={{ display: 'grid', gap: 8 }}>
        {/* Owner row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 10,
            border: `1px solid ${s.border}`,
            background: s.bg,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: s.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayOwnerEmail ?? 'Owner'}
            </div>
            <div style={{ fontSize: 12, color: s.textMuted }}>{ROLE_DESCRIPTIONS.owner}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: s.accent }}>
            Owner
          </span>
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: s.textMuted, padding: '8px 2px' }}>Loading team…</div>
        ) : members.length === 0 ? (
          <div style={{ fontSize: 13, color: s.textMuted, padding: '8px 2px' }}>
            No staff yet — invite your first team member above.
          </div>
        ) : (
          members.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 10,
                border: `1px solid ${s.border}`,
                background: s.panel,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: s.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.email}
                </div>
                <div style={{ fontSize: 12, color: s.textMuted }}>{ROLE_DESCRIPTIONS[m.role]}</div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: m.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                  color: m.status === 'active' ? 'var(--bk-green)' : 'var(--bk-amber)',
                }}
              >
                {m.status === 'active' ? 'Active' : 'Invited'}
              </span>
              <select
                value={m.role}
                onChange={(e) =>
                  void handleRoleChange(m.id, e.target.value === 'manager' ? 'manager' : 'host')
                }
                style={{
                  padding: '6px 8px',
                  borderRadius: 8,
                  border: `1px solid ${s.border}`,
                  fontSize: 12,
                  color: s.text,
                  background: 'var(--bk-card)',
                }}
              >
                <option value="host">Host</option>
                <option value="manager">Manager</option>
              </select>
              <button
                type="button"
                onClick={() => void handleRemove(m.id)}
                aria-label={`Remove ${m.email}`}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: `1px solid ${s.border}`,
                  background: 'transparent',
                  color: s.textMuted,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
