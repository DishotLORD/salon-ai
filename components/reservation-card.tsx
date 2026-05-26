'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useState } from 'react'

import { oceanTransition } from '@/lib/ocean-motion'
import { t } from '@/lib/dashboard-theme'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResStatus = 'confirmed' | 'seated' | 'pending' | 'cancelled' | 'no-show'

export type Reservation = {
  id: string
  guestName: string
  partySize: number
  tableNumber: string
  scheduledAt: Date
  status: ResStatus
  specialRequests: string
  customerId?: string | null
  conversationId?: string | null
}

export type ReservationCardProps = {
  reservation: Reservation
  /**
   * panel  — full card with detail rows and inline action buttons (day panel)
   * compact — single row for list/grid views; actions live in a popover menu
   */
  variant?: 'panel' | 'compact'
  /** Dims the card and hides actions for past reservations */
  isPast?: boolean
  onConfirm?: (id: string) => void | Promise<void>
  onCancel?: (id: string) => void | Promise<void>
  onDelete?: (id: string) => void | Promise<void>
  onEdit?: (reservation: Reservation) => void
  onGuestClick?: (customerId: string, guestName: string) => void
}

// ─── Status tokens ────────────────────────────────────────────────────────────

const STATUS: Record<ResStatus, { label: string; color: string; bg: string; border: string }> = {
  pending:   { label: 'Pending',   color: t.warning,      bg: t.warningBg,      border: t.warningBorder },
  confirmed: { label: 'Confirmed', color: t.accent,       bg: t.accentSoftBg,   border: t.accentSoftBorder },
  seated:    { label: 'Seated',    color: t.success,      bg: t.successBg,      border: t.successBorder },
  cancelled: { label: 'Cancelled', color: t.danger,       bg: t.dangerBg,       border: t.dangerBorder },
  'no-show': { label: 'No-show',   color: t.textMuted,    bg: t.bgSurfaceMuted, border: t.border },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeParts(date: Date): { hm: string; period: string } {
  const str = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const match = str.match(/^(.+?)\s*([AP]M)$/i)
  if (match) return { hm: match[1], period: match[2].toUpperCase() }
  return { hm: str, period: '' }
}

// ─── Icons (project icon set: lucide-style, 1.8 stroke) ───────────────────────

function IconPeople() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconTable() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="6" width="20" height="3" rx="1" />
      <path d="M6 9v9M18 9v9M4 18h16" />
    </svg>
  )
}

function IconNotes() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="12" y2="17" />
    </svg>
  )
}

function IconEdit() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function IconDots() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  )
}

// ─── Spinner (framer-motion — no CSS keyframe dependency) ─────────────────────

function Spinner() {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ duration: 0.65, repeat: Infinity, ease: 'linear' }}
      style={{
        width: 11, height: 11, borderRadius: '50%',
        border: '1.8px solid currentColor',
        borderTopColor: 'transparent',
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  )
}

// ─── ActionButton ─────────────────────────────────────────────────────────────

type ActionVariant = 'primary' | 'danger' | 'ghost'

const ACTION_STYLES: Record<ActionVariant, React.CSSProperties> = {
  primary: { background: t.accent, borderColor: t.accent, color: '#0d1f3c' },
  danger:  { background: t.dangerBg, borderColor: t.dangerBorder, color: t.danger },
  ghost:   { background: 'transparent', borderColor: t.border, color: t.text },
}

function ActionButton({
  children,
  onClick,
  loading = false,
  disabled = false,
  variant,
  label,
}: {
  children: React.ReactNode
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  variant: ActionVariant
  label?: string
}) {
  const s = ACTION_STYLES[variant]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-busy={loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 12px', borderRadius: 8,
        border: `1px solid ${s.borderColor as string}`,
        background: s.background as string,
        color: s.color as string,
        fontSize: 12, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !loading ? 0.45 : 1,
        transition: 'opacity 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

// ─── MenuButton (compact popover) ─────────────────────────────────────────────

function MenuButton({
  children,
  onClick,
  color,
}: {
  children: React.ReactNode
  onClick: () => void
  color?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '7px 10px', borderRadius: 7,
        border: 'none', background: 'transparent',
        color: color ?? t.text,
        fontSize: 13, fontWeight: 500,
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = t.bgSurface }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ResStatus }) {
  const sc = STATUS[status]
  return (
    <span
      style={{
        flexShrink: 0,
        padding: '3px 8px', borderRadius: 999,
        background: sc.bg, border: `1px solid ${sc.border}`,
        color: sc.color,
        fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        whiteSpace: 'nowrap',
      }}
    >
      {sc.label}
    </span>
  )
}

// ─── ReservationCard ──────────────────────────────────────────────────────────

export function ReservationCard({
  reservation: r,
  variant = 'panel',
  isPast = false,
  onConfirm,
  onCancel,
  onDelete,
  onEdit,
  onGuestClick,
}: ReservationCardProps) {
  const reduceMotion = useReducedMotion()
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const { hm, period } = formatTimeParts(r.scheduledAt)
  const hasActions = !isPast && (onConfirm ?? onCancel ?? onDelete ?? onEdit)
  const canEdit = onEdit && r.status !== 'cancelled' && r.status !== 'no-show'

  const runAction = async (key: string, fn?: (id: string) => void | Promise<void>) => {
    if (!fn || activeAction) return
    setActiveAction(key)
    try { await fn(r.id) } finally { setActiveAction(null) }
  }

  const baseCard: React.CSSProperties = {
    borderRadius: 14,
    border: `1px solid ${t.border}`,
    background: t.bgSurface,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    opacity: isPast ? 0.5 : 1,
    transition: 'opacity 0.2s',
    position: 'relative',
    overflow: 'visible',
  }

  // ── Compact variant ──────────────────────────────────────────────────────────
  if (variant === 'compact') {
    return (
      <motion.article
        layout
        style={baseCard}
        whileHover={reduceMotion || isPast ? undefined : { background: t.bgSurfaceHover }}
        transition={oceanTransition(reduceMotion, { duration: 0.15 })}
        aria-label={`Reservation: ${r.guestName}, ${hm}${period}`}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: '52px 1fr auto auto auto',
          gap: '0 12px',
          alignItems: 'center',
          padding: '10px 14px',
        }}>
          {/* Time */}
          <span style={{
            fontSize: 13, fontWeight: 700, color: t.text,
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          }}>
            {hm}<span style={{ fontSize: 10, color: t.textMuted, fontWeight: 500, marginLeft: 2 }}>{period}</span>
          </span>

          {/* Name */}
          <span
            onClick={() => r.customerId && onGuestClick?.(r.customerId, r.guestName)}
            style={{
              fontSize: 13, fontWeight: 600, color: t.text,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              cursor: r.customerId && onGuestClick ? 'pointer' : 'default',
              borderBottom: r.customerId && onGuestClick ? `1px dashed ${t.borderStrong}` : 'none',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { if (r.customerId && onGuestClick) (e.currentTarget as HTMLElement).style.color = t.accent }}
            onMouseLeave={(e) => { if (r.customerId && onGuestClick) (e.currentTarget as HTMLElement).style.color = t.text }}
          >
            {r.guestName}
          </span>

          {/* Meta: pax + table */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: t.textMuted, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconPeople /> {r.partySize}
            </span>
            {r.tableNumber !== '—' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconTable /> {r.tableNumber}
              </span>
            )}
          </span>

          {/* Status */}
          <StatusBadge status={r.status} />

          {/* Actions menu */}
          {hasActions ? (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="More actions"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: activeAction ? t.bgSurface : 'transparent',
                  color: t.textMuted, cursor: activeAction ? 'not-allowed' : 'pointer',
                  display: 'grid', placeItems: 'center',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!activeAction) {
                    e.currentTarget.style.background = t.bgSurface
                    e.currentTarget.style.color = t.text
                  }
                }}
                onMouseLeave={(e) => {
                  if (!activeAction) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = t.textMuted
                  }
                }}
              >
                {activeAction ? <Spinner /> : <IconDots />}
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                      onClick={() => setMenuOpen(false)}
                    />
                    <motion.div
                      role="menu"
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50,
                        background: 'var(--t-glass-bg)',
                        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                        border: `1px solid ${t.border}`,
                        borderRadius: 10, padding: 4,
                        minWidth: 140,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      }}
                    >
                      {r.status === 'pending' && (
                        <MenuButton
                          color={t.accent}
                          onClick={() => { setMenuOpen(false); void runAction('confirm', onConfirm) }}
                        >
                          Confirm
                        </MenuButton>
                      )}
                      {canEdit && (
                        <MenuButton onClick={() => { setMenuOpen(false); onEdit!(r) }}>
                          Edit
                        </MenuButton>
                      )}
                      {(r.status === 'pending' || r.status === 'confirmed') && onCancel && (
                        <MenuButton
                          color={t.danger}
                          onClick={() => { setMenuOpen(false); void runAction('cancel', onCancel) }}
                        >
                          Cancel
                        </MenuButton>
                      )}
                      {(r.status === 'cancelled' || r.status === 'no-show') && onDelete && (
                        <MenuButton
                          color={t.danger}
                          onClick={() => { setMenuOpen(false); void runAction('delete', onDelete) }}
                        >
                          Delete
                        </MenuButton>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div style={{ width: 28 }} />
          )}
        </div>
      </motion.article>
    )
  }

  // ── Panel variant ────────────────────────────────────────────────────────────
  return (
    <motion.article
      layout
      style={baseCard}
      whileHover={reduceMotion || isPast ? undefined : { background: t.bgSurfaceHover }}
      transition={oceanTransition(reduceMotion, { duration: 0.15 })}
      aria-label={`Reservation: ${r.guestName}, ${hm}${period}, ${r.status}`}
    >
      <div style={{ padding: '14px 16px' }}>

        {/* ── Header row ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>

          {/* Time block */}
          <div style={{ flexShrink: 0, minWidth: 46, paddingTop: 1 }}>
            <div style={{
              fontSize: 17, fontWeight: 700, color: t.text,
              fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              letterSpacing: '-0.01em',
            }}>
              {hm}
            </div>
            {period && (
              <div style={{
                fontSize: 10, fontWeight: 600, color: t.textMuted,
                letterSpacing: '0.06em', marginTop: 3,
              }}>
                {period}
              </div>
            )}
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              onClick={() => r.customerId && onGuestClick?.(r.customerId, r.guestName)}
              style={{
                fontSize: 14, fontWeight: 700, color: t.text, lineHeight: 1.2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                cursor: r.customerId && onGuestClick ? 'pointer' : 'default',
                display: 'inline-block', maxWidth: '100%',
                borderBottom: r.customerId && onGuestClick ? `1px dashed ${t.borderStrong}` : 'none',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { if (r.customerId && onGuestClick) (e.currentTarget as HTMLElement).style.color = t.accent }}
              onMouseLeave={(e) => { if (r.customerId && onGuestClick) (e.currentTarget as HTMLElement).style.color = t.text }}
            >
              {r.guestName}
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px',
              marginTop: 5, color: t.textMuted, fontSize: 12,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconPeople />
                {r.partySize} {r.partySize === 1 ? 'guest' : 'guests'}
              </span>
              {r.tableNumber !== '—' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <IconTable />
                  Table {r.tableNumber}
                </span>
              )}
            </div>

            {r.specialRequests && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 7,
                color: t.textMuted, fontSize: 11, lineHeight: 1.45,
              }}>
                <span style={{ marginTop: 1, flexShrink: 0, opacity: 0.7 }}>
                  <IconNotes />
                </span>
                <span style={{ fontStyle: 'italic' }}>{r.specialRequests}</span>
              </div>
            )}
          </div>

          {/* Status badge */}
          <StatusBadge status={r.status} />
        </div>

        {/* ── Action row ── */}
        {hasActions && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 12, paddingTop: 12,
            borderTop: `1px solid ${t.borderSoft}`,
          }}>
            {r.status === 'pending' && (
              <>
                <ActionButton
                  variant="primary"
                  onClick={() => void runAction('confirm', onConfirm)}
                  loading={activeAction === 'confirm'}
                  disabled={!!activeAction}
                  label={`Confirm booking for ${r.guestName}`}
                >
                  Confirm
                </ActionButton>
                <ActionButton
                  variant="danger"
                  onClick={() => void runAction('cancel', onCancel)}
                  loading={activeAction === 'cancel'}
                  disabled={!!activeAction}
                  label={`Cancel booking for ${r.guestName}`}
                >
                  Cancel
                </ActionButton>
              </>
            )}

            {r.status === 'confirmed' && onCancel && (
              <ActionButton
                variant="danger"
                onClick={() => void runAction('cancel', onCancel)}
                loading={activeAction === 'cancel'}
                disabled={!!activeAction}
                label={`Cancel booking for ${r.guestName}`}
              >
                Cancel
              </ActionButton>
            )}

            {(r.status === 'cancelled' || r.status === 'no-show') && onDelete && (
              <ActionButton
                variant="danger"
                onClick={() => void runAction('delete', onDelete)}
                loading={activeAction === 'delete'}
                disabled={!!activeAction}
                label={`Delete booking for ${r.guestName}`}
              >
                Delete
              </ActionButton>
            )}

            <div style={{ flex: 1 }} />

            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit!(r)}
                disabled={!!activeAction}
                aria-label={`Edit booking for ${r.guestName}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '6px 10px', borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: 'transparent',
                  color: t.textMuted, fontSize: 12, fontWeight: 500,
                  cursor: activeAction ? 'not-allowed' : 'pointer',
                  opacity: activeAction ? 0.45 : 1,
                  transition: 'background 0.15s, color 0.15s, opacity 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!activeAction) {
                    e.currentTarget.style.background = t.bgSurface
                    e.currentTarget.style.color = t.text
                    e.currentTarget.style.borderColor = t.borderSoft
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = t.textMuted
                  e.currentTarget.style.borderColor = t.border
                }}
              >
                <IconEdit />
                Edit
              </button>
            )}
          </div>
        )}
      </div>
    </motion.article>
  )
}
