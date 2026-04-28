'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { supabase } from '@/lib/supabase'

type AuthMode = 'login' | 'register'

type FieldProps = {
  id: string
  label: string
  type: string
  value: string
  active: boolean
  onChange: (value: string) => void
  onFocus: () => void
  onBlur: () => void
  icon: React.ReactNode
  rightSlot?: React.ReactNode
}

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function EnvelopeIcon({ active }: { active: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      className="h-[15px] w-[15px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      animate={{ color: active ? '#38bdf8' : 'rgba(255,255,255,0.35)' }}
      transition={{ duration: 0.2 }}
    >
      <path d="M3.75 7.5h16.5v9a1.5 1.5 0 0 1-1.5 1.5h-13.5a1.5 1.5 0 0 1-1.5-1.5v-9Z" />
      <path d="m4.5 8.25 7.01 5.2a.83.83 0 0 0 .98 0l7.01-5.2" />
    </motion.svg>
  )
}

function LockIcon({ active }: { active: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 24 24"
      className="h-[15px] w-[15px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      animate={{ color: active ? '#38bdf8' : 'rgba(255,255,255,0.35)' }}
      transition={{ duration: 0.2 }}
    >
      <path d="M7.5 10.5V8.25a4.5 4.5 0 1 1 9 0v2.25" />
      <rect x="5.25" y="10.5" width="13.5" height="9" rx="2.25" />
      <path d="M12 13.75v2.5" />
    </motion.svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M2.25 12s3.75-6 9.75-6 9.75 6 9.75 6-3.75 6-9.75 6-9.75-6-9.75-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 3 21 21" />
      <path d="M10.58 10.58a2 2 0 0 0 2.84 2.84" />
      <path d="M9.88 5.08A10.88 10.88 0 0 1 12 4.88c6 0 9.75 6 9.75 6a17.82 17.82 0 0 1-3.14 3.68" />
      <path d="M6.23 6.22A18.1 18.1 0 0 0 2.25 12s3.75 6 9.75 6c1.53 0 2.93-.3 4.2-.8" />
    </svg>
  )
}

function FloatingField({
  id,
  label,
  type,
  value,
  active,
  onChange,
  onFocus,
  onBlur,
  icon,
  rightSlot,
}: FieldProps) {
  return (
    <motion.div
      className="relative mb-5 rounded-[14px]"
      animate={{
        backgroundColor: active ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.06)',
        borderColor: active ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.1)',
        boxShadow: active ? '0 0 0 3px rgba(56,189,248,0.08)' : '0 0 0 0 rgba(56,189,248,0)',
      }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      style={{ borderWidth: 1, borderStyle: 'solid' }}
    >
      <div
        className="pointer-events-none absolute left-0 top-1/2"
        style={{ left: 16, transform: 'translateY(-50%)' }}
      >
        {icon}
      </div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className="w-full rounded-[14px] border-none bg-transparent pb-2 pl-11 pr-11 pt-[22px] text-[15px] text-white outline-none focus:outline-none focus:ring-0 focus-visible:outline-none"
        autoComplete="off"
        spellCheck={false}
        style={{
          caretColor: '#38bdf8',
          boxShadow: 'none',
          WebkitAppearance: 'none',
        }}
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute"
        style={{
          top: active ? 6 : 16,
          left: 44,
          fontSize: active ? 10 : 14,
          letterSpacing: active ? 2 : 0,
          color: active ? '#38bdf8' : 'rgba(255,255,255,0.35)',
          textTransform: active ? 'uppercase' : 'none',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {label}
      </label>
      {rightSlot}
    </motion.div>
  )
}

function LoginContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const authMode: AuthMode = searchParams.get('mode') === 'signup' ? 'register' : 'login'
  const isSignUp = authMode === 'register'

  const emailActive = emailFocused || email.length > 0
  const passwordActive = passwordFocused || password.length > 0

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const userId = data.user?.id
    if (!userId) {
      window.location.replace('/dashboard')
      return
    }
    const { data: business } = await supabase.from('businesses').select('id').eq('user_id', userId).maybeSingle()
    window.location.replace(business ? '/dashboard' : '/onboarding')
  }

  const handleSignUp = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    window.location.replace('/onboarding')
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  const handlePrimaryAction = () => {
    if (authMode === 'login') {
      void handleLogin()
    } else {
      void handleSignUp()
    }
  }

  const title = isSignUp ? 'Create your account' : 'Welcome back'
  const body = isSignUp
    ? 'Launch your AI operations stack from an elegant control surface beneath the tide.'
    : 'Slip back into your command deck and let the ocean carry the busywork.'

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020c1b] px-6 py-10 text-white">
      <video
        autoPlay
        muted
        loop
        playsInline
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 0,
        }}
      >
        <source src="https://ffophqyrencnuxpkwlqk.supabase.co/storage/v1/object/public/media/ocean.mp4" type="video/mp4" />
      </video>

      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'rgba(0,10,30,0.35)', zIndex: 1 }}
      />

      <div className="pointer-events-none absolute left-6 top-6 z-10 text-[11px] uppercase tracking-[0.4em] text-white/[0.08]">
        OceanCore
      </div>

      <motion.section
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[420px] overflow-hidden rounded-[24px] border border-white/[0.15] px-8 py-12 sm:px-12 sm:py-14"
        style={{
          background: 'rgba(5, 20, 40, 0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow:
            '0 0 0 1px rgba(255,255,255,0.05), 0 32px 64px rgba(0,0,0,0.4), 0 16px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_35%,rgba(255,255,255,0.02)_100%)]" />

        <div className="relative">
          <div className="mb-12 text-center">
            <div className="inline-flex items-end justify-center">
              <span
                className="text-[34px] font-bold leading-none text-sky-400"
                style={{ fontFamily: 'var(--font-playfair)' }}
              >
                Ocean
              </span>
              <span
                className="text-[22px] font-normal leading-none text-white/60"
                style={{ fontFamily: 'var(--font-playfair)' }}
              >
                Core
              </span>
            </div>
            <div className="mx-auto mt-5 h-px w-10 bg-white/20" />
            <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-white/50">
              AI Operations Platform
            </p>
          </div>

          <div className="mb-8 text-center">
            <h1 className="text-[28px] font-bold text-white">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-white/75">{body}</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handlePrimaryAction()
            }}
          >
            <FloatingField
              id="auth-email"
              label="Email"
              type="email"
              value={email}
              active={emailActive}
              onChange={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              icon={<EnvelopeIcon active={emailActive} />}
            />

            <>
              <FloatingField
                id="auth-password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                active={passwordActive}
                onChange={setPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                icon={<LockIcon active={passwordActive} />}
                rightSlot={
                  <>
                    <button
                      type="button"
                      style={{
                        position: 'absolute',
                        right: 16,
                        top: 6,
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.35)',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        transition: 'color 0.18s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#38bdf8'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'rgba(255,255,255,0.35)'
                      }}
                    >
                      Forgot?
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-4 bottom-[10px] text-white/30 transition hover:text-white/70"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </>
                }
              />
            </>

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={loading ? undefined : { scale: 1.02, boxShadow: '0 12px 32px rgba(14,165,233,0.5)' }}
              whileTap={loading ? undefined : { scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'mt-2 flex h-[52px] w-full items-center justify-center rounded-xl border-0 text-[13px] font-semibold uppercase tracking-[0.2em] text-white transition',
              )}
              style={{
                background: '#0ea5e9',
                boxShadow: '0 8px 24px rgba(14,165,233,0.4)',
              }}
            >
              {loading
                ? authMode === 'login'
                  ? 'Signing in...'
                  : 'Creating account...'
                : authMode === 'login'
                  ? 'Sign in'
                  : 'Register'}
            </motion.button>

            <AnimatePresence>
              {error ? (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mt-3 text-sm text-rose-300"
                >
                  {error}
                </motion.p>
              ) : null}
            </AnimatePresence>

            <motion.button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={loading}
              whileHover={
                loading
                  ? undefined
                  : {
                      backgroundColor: 'rgba(255,255,255,0.09)',
                      borderColor: 'rgba(255,255,255,0.2)',
                    }
              }
              whileTap={loading ? undefined : { scale: 0.985 }}
              transition={{ duration: 0.15 }}
              className="mt-3 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/8 text-[13px] font-medium text-white/85"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Continue with Google</span>
            </motion.button>
          </form>

          <div className="mt-7 text-center text-[13px] text-white/45">
            {isSignUp ? 'Already have an account? ' : 'New to OceanCore? '}
            <Link
              href={isSignUp ? '/auth/login' : '/auth/login?mode=signup'}
              className="font-semibold text-sky-400 transition hover:underline"
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </Link>
          </div>
        </div>
      </motion.section>

      <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-center text-[11px] text-white/[0.1]">
        © 2025 OceanCore
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: 'var(--ocean-deep)' }} />
      }
    >
      <LoginContent />
    </Suspense>
  )
}
