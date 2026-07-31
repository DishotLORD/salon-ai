'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

import { AuthBrandVideo } from '@/components/auth-brand-video'
import { BrandTransitionLink } from '@/components/brand-transition-link'
import { OceanCoreLogoCompact } from '@/components/oceancore-logo'
import { fs, radius } from '@/lib/marketing-scale'

/**
 * The furniture every sign-in surface shares: the video brand panel on the
 * left, the floating-label fields, the gradient submit button. Extracted from
 * the login page when password reset needed its own screen — two copies of a
 * 200-line brand panel is how the two halves of an auth flow start looking like
 * different products.
 */

export function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M2.25 12s3.75-6 9.75-6 9.75 6 9.75 6-3.75 6-9.75 6-9.75-6-9.75-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 3 21 21" />
      <path d="M10.58 10.58a2 2 0 0 0 2.84 2.84" />
      <path d="M9.88 5.08A10.88 10.88 0 0 1 12 4.88c6 0 9.75 6 9.75 6a17.82 17.82 0 0 1-3.14 3.68" />
      <path d="M6.23 6.22A18.1 18.1 0 0 0 2.25 12s3.75 6 9.75 6c1.53 0 2.93-.3 4.2-.8" />
    </svg>
  )
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M7.5 10.5V8.25a4.5 4.5 0 1 1 9 0v2.25" />
      <rect x="5.25" y="10.5" width="13.5" height="9" rx="2.25" />
      <path d="M12 13.75v2.5" />
    </svg>
  )
}

export function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3.75 7.5h16.5v9a1.5 1.5 0 0 1-1.5 1.5h-13.5a1.5 1.5 0 0 1-1.5-1.5v-9Z" />
      <path d="m4.5 8.25 7.01 5.2a.83.83 0 0 0 .98 0l7.01-5.2" />
    </svg>
  )
}

export type AuthFieldProps = {
  id: string
  label: string
  type: string
  value: string
  focused: boolean
  onChange: (v: string) => void
  onFocus: () => void
  onBlur: () => void
  icon: ReactNode
  rightSlot?: ReactNode
  autoComplete?: string
}

export function AuthField({
  id,
  label,
  type,
  value,
  focused,
  onChange,
  onFocus,
  onBlur,
  icon,
  rightSlot,
  autoComplete,
}: AuthFieldProps) {
  const active = focused || value.length > 0
  return (
    <motion.div
      className="relative mb-[14px]"
      style={{ borderRadius: radius.sm, borderWidth: 1, borderStyle: 'solid' }}
      animate={{
        borderColor: focused ? 'rgba(56,189,248,0.55)' : 'rgba(255,255,255,0.10)',
        background: focused ? 'rgba(56,189,248,0.05)' : 'rgba(255,255,255,0.035)',
        boxShadow: focused ? '0 0 0 3px rgba(56,189,248,0.10)' : '0 0 0 0px rgba(56,189,248,0)',
      }}
      transition={{ duration: 0.2 }}
    >
      <span
        className="pointer-events-none absolute flex"
        style={{ left: 15, top: '50%', transform: 'translateY(-50%)' }}
      >
        <motion.span
          animate={{ color: active ? '#38bdf8' : 'rgba(242,247,252,0.40)' }}
          transition={{ duration: 0.2 }}
        >
          {icon}
        </motion.span>
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        autoComplete={autoComplete}
        className="w-full border-none bg-transparent text-[15px] text-[#f2f7fc] outline-none"
        style={{ padding: '23px 44px 9px 43px', borderRadius: radius.sm, caretColor: '#38bdf8' }}
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute"
        style={{
          left: 43,
          top: active ? 7 : 16,
          fontSize: active ? fs.micro : fs.body,
          fontWeight: active ? 600 : 400,
          letterSpacing: active ? '0.12em' : 0,
          textTransform: active ? 'uppercase' : 'none',
          color: active ? '#38bdf8' : 'rgba(242,247,252,0.40)',
          transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {label}
      </label>
      {rightSlot}
    </motion.div>
  )
}

/** Show/hide toggle for a password field, positioned inside AuthField. */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute flex items-center justify-center text-[rgba(242,247,252,0.40)] transition-colors hover:text-[rgba(242,247,252,0.70)]"
      style={{
        right: 14,
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 4,
      }}
      aria-label={shown ? 'Hide password' : 'Show password'}
    >
      <EyeIcon open={shown} />
    </button>
  )
}

export function AuthSubmitButton({
  label,
  pendingLabel,
  pending,
  disabled,
}: {
  label: string
  pendingLabel: string
  pending: boolean
  disabled?: boolean
}) {
  const inactive = pending || disabled
  return (
    <button
      type="submit"
      disabled={inactive}
      className="flex w-full items-center justify-center gap-2"
      style={{
        height: 50,
        marginTop: 4,
        borderRadius: radius.sm,
        border: 'none',
        background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
        color: '#04121f',
        fontSize: fs.bodyLg,
        fontWeight: 700,
        letterSpacing: '0.01em',
        cursor: inactive ? 'not-allowed' : 'pointer',
        opacity: inactive ? 0.75 : 1,
        boxShadow: '0 8px 22px rgba(14,165,233,0.32)',
        transition: 'transform 0.14s, box-shadow 0.18s, filter 0.18s',
      }}
      onMouseEnter={(e) => {
        if (inactive) return
        e.currentTarget.style.transform = 'translateY(-1px)'
        e.currentTarget.style.boxShadow = '0 12px 30px rgba(14,165,233,0.45)'
        e.currentTarget.style.filter = 'brightness(1.04)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = '0 8px 22px rgba(14,165,233,0.32)'
        e.currentTarget.style.filter = ''
      }}
    >
      {pending ? pendingLabel : label}
      {!pending && (
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
      )}
    </button>
  )
}

const DEFAULT_FEATURES = [
  'Reply to every guest in seconds, 24/7',
  'Reservations and waitlists on autopilot',
  'Live in under five minutes',
]

export function AuthBrandPanel({
  eyebrow = 'Always on',
  headline,
  blurb = 'Your AI Concierge answers questions, books tables, and handles special requests around the clock — so your team can focus on the floor.',
  features = DEFAULT_FEATURES,
}: {
  eyebrow?: string
  headline?: ReactNode
  blurb?: string
  features?: string[]
}) {
  return (
    <aside
      className="relative isolate flex flex-col justify-between overflow-hidden"
      style={{ padding: '48px 56px 52px', background: '#050f1c' }}
    >
      {/* fallback gradient */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: -3,
          background:
            'radial-gradient(130% 100% at 25% 18%, #0f476b 0%, #0a3150 34%, #061d31 64%, #03101e 100%)',
        }}
      />
      <AuthBrandVideo />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: -1,
          background:
            'linear-gradient(180deg, rgba(3,14,26,0.55) 0%, rgba(3,14,26,0.30) 38%, rgba(3,14,26,0.78) 100%), linear-gradient(100deg, rgba(3,14,26,0.62) 0%, rgba(3,14,26,0.20) 55%, rgba(3,14,26,0.05) 100%)',
        }}
      />

      <BrandTransitionLink
        href="/"
        className="relative z-10 inline-block"
        ariaLabel="Back to OceanCore home"
      >
        <OceanCoreLogoCompact theme="dark" />
      </BrandTransitionLink>

      <div className="relative z-10" style={{ maxWidth: 460 }}>
        <div
          className="mb-[22px] inline-flex items-center gap-2"
          style={{
            fontSize: fs.caption,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#38bdf8',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: '0 0 12px #38bdf8',
              flexShrink: 0,
            }}
          />
          {eyebrow}
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-playfair), Georgia, serif',
            fontSize: 'clamp(34px, 3vw, 46px)',
            fontWeight: 600,
            lineHeight: 1.08,
            letterSpacing: '-0.015em',
            marginBottom: 20,
            color: '#f2f7fc',
            textShadow: '0 2px 24px rgba(0,0,0,0.6)',
          }}
        >
          {headline ?? (
            <>
              Service that <em style={{ fontStyle: 'italic', color: '#38bdf8' }}>never</em> misses a
              guest.
            </>
          )}
        </h1>
        <p style={{ fontSize: fs.lead, lineHeight: 1.6, color: 'rgba(242,247,252,0.80)', maxWidth: 400 }}>
          {blurb}
        </p>

        <div className="mt-[34px] flex flex-col gap-4">
          {features.map((feat) => (
            <div key={feat} className="flex items-center gap-[13px]">
              <span
                className="grid shrink-0 place-items-center"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: radius.xs,
                  background: 'rgba(56,189,248,0.14)',
                  border: '1px solid rgba(56,189,248,0.28)',
                  color: '#38bdf8',
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span style={{ fontSize: fs.body, fontWeight: 500, color: 'rgba(242,247,252,0.82)' }}>
                {feat}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="relative z-10 flex items-center gap-4"
        style={{ paddingTop: 26, borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className="grid shrink-0 place-items-center"
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.sm,
            background: 'rgba(56,189,248,0.12)',
            border: '1px solid rgba(56,189,248,0.30)',
          }}
        >
          <span
            className="pulse-dot"
            style={{ width: 9, height: 9, borderRadius: '50%', background: '#4ade80' }}
          />
        </div>
        <p style={{ fontSize: fs.small, lineHeight: 1.45, color: 'rgba(242,247,252,0.62)' }}>
          <strong style={{ color: '#f2f7fc', fontWeight: 700 }}>Real people, on call 24/7.</strong>{' '}
          Our team helps you launch and answers whenever you need it.
        </p>
      </div>
    </aside>
  )
}

/** The two-column shell: brand panel, then the form card. */
export function AuthSplitLayout({ children }: { children: ReactNode }) {
  return (
    <div className="split-auth grid min-h-screen" style={{ gridTemplateColumns: '1.05fr 1fr' }}>
      {children}
    </div>
  )
}

/** The right-hand panel a form sits in. */
export function AuthFormPanel({ children }: { children: ReactNode }) {
  return (
    <main
      className="relative flex items-center justify-center"
      style={{
        padding: '48px 40px',
        background:
          'radial-gradient(120% 80% at 90% 0%, rgba(56,189,248,0.06) 0%, transparent 50%), #0a1828',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: '100%', maxWidth: 384 }}
      >
        {children}
      </motion.div>
    </main>
  )
}
