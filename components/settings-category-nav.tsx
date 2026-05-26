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
}

export const SETTINGS_CATEGORIES: SettingsCategoryDef[] = [
  { id: 'restaurant', title: 'Restaurant', description: 'Name, hours, location' },
  { id: 'reservations', title: 'Reservations', description: 'Capacity, zones, turns' },
  { id: 'ai', title: 'AI Personality', description: 'Voice, tone, guardrails' },
  { id: 'menu', title: 'Menu', description: 'Dishes and pricing' },
  { id: 'integrations', title: 'Integrations', description: 'Channels & POS' },
  { id: 'team', title: 'Team', description: 'Members & access', comingSoon: true },
  { id: 'billing', title: 'Billing', description: 'Plan & invoices' },
  { id: 'security', title: 'Security', description: 'Password & 2FA', comingSoon: true },
]

const navTheme = {
  text: '#0f172a',
  textMuted: '#94a3b8',
  accent: '#38bdf8',
  accentDark: '#0284c7',
  activeBg: '#ffffff',
  activeBorder: 'rgba(56, 189, 248, 0.45)',
  hover: '#f8fafc',
  trackBg: '#f1f5f9',
  trackBorder: 'rgba(15, 23, 42, 0.06)',
  iconBg: '#e2e8f0',
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
                '0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 16px rgba(56, 189, 248, 0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
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
}: {
  activeId: SettingsCategoryId
  onSelect: (id: SettingsCategoryId) => void
  reduceMotion: boolean | null
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
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        {SETTINGS_CATEGORIES.map((category) => (
          <CategoryRow
            key={category.id}
            title={category.title}
            active={activeId === category.id}
            comingSoon={category.comingSoon}
            onClick={() => onSelect(category.id)}
            reduceMotion={reduceMotion}
          />
        ))}
      </motion.nav>
    </LayoutGroup>
  )
}
