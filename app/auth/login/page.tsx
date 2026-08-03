'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import {
  AuthBrandPanel,
  AuthField,
  AuthFormPanel,
  AuthSplitLayout,
  LockIcon,
  MailIcon,
  PasswordToggle,
} from '@/components/auth-shell'
import { WELCOME_SPLASH_FLAG } from '@/components/dashboard-splash'
import { checkAuthEmail } from '@/lib/auth-email'
import { NEXT_PARAM, safeNextPath } from '@/lib/auth-routes'
import { supabase } from '@/lib/supabase'
import { fs, radius } from '@/lib/marketing-scale'

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function LoginContent() {
  const searchParams = useSearchParams()
  /** Where the proxy turned this visitor away from, if anywhere. */
  const nextPath = safeNextPath(searchParams.get(NEXT_PARAM))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setError('')
    setInfo('')

    /*
     * Normalize before Supabase sees it. The field used to be passed verbatim,
     * so an address carrying a trailing space from a phone keyboard — or a
     * zero-width space from a copy-paste — was rejected as malformed while
     * looking perfectly correct on screen. Asking the guest to fix a character
     * they cannot see is not a fix, so it is removed instead.
     */
    const emailCheck = checkAuthEmail(email)
    if (!emailCheck.ok) {
      setError(emailCheck.message ?? 'Enter your email address.')
      return
    }

    setLoading(true)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: emailCheck.email,
      password,
    })
    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }
    try { sessionStorage.setItem(WELCOME_SPLASH_FLAG, '1') } catch { /* storage blocked */ }
    const userId = data.user?.id
    if (!userId) { window.location.replace(nextPath); return }
    const { data: business } = await supabase.from('businesses').select('id').eq('user_id', userId).maybeSingle()
    // Back where they were headed — but an account with no business has to
    // finish onboarding first, whatever page it was aiming at.
    window.location.replace(business ? nextPath : '/onboarding')
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setInfo('')
    setLoading(true)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?${NEXT_PARAM}=${encodeURIComponent(nextPath)}`,
      },
    })
    if (oauthError) { setError(oauthError.message); setLoading(false) }
  }

  const handleForgotPassword = async () => {
    setError('')
    setInfo('')
    /*
     * Same gate as sign-in: normalize (strip invisibles, trim, lowercase) then
     * validate. The public Supabase `/recover` call used to run next, and it
     * rejects a few placeholder addresses — notably `test@test.com` — as
     * "invalid" even though that same address signs in. `/api/auth/forgot-password`
     * uses the admin recovery link instead, after this same check.
     */
    const emailCheck = checkAuthEmail(email)
    if (!emailCheck.email) {
      setError('Enter your email above so we can send a reset link.')
      return
    }
    if (!emailCheck.ok) {
      setError(emailCheck.message ?? 'Enter a valid email address.')
      return
    }
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailCheck.email }),
    })
    let payload: { error?: string } = {}
    try {
      payload = (await res.json()) as { error?: string }
    } catch {
      /* non-JSON — fall through to a generic message */
    }
    if (!res.ok) {
      setError(payload.error ?? 'Could not send a reset link. Please try again.')
      return
    }
    setInfo('Reset link sent — check your inbox. It works once, and expires in an hour.')
  }

  return (
    <AuthSplitLayout>
      <AuthBrandPanel />

      <AuthFormPanel>
          {/* Head */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: fs.caption, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#38bdf8', marginBottom: 10 }}>
              Welcome back
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-playfair), Georgia, serif',
                fontSize: fs.formTitle, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.12,
                color: '#f2f7fc',
              }}
            >
              Sign in to OceanCore
            </h2>
            <p style={{ marginTop: 9, fontSize: fs.body, lineHeight: 1.5, color: 'rgba(242,247,252,0.62)' }}>
              Step back into your command deck and keep service moving.
            </p>
          </div>

          {/* Google SSO — primary */}
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={loading}
            className={cn(
              'flex w-full items-center justify-center gap-[11px] transition',
              loading && 'pointer-events-none opacity-70',
            )}
            style={{
              height: 50, borderRadius: radius.sm, border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.96)',
              color: '#1f2937', fontSize: fs.body, fontWeight: 600,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 26px rgba(0,0,0,0.35)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.96)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="my-5 flex items-center gap-[14px]">
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            <span style={{ fontSize: fs.caption, fontWeight: 500, letterSpacing: '0.06em', color: 'rgba(242,247,252,0.26)', textTransform: 'uppercase' }}>
              or sign in with email
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); void handleLogin() }}>
            <AuthField
              id="l-email"
              label="Email address"
              type="email"
              value={email}
              focused={emailFocused}
              onChange={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              autoComplete="email"
              icon={<MailIcon />}
            />

            <AuthField
              id="l-pw"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              focused={passwordFocused}
              onChange={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              autoComplete="current-password"
              icon={<LockIcon />}
              rightSlot={
                <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((p) => !p)} />
              }
            />

            {/* Forgot password */}
            <div className="mb-[18px] mt-[-4px] flex justify-end pr-0.5">
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                style={{ fontSize: fs.caption, color: 'rgba(242,247,252,0.40)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.16s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#38bdf8' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(242,247,252,0.40)' }}
              >
                Forgot password?
              </button>
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2"
              style={{
                height: 50, marginTop: 4, borderRadius: radius.sm, border: 'none',
                background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
                color: '#04121f', fontSize: fs.bodyLg, fontWeight: 700, letterSpacing: '0.01em',
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.75 : 1,
                boxShadow: '0 8px 22px rgba(14,165,233,0.32)',
                transition: 'transform 0.14s, box-shadow 0.18s, filter 0.18s',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 12px 30px rgba(14,165,233,0.45)'
                  e.currentTarget.style.filter = 'brightness(1.04)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = '0 8px 22px rgba(14,165,233,0.32)'
                e.currentTarget.style.filter = ''
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
              {!loading && (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              )}
            </button>
          </form>

          {/* Error / Info */}
          <AnimatePresence>
            {error ? (
              <motion.p
                key="err"
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                style={{ marginTop: 12, fontSize: fs.small, color: '#fca5a5', lineHeight: 1.45 }}
              >
                {error}
              </motion.p>
            ) : info ? (
              <motion.p
                key="info"
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                style={{ marginTop: 12, fontSize: fs.small, color: '#7dd3fc', lineHeight: 1.45 }}
              >
                {info}
              </motion.p>
            ) : null}
          </AnimatePresence>

          {/* Sign up link */}
          <p style={{ marginTop: 24, textAlign: 'center', fontSize: fs.body, color: 'rgba(242,247,252,0.40)' }}>
            New to OceanCore?{' '}
            <Link href="/auth/signup" style={{ color: '#38bdf8', fontWeight: 600, textDecoration: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
            >
              Create an account
            </Link>
          </p>

          {/* Trust line */}
          <div className="mt-[22px] flex items-center justify-center gap-4" style={{ fontSize: fs.caption, color: 'rgba(242,247,252,0.26)' }}>
            <span className="inline-flex items-center gap-[6px]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" style={{ opacity: 0.55 }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
              </svg>
              Bank-grade security
            </span>
            <span className="inline-flex items-center gap-[6px]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" style={{ opacity: 0.55 }}>
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
              </svg>
              99.9% uptime
            </span>
          </div>
      </AuthFormPanel>
    </AuthSplitLayout>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#050f1c' }} />}>
      <LoginContent />
    </Suspense>
  )
}
