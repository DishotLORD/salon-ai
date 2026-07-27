'use client'

import { LayoutGroup, motion } from 'framer-motion'
import { useState } from 'react'

import {
  SETTINGS_CATEGORIES,
  settingsIndexFont,
  settingsIndexLabel,
  type SettingsCategoryId,
} from '@/components/settings-category-nav'

const navTheme = {
  textMuted: 'var(--bk-muted)',
  accent: '#38bdf8',
  accentDark: '#0284c7',
  hover: 'var(--bk-surface)',
  border: 'var(--bk-border)',
  iconBg: 'var(--bk-surface-2)',
  font: 'var(--font-plus-jakarta, system-ui, sans-serif)',
} as const

function TabButton({
  index,
  title,
  active,
  comingSoon,
  onClick,
  reduceMotion,
}: {
  index: number
  title: string
  active: boolean
  comingSoon?: boolean
  onClick: () => void
  reduceMotion: boolean | null
}) {
  const [hovered, setHovered] = useState(false)
  const dimmed = comingSoon && !active

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        flexShrink: 0,
        padding: '11px 14px 12px',
        border: 'none',
        background: !active && hovered ? navTheme.hover : 'transparent',
        borderRadius: '8px 8px 0 0',
        cursor: 'pointer',
        fontFamily: navTheme.font,
        fontSize: 13.5,
        fontWeight: active ? 700 : 500,
        color: active ? navTheme.accentDark : navTheme.textMuted,
        opacity: dimmed ? 0.55 : 1,
        letterSpacing: active ? '0.01em' : 0,
        whiteSpace: 'nowrap',
        transition: 'color 0.18s, background 0.18s',
      }}
    >
      <span
        aria-hidden
        style={{
          fontFamily: settingsIndexFont,
          fontSize: 12,
          fontWeight: 500,
          fontFeatureSettings: '"tnum" 1, "lnum" 1',
          lineHeight: 1,
          color: active ? navTheme.accentDark : navTheme.textMuted,
          opacity: active ? 0.9 : 0.5,
          transition: 'color 0.18s, opacity 0.18s',
        }}
      >
        {settingsIndexLabel(index)}
      </span>
      {title}

      {comingSoon ? (
        <span
          style={{
            flexShrink: 0,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: 999,
            background: navTheme.iconBg,
            color: navTheme.textMuted,
          }}
        >
          Soon
        </span>
      ) : null}

      {active ? (
        <motion.span
          layoutId="settingsTabUnderline"
          transition={reduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 420, damping: 34 }}
          aria-hidden
          style={{
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: -1,
            height: 2.5,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${navTheme.accent} 0%, ${navTheme.accentDark} 100%)`,
            boxShadow: '0 0 10px rgba(56, 189, 248, 0.5)',
          }}
        />
      ) : null}
    </button>
  )
}

export function SettingsTabNav({
  activeId,
  onSelect,
  reduceMotion,
}: {
  activeId: SettingsCategoryId
  onSelect: (id: SettingsCategoryId) => void
  reduceMotion: boolean | null
}) {
  return (
    <LayoutGroup id="settings-tab-nav">
      <nav
        role="tablist"
        aria-label="Settings categories"
        style={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          borderBottom: `1px solid ${navTheme.border}`,
          scrollbarWidth: 'none',
        }}
      >
        {SETTINGS_CATEGORIES.map((category, index) => (
          <TabButton
            key={category.id}
            index={index}
            title={category.title}
            active={activeId === category.id}
            comingSoon={category.comingSoon}
            onClick={() => onSelect(category.id)}
            reduceMotion={reduceMotion}
          />
        ))}
      </nav>
    </LayoutGroup>
  )
}
