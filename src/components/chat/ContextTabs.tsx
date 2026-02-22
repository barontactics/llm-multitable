import React from 'react'
import { ContextTag } from '../types'

// ─── Color mapping ────────────────────────────────────────────────────────────

const COLOR_CLASSES: Record<ContextTag['color'], string> = {
  green:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  blue:   'bg-blue-500/15 text-blue-400 border-blue-500/30',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  amber:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  pink:   'bg-pink-500/15 text-pink-400 border-pink-500/30',
  cyan:   'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  red:    'bg-red-500/15 text-red-400 border-red-500/30',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  tags: ContextTag[]
  size?: 'sm' | 'md'
  loading?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ContextTabs({ tags, size = 'sm', loading = false }: Props) {
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs'
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2.5 py-1'

  if (loading) {
    return (
      <div className="flex gap-1 flex-wrap">
        {[60, 80, 50].map(w => (
          <div
            key={w}
            className="h-4 rounded-full bg-white/5 animate-pulse"
            style={{ width: w }}
          />
        ))}
      </div>
    )
  }

  if (tags.length === 0) return null

  return (
    <div className="flex gap-1 flex-wrap">
      {tags.map(tag => (
        <span
          key={tag.id}
          className={`
            inline-flex items-center rounded-full border font-medium tracking-wide
            whitespace-nowrap ${textSize} ${padding} ${COLOR_CLASSES[tag.color]}
            animate-fade-in
          `}
        >
          {tag.label}
        </span>
      ))}
    </div>
  )
}
