'use client'

import { useCallback, useEffect, useState } from 'react'

import { supabase } from '@/lib/supabase'

/**
 * Settings → Security. Until now this tab read "Password changes and two-factor
 * authentication will live here. Coming soon." — meaning an owner who wanted to
 * rotate a password shared with a departing manager had no way to do it inside
 * the product at all.
 *
 * Two things live here, and both are about the same worry: someone who should no
 * longer have access still does. Changing the password, and cutting every other
 * signed-in device loose.
 */

const MIN_PASSWORD = 6
/** Same rule as signup and the reset page, so the three cannot disagree. */
const PASSWORD_RULE = /^[\x20-\x7EÀ-ɏ]+$/

function strengthOf(value: string): { score: number; label: string; color: string } {
  let score = 0
  if (value.length >= 6) score += 1
  if (value.length >= 12) score += 1
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1
  if (/\d/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1
  if (score <= 2) return { score, label: 'Weak', color: 'var(--bk-danger)' }
  if (score === 3) return { score, label: 'Fair', color: 'var(--bk-amber)' }
  if (score === 4) return { score, label: 'Good', color: 'var(--bk-accent)' }
  return { score, label: 'Strong', color: 'var(--bk-green)' }
}

const cardStyle: React.CSSProperties = {
  padding: 16,
  borderRadius: 14,
  border: '1px solid var(--bk-border)',
  background: 'var(--bk-card)',
  boxShadow: 'var(--bk-shadow)',
  display: 'grid',
  gap: 13,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--bk-border)',
  background: 'var(--bk-card)',
  color: 'var(--bk-head)',
  fontSize: 13.5,
  fontFamily: 'inherit',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 5,
  color: 'var(--bk-body)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

function noticeStyle(kind: 'error' | 'ok'): React.CSSProperties {
  return {
    margin: 0,
    padding: '9px 11px',
    borderRadius: 9,
    fontSize: 12.5,
    lineHeight: 1.5,
    border: `1px solid ${kind === 'ok' ? 'var(--bk-green-border)' : 'var(--bk-danger-border)'}`,
    background: kind === 'ok' ? 'var(--bk-green-bg)' : 'var(--bk-danger-bg)',
    color: kind === 'ok' ? 'var(--bk-green)' : 'var(--bk-danger)',
  }
}

export function SecurityPanel() {
  const [email, setEmail] = useState<string | null>(null)
  /** Google-only accounts have no password to confirm — they set their first one. */
  const [hasPassword, setHasPassword] = useState(true)
  const [providers, setProviders] = useState<string[]>([])

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const [signingOut, setSigningOut] = useState(false)
  const [sessionsNote, setSessionsNote] = useState('')

  useEffect(() => {
    let mounted = true
    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return
      const user = data.user
      setEmail(user?.email ?? null)
      const identities = user?.identities ?? []
      const list = identities.map((identity) => identity.provider)
      setProviders(list.length > 0 ? list : ['email'])
      // Signed up through Google and never set a password: there is nothing to
      // confirm, so asking for a current one would lock them out of this form.
      setHasPassword(list.length === 0 || list.includes('email'))
    })
    return () => {
      mounted = false
    }
  }, [])

  const handleChangePassword = useCallback(async () => {
    setError('')
    setDone('')

    if (next.length < MIN_PASSWORD || !PASSWORD_RULE.test(next)) {
      setError(`Use at least ${MIN_PASSWORD} characters, without unusual symbols.`)
      return
    }
    if (next !== confirm) {
      setError('The two new passwords do not match.')
      return
    }
    if (hasPassword && current.length === 0) {
      setError('Enter your current password to confirm the change.')
      return
    }
    if (hasPassword && current === next) {
      setError('The new password is the same as the current one.')
      return
    }

    setSaving(true)

    /*
     * Supabase will change a password on the strength of the session alone. That
     * makes an unattended laptop enough to take an account over, so the current
     * password is verified first — a sign-in attempt is the only way to check it.
     */
    if (hasPassword && email) {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      })
      if (reauthError) {
        setError('That current password is not right.')
        setSaving(false)
        return
      }
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next })
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    setCurrent('')
    setNext('')
    setConfirm('')
    setHasPassword(true)
    setDone('Password updated. Other devices stay signed in until you end them below.')
  }, [current, next, confirm, hasPassword, email])

  const handleSignOutOthers = useCallback(async () => {
    setSessionsNote('')
    setSigningOut(true)
    // 'others' keeps this tab alive; 'global' would sign the owner out mid-click.
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
    setSigningOut(false)
    setSessionsNote(
      signOutError
        ? `Could not end the other sessions: ${signOutError.message}`
        : 'Every other device has been signed out.',
    )
  }, [])

  const strength = strengthOf(next)
  const mismatch = confirm.length > 0 && confirm !== next

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Account */}
      <section style={cardStyle}>
        <div>
          <h2
            style={{
              margin: 0,
              color: 'var(--bk-head)',
              fontSize: 16,
              fontWeight: 750,
              letterSpacing: '-0.015em',
            }}
          >
            Your account
          </h2>
          <p style={{ margin: '5px 0 0', color: 'var(--bk-body)', fontSize: 12.5, lineHeight: 1.5 }}>
            The email you sign in with, and how.
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '11px 13px',
            borderRadius: 11,
            background: 'var(--bk-surface)',
          }}
        >
          <span style={{ color: 'var(--bk-head)', fontSize: 13.5, fontWeight: 600 }}>
            {email ?? 'Loading…'}
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            {providers.map((provider) => (
              <span
                key={provider}
                style={{
                  padding: '4px 9px',
                  borderRadius: 999,
                  background: 'var(--bk-card)',
                  border: '1px solid var(--bk-border)',
                  color: 'var(--bk-body)',
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: 'capitalize',
                }}
              >
                {provider}
              </span>
            ))}
          </span>
        </div>
      </section>

      {/* Password */}
      <section style={cardStyle}>
        <div>
          <h2
            style={{
              margin: 0,
              color: 'var(--bk-head)',
              fontSize: 16,
              fontWeight: 750,
              letterSpacing: '-0.015em',
            }}
          >
            {hasPassword ? 'Change password' : 'Set a password'}
          </h2>
          <p style={{ margin: '5px 0 0', color: 'var(--bk-body)', fontSize: 12.5, lineHeight: 1.5 }}>
            {hasPassword
              ? 'Worth doing whenever someone with the old one leaves the team.'
              : 'You sign in with Google today. Adding a password gives you a second way in.'}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleChangePassword()
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          {hasPassword ? (
            <div>
              <label htmlFor="sec-current" style={labelStyle}>
                Current password
              </label>
              <input
                id="sec-current"
                type={show ? 'text' : 'password'}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                style={inputStyle}
              />
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <div>
              <label htmlFor="sec-next" style={labelStyle}>
                New password
              </label>
              <input
                id="sec-next"
                type={show ? 'text' : 'password'}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                style={inputStyle}
              />
              {next.length > 0 ? (
                <div style={{ marginTop: 7 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 2,
                          background: i < strength.score ? strength.color : 'var(--bk-surface-2)',
                          transition: 'background 0.22s',
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: strength.color }}>
                    {strength.label}
                  </span>
                </div>
              ) : null}
            </div>

            <div>
              <label htmlFor="sec-confirm" style={labelStyle}>
                Confirm new password
              </label>
              <input
                id="sec-confirm"
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                style={{
                  ...inputStyle,
                  borderColor: mismatch ? 'var(--bk-danger-border)' : 'var(--bk-border)',
                }}
              />
              {mismatch ? (
                <span style={{ display: 'block', marginTop: 6, fontSize: 11.5, color: 'var(--bk-danger)' }}>
                  Does not match
                </span>
              ) : null}
            </div>
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              color: 'var(--bk-body)',
              fontSize: 12,
              cursor: 'pointer',
              width: 'fit-content',
            }}
          >
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              style={{ accentColor: 'var(--bk-accent)' }}
            />
            Show passwords
          </label>

          {error ? <p style={noticeStyle('error')}>{error}</p> : null}
          {done ? <p style={noticeStyle('ok')}>{done}</p> : null}

          <button
            type="submit"
            disabled={saving || next.length === 0 || confirm.length === 0}
            style={{
              justifySelf: 'start',
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--bk-inverse)',
              color: 'var(--bk-inverse-text)',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: saving || next.length === 0 ? 'not-allowed' : 'pointer',
              opacity: saving || next.length === 0 || confirm.length === 0 ? 0.55 : 1,
            }}
          >
            {saving ? 'Saving…' : hasPassword ? 'Update password' : 'Set password'}
          </button>
        </form>
      </section>

      {/* Other devices */}
      <section style={cardStyle}>
        <div>
          <h2
            style={{
              margin: 0,
              color: 'var(--bk-head)',
              fontSize: 16,
              fontWeight: 750,
              letterSpacing: '-0.015em',
            }}
          >
            Signed-in devices
          </h2>
          <p style={{ margin: '5px 0 0', color: 'var(--bk-body)', fontSize: 12.5, lineHeight: 1.5 }}>
            Ends every session except this one — the tablet at the host stand, a
            phone left behind, a browser someone forgot to close.
          </p>
        </div>

        {sessionsNote ? (
          <p style={noticeStyle(sessionsNote.startsWith('Could not') ? 'error' : 'ok')}>{sessionsNote}</p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleSignOutOthers()}
          disabled={signingOut}
          style={{
            justifySelf: 'start',
            padding: '10px 18px',
            borderRadius: 10,
            border: '1px solid var(--bk-danger-border)',
            background: 'var(--bk-danger-bg)',
            color: 'var(--bk-danger)',
            fontSize: 13,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: signingOut ? 'not-allowed' : 'pointer',
            opacity: signingOut ? 0.6 : 1,
          }}
        >
          {signingOut ? 'Ending sessions…' : 'Sign out other devices'}
        </button>
      </section>
    </div>
  )
}
