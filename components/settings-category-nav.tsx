'use client'

import { LayoutGroup, motion } from 'framer-motion'
import { useState } from 'react'

import {
  oceanTransition,
  settingsNavItem,
  settingsNavPillSpring,
  settingsNavStagger,
} from '@/lib/ocean-motion'

export type SettingsCategoryId =
  | 'restaurant'
  | 'reservations'
  | 'ai'
  | 'menu'
  | 'integrations'
  | 'team'
  | 'billing'
  | 'security'

export type SettingsCategoryDef = {
  id: SettingsCategoryId
  title: string
  description: string
  comingSoon?: boolean
  subItems?: { id: string; title: string }[]
}

export const SETTINGS_CATEGORIES: SettingsCategoryDef[] = [
  { id: 'restaurant', title: 'Restaurant', description: 'Name, hours, location' },
  {
    id: 'reservations',
    title: 'Reservations',
    description: 'Capacity, zones, turns',
    subItems: [
      { id: 'dining', title: 'Dining Zones' },
      { id: 'activities', title: 'Activities' },
    ],
  },
  { id: 'ai', title: 'AI Personality', description: 'Voice, tone, guardrails' },
  { id: 'menu', title: 'Menu', description: 'Dishes and pricing' },
  { id: 'integrations', title: 'Integrations', description: 'Channels & POS' },
  { id: 'team', title: 'Team', description: 'Members & access', comingSoon: true },
  { id: 'billing', title: 'Billing', description: 'Plan & invoices' },
  { id: 'security', title: 'Security', description: 'Password & 2FA', comingSoon: true },
]

const navTheme = {
  text: 'var(--bk-head)',
  textMuted: 'var(--bk-muted)',
  accent: '#38bdf8',
  accentDark: '#0284c7',
  activeBg: 'var(--bk-toggle-active)',
  activeBorder: 'rgba(56, 189, 248, 0.45)',
  hover: 'var(--bk-surface)',
  trackBg: 'var(--bk-surface)',
  trackBorder: 'rgba(15, 23, 42, 0.06)',
  iconBg: 'var(--bk-surface-2)',
  font: 'var(--font-plus-jakarta, system-ui, sans-serif)',
} as const

function CategoryRow({
  title,
  active,
  comingSoon,
  onClick,
  reduceMotion,
}: {
  title: string
  active: boolean
  comingSoon?: boolean
  onClick: () => void
  reduceMotion: boolean | null
}) {
  const [hovered, setHovered] = useState(false)
  const dimmed = comingSoon && !active

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      variants={settingsNavItem}
      whileHover={reduceMotion || active ? undefined : { x: 3 }}
      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        minHeight: 44,
        textAlign: 'left',
        padding: active ? '10px 14px 10px 16px' : '10px 14px',
        borderRadius: 10,
        border: '1px solid transparent',
        background: 'transparent',
        cursor: 'pointer',
        fontFamily: navTheme.font,
        opacity: dimmed ? 0.5 : 1,
        overflow: 'hidden',
      }}
    >
      {active ? (
        <>
          <motion.div
            layoutId="settingsNavPill"
            transition={reduceMotion ? { duration: 0.01 } : settingsNavPillSpring}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 10,
              background: navTheme.activeBg,
              border: `1px solid ${navTheme.activeBorder}`,
              boxShadow:
                '0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 16px rgba(56, 189, 248, 0.18), inset 0 1px 0 var(--t-glass-highlight)',
              pointerEvents: 'none',
            }}
          />
          <motion.div
            layoutId="settingsNavAccent"
            transition={reduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 420, damping: 26 }}
            style={{
              position: 'absolute',
              left: 0,
              top: '18%',
              bottom: '18%',
              width: 5,
              borderRadius: 999,
              background: `linear-gradient(180deg, ${navTheme.accent} 0%, ${navTheme.accentDark} 100%)`,
              boxShadow: '0 0 12px rgba(56, 189, 248, 0.55)',
              pointerEvents: 'none',
            }}
          />
        </>
      ) : null}

      {!active && hovered && !reduceMotion ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 12,
            background: navTheme.hover,
            pointerEvents: 'none',
          }}
        />
      ) : null}

      <span style={{ position: 'relative', minWidth: 0, flex: 1, zIndex: 1 }}>
        <motion.span
          animate={{ scale: active && !reduceMotion ? 1.02 : 1 }}
          transition={oceanTransition(reduceMotion, { duration: 0.2 })}
          style={{
            display: 'block',
            fontSize: active ? 14 : 13,
            fontWeight: active ? 700 : 500,
            color: active ? navTheme.accentDark : navTheme.textMuted,
            lineHeight: 1.35,
            letterSpacing: active ? '0.01em' : 0,
          }}
        >
          {title}
        </motion.span>
      </span>

      {comingSoon ? (
        <motion.span
          animate={reduceMotion ? undefined : { opacity: [0.65, 1, 0.65] }}
          transition={reduceMotion ? undefined : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'relative',
            zIndex: 1,
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '3px 8px',
            borderRadius: 999,
            background: navTheme.iconBg,
            color: navTheme.textMuted,
          }}
        >
          Soon
        </motion.span>
      ) : null}
    </motion.button>
  )
}

export function SettingsCategoryNav({
  activeId,
  onSelect,
  reduceMotion,
  activeSubId,
  onSelectSub,
}: {
  activeId: SettingsCategoryId
  onSelect: (id: SettingsCategoryId) => void
  reduceMotion: boolean | null
  activeSubId?: string
  onSelectSub?: (id: string) => void
}) {
  return (
    <LayoutGroup id="settings-category-nav">
      <motion.nav
        variants={reduceMotion ? undefined : settingsNavStagger}
        initial={reduceMotion ? false : 'hidden'}
        animate={reduceMotion ? undefined : 'visible'}
        style={{
          display: 'grid',
          gap: 5,
          padding: 6,
          borderRadius: 14,
          background: navTheme.trackBg,
          border: `1px solid ${navTheme.trackBorder}`,
          boxShadow: 'inset 0 1px 0 var(--t-glass-highlight)',
        }}
      >
        {SETTINGS_CATEGORIES.map((category) => {
          const isActive = activeId === category.id
          const hasSubItems = isActive && category.subItems && category.subItems.length > 0
          return (
            <div key={category.id}>
              <CategoryRow
                title={category.title}
                active={isActive}
                comingSoon={category.comingSoon}
                onClick={() => onSelect(category.id)}
                reduceMotion={reduceMotion}
              />
              {hasSubItems && (
                <div style={{ paddingLeft: 18, paddingTop: 2, paddingBottom: 4, display: 'grid', gap: 1, position: 'relative' }}>
                  {/* vertical connector line */}
                  <div style={{ position: 'absolute', left: 24, top: 0, bottom: 8, width: 1.5, background: 'rgba(56,189,248,0.25)', borderRadius: 999 }} />
                  {category.subItems!.map((sub) => {
                    const subActive = activeSubId === sub.id
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => onSelectSub?.(sub.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          padding: '7px 10px 7px 20px',
                          border: 'none',
                          borderRadius: 8,
                          background: subActive ? 'rgba(56,189,248,0.1)' : 'transparent',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: navTheme.font,
                          transition: 'background 0.15s',
                        }}
                      >
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: subActive ? navTheme.accentDark : 'rgba(15,23,42,0.2)', flexShrink: 0, transition: 'background 0.15s' }} />
                        <span style={{ fontSize: 12, fontWeight: subActive ? 600 : 500, color: subActive ? navTheme.accentDark : navTheme.textMuted, transition: 'color 0.15s' }}>
                          {sub.title}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </motion.nav>
    </LayoutGroup>
  )
}
