'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { Suspense, useCallback, useEffect, useState } from 'react'

import {
  AuthBrandPanel,
  AuthField,
  AuthFormPanel,
  AuthSplitLayout,
  AuthSubmitButton,
  LockIcon,
  MailIcon,
  PasswordToggle,
} from '@/components/auth-shell'
import { supabase } from '@/lib/supabase'
import { fs, radius } from '@/lib/marketing-scale'

/**
 * Where a "reset your password" email actually lands.
 *
 * The reset used to point at /auth/login, which has no field for a new password
 * — so the whole flow dead-ended: the owner clicked the link, saw the sign-in
 * form, and still could not get in. This page finishes the job.
 *
 * Supabase can deliver the recovery grant three different ways depending on the
 * project's email template and which device opened the link, so all three are
 * handled:
 *   • `?code=…`      PKCE. The browser client's detectSessionInUrl usually
 *                    exchanges it before this component mounts; when it does
 *                    not (a second render, a stripped URL) we exchange it here.
 *   • `#access_token=…&type=recovery`  the older implicit hash.
 *   • `?token_hash=…&type=recovery`    the cross-device form, which works even
 *                    when the link is opened in a different browser from the one
 *                    that asked for it — PKCE cannot, because the verifier lives
 *                    in the requesting browser's storage.
 */

type Phase = 'verifying' | 'ready' | 'invalid' | 'done'

const MIN_PASSWORD = 6
/** Same rule the signup form enforces, so the two screens cannot disagree. */
const PASSWORD_RULE = /^[\x20-\x7EÀ-ɏ]+$/

function passwordProblem(value: string): string {
  if (value.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters`
  if (!PASSWORD_RULE.test(value)) return 'Min. 6 characters, no unusual symbols'
  return ''
}

/** Rough strength read-out — enough to nudge, not enough to block. */
function strengthOf(value: string): { score: number; label: string; color: string } {
  let score = 0
  if (value.length >= 6) score += 1
  if (value.length >= 12) score += 1
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1
  if (/\d/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1
  if (score <= 2) return { score, label: 'Weak', color: '#f87171' }
  if (score === 3) return { score, label: 'Fair', color: '#fbbf24' }
  if (score === 4) return { score, label: 'Good', color: '#38bdf8' }
  return { score, label: 'Strong', color: '#4ade80' }
}

function ResetPasswordContent() {
  const [phase, setPhase] = useState<Phase>('verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwFocused, setPwFocused] = useState(false)
  const [confirmFocused, setConfirmFocused] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [saving, setSaving] = useState(false)

  // Re-request form, shown when the link is stale.
  const [resendEmail, setResendEmail] = useState('')
  const [resendFocused, setResendFocused] = useState(false)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    let settled = false
    let cancelled = false

    const finish = (next: Phase, message = '') => {
      if (cancelled || settled) return
      settled = true
      setPhase(next)
      if (message) setError(message)
    }

    const url = new URL(window.location.href)
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
    const tokenHash = url.searchParams.get('token_hash') ?? hash.get('token_hash')
    const code = url.searchParams.get('code')
    /** A grant in the URL still has to be redeemed, so nothing else may rule first. */
    const carriesGrant = Boolean(tokenHash || code || hash.get('access_token'))

    /*
     * The grant can also reach us as an auth event rather than as something we
     * can read off the URL — that is what happens when the client's own
     * detectSessionInUrl wins the race, and INITIAL_SESSION is how we learn
     * there is no grant at all. Subscribing before touching the URL means we
     * cannot miss either.
     *
     * Driven by events rather than a getSession() call on purpose: the same
     * pattern the SessionGuard uses, and it settles without waiting on the auth
     * client's internal lock, which does not always release in an embedded or
     * background browser view.
     */
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        finish('ready')
        return
      }
      // No session and none coming: the visitor opened this page cold.
      if (event === 'INITIAL_SESSION' && !carriesGrant) finish('invalid')
    })

    void (async () => {
      // Supabase reports a dead link by redirecting with an error, not a token.
      const failure =
        url.searchParams.get('error_description') ??
        hash.get('error_description') ??
        url.searchParams.get('error') ??
        hash.get('error')
      if (failure) {
        finish('invalid', failure.replace(/\+/g, ' '))
        return
      }

      if (tokenHash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        })
        finish(otpError ? 'invalid' : 'ready', otpError?.message ?? '')
        return
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        // An "already used" code means detectSessionInUrl got there first, which
        // is a success — the subscription above will have settled us to ready.
        finish(exchangeError ? 'invalid' : 'ready', exchangeError?.message ?? '')
      }
    })()

    /*
     * Whatever happens, stop spinning. Someone locked out of their account is
     * better served by the "send a new link" form than by a spinner that never
     * resolves.
     */
    const bailout = window.setTimeout(() => finish('invalid'), 8000)

    return () => {
      cancelled = true
      window.clearTimeout(bailout)
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleSave = useCallback(async () => {
    setError('')
    setInfo('')
    const problem = passwordProblem(password)
    if (problem) {
      setError(problem)
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match')
      return
    }

    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }
    setPhase('done')
    setSaving(false)
  }, [password, confirm])

  const handleResend = useCallback(async () => {
    setError('')
    setInfo('')
    const address = resendEmail.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) {
      setError('Enter the email address on your account')
      return
    }
    setResending(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setResending(false)
    if (resetError) {
      setError(resetError.message)
      return
    }
    setInfo('New link sent. It is good for one hour.')
  }, [resendEmail])

  const strength = strengthOf(password)
  const mismatch = confirm.length > 0 && confirm !== password

  return (
    <AuthSplitLayout>
      <AuthBrandPanel
        eyebrow="Account recovery"
        headline={
          <>
            Back on the floor in <em style={{ fontStyle: 'italic', color: '#38bdf8' }}>one</em>{' '}
            minute.
          </>
        }
        blurb="Choose a new password and your dashboard, guests and reservations are exactly where you left them."
        features={[
          'Your reservations and guest data are untouched',
          'The link works once, then expires',
          'Signed in everywhere as soon as you save',
        ]}
      />

      <AuthFormPanel>
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: fs.caption,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#38bdf8',
              marginBottom: 10,
            }}
          >
            {phase === 'done' ? 'All set' : 'Reset password'}
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-playfair), Georgia, serif',
              fontSize: fs.formTitle,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              lineHeight: 1.12,
              color: '#f2f7fc',
              margin: 0,
            }}
          >
            {phase === 'verifying' && 'Checking your link…'}
            {phase === 'ready' && 'Choose a new password'}
            {phase === 'invalid' && 'That link has expired'}
            {phase === 'done' && 'Your password is updated'}
          </h2>
          <p style={{ marginTop: 10, fontSize: fs.body, lineHeight: 1.55, color: 'rgba(242,247,252,0.55)' }}>
            {phase === 'verifying' && 'One moment while we confirm the reset link.'}
            {phase === 'ready' && 'Pick something you have not used elsewhere. You will stay signed in on this device.'}
            {phase === 'invalid' && 'Reset links are single-use and last an hour. Send yourself a fresh one below.'}
            {phase === 'done' && 'You are signed in. Head to the dashboard whenever you are ready.'}
          </p>
        </div>

        {phase === 'verifying' ? (
          <div
            style={{
              height: 50,
              borderRadius: radius.sm,
              background: 'rgba(255,255,255,0.035)',
              border: '1px solid rgba(255,255,255,0.10)',
              display: 'grid',
              placeItems: 'center',
              color: 'rgba(242,247,252,0.40)',
              fontSize: fs.small,
            }}
          >
            Verifying…
          </div>
        ) : null}

        {phase === 'ready' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleSave()
            }}
          >
            <AuthField
              id="r-pw"
              label="New password"
              type={showPw ? 'text' : 'password'}
              value={password}
              focused={pwFocused}
              onChange={setPassword}
              onFocus={() => setPwFocused(true)}
              onBlur={() => setPwFocused(false)}
              autoComplete="new-password"
              icon={<LockIcon />}
              rightSlot={<PasswordToggle shown={showPw} onToggle={() => setShowPw((p) => !p)} />}
            />

            {/* Strength meter — appears only once there is something to measure. */}
            <AnimatePresence>
              {password.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden', marginBottom: 14 }}
                >
                  <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        style={{
                          flex: 1,
                          height: 3,
                          borderRadius: 2,
                          background: i < strength.score ? strength.color : 'rgba(255,255,255,0.08)',
                          transition: 'background 0.22s',
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: fs.micro, fontWeight: 600, color: strength.color }}>
                    {strength.label}
                  </span>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AuthField
              id="r-pw2"
              label="Confirm new password"
              type={showPw ? 'text' : 'password'}
              value={confirm}
              focused={confirmFocused}
              onChange={setConfirm}
              onFocus={() => setConfirmFocused(true)}
              onBlur={() => setConfirmFocused(false)}
              autoComplete="new-password"
              icon={<LockIcon />}
            />

            {mismatch ? (
              <p style={{ margin: '-6px 0 14px', fontSize: fs.caption, color: '#fca5a5' }}>
                The two passwords do not match
              </p>
            ) : null}

            <AuthSubmitButton
              label="Save new password"
              pendingLabel="Saving…"
              pending={saving}
              disabled={password.length === 0 || confirm.length === 0}
            />
          </form>
        ) : null}

        {phase === 'invalid' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleResend()
            }}
          >
            <AuthField
              id="r-email"
              label="Email address"
              type="email"
              value={resendEmail}
              focused={resendFocused}
              onChange={setResendEmail}
              onFocus={() => setResendFocused(true)}
              onBlur={() => setResendFocused(false)}
              autoComplete="email"
              icon={<MailIcon />}
            />
            <AuthSubmitButton
              label="Send a new link"
              pendingLabel="Sending…"
              pending={resending}
              disabled={resendEmail.trim().length === 0}
            />
          </form>
        ) : null}

        {phase === 'done' ? (
          <Link
            href="/dashboard"
            className="flex w-full items-center justify-center gap-2"
            style={{
              height: 50,
              borderRadius: radius.sm,
              background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
              color: '#04121f',
              fontSize: fs.bodyLg,
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 8px 22px rgba(14,165,233,0.32)',
            }}
          >
            Go to dashboard
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        ) : null}

        <AnimatePresence>
          {error ? (
            <motion.p
              key="err"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              style={{ marginTop: 12, fontSize: fs.small, color: '#fca5a5', lineHeight: 1.45 }}
            >
              {error}
            </motion.p>
          ) : info ? (
            <motion.p
              key="info"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              style={{ marginTop: 12, fontSize: fs.small, color: '#7dd3fc', lineHeight: 1.45 }}
            >
              {info}
            </motion.p>
          ) : null}
        </AnimatePresence>

        {phase !== 'done' ? (
          <p style={{ marginTop: 24, textAlign: 'center', fontSize: fs.body, color: 'rgba(242,247,252,0.40)' }}>
            Remembered it?{' '}
            <Link
              href="/auth/login"
              style={{ color: '#38bdf8', fontWeight: 600, textDecoration: 'none' }}
            >
              Back to sign in
            </Link>
          </p>
        ) : null}
      </AuthFormPanel>
    </AuthSplitLayout>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#050f1c' }} />}>
      <ResetPasswordContent />
    </Suspense>
  )
}
