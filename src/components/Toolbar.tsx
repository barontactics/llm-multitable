import React, { useEffect } from 'react'
import { useChatStore } from '../store/chatStore'
import { GRID_CONFIGS, GridLayout } from '../types'

// ─── Layout icon ──────────────────────────────────────────────────────────────

function GridIcon({ cols, rows }: { cols: number; rows: number }) {
  const cells = Array.from({ length: cols * rows })
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      {cells.map((_, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const w = 16 / cols - 1
        const h = 16 / rows - 1
        const x = 2 + col * (16 / cols) + 0.5
        const y = 2 + row * (16 / rows) + 0.5
        return <rect key={i} x={x} y={y} width={w} height={h} rx="0.5" opacity="0.8" />
      })}
    </svg>
  )
}

// ─── Attention counter badge ──────────────────────────────────────────────────

function AttentionBadge({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) return null
  return (
    <button
      onClick={onClick}
      title="Jump to next table needing attention (Tab)"
      className="
        relative flex items-center gap-2 px-3 py-1.5 rounded-lg
        bg-accent-green/15 border border-accent-green/30 text-accent-green
        hover:bg-accent-green/25 transition-all duration-150 animate-pulse-slow
      "
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75 animate-ping" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green" />
      </span>
      <span className="text-xs font-bold tracking-wide">
        {count} need{count !== 1 ? 's' : ''} attention
      </span>
      <span className="text-[10px] text-accent-green/60">▶ Tab</span>
    </button>
  )
}

// ─── Main toolbar ─────────────────────────────────────────────────────────────

export default function Toolbar() {
  const sessions = useChatStore(s => s.sessions)
  const gridLayout = useChatStore(s => s.gridLayout)
  const addSession = useChatStore(s => s.addSession)
  const setGridLayout = useChatStore(s => s.setGridLayout)
  const attentionCount = useChatStore(s => s.attentionCount())
  const focusNextAttention = useChatStore(s => s.focusNextAttention)

  // Tab key cycles through attention tables
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !e.shiftKey && attentionCount > 0) {
        // Only intercept Tab when not inside an input/textarea
        const tag = (e.target as HTMLElement).tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault()
          focusNextAttention()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [attentionCount, focusNextAttention])

  const layouts: GridLayout[] = ['1', '2', '4', '6', '9', '12']

  return (
    <header className="flex items-center gap-4 px-5 py-3 bg-surface-1 border-b border-white/6 flex-shrink-0">
      {/* Logo / brand */}
      <div className="flex items-center gap-2.5 mr-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-green/30 to-blue-500/30 border border-white/10 flex items-center justify-center text-sm">
          🃏
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight leading-none">
            LLM MultiTable
          </h1>
          <p className="text-[9px] text-zinc-600 tracking-wider uppercase mt-0.5">
            {sessions.length} table{sessions.length !== 1 ? 's' : ''} open
          </p>
        </div>
      </div>

      {/* Attention badge */}
      <AttentionBadge count={attentionCount} onClick={focusNextAttention} />

      <div className="flex-1" />

      {/* Layout switcher */}
      <div className="flex items-center gap-1 bg-surface-0 rounded-lg p-1 border border-white/5">
        {layouts.map(layout => {
          const cfg = GRID_CONFIGS[layout]
          const isActive = layout === gridLayout
          return (
            <button
              key={layout}
              onClick={() => setGridLayout(layout)}
              title={`${cfg.label} layout`}
              className={`
                p-1.5 rounded-md transition-all duration-150
                ${isActive
                  ? 'bg-white/15 text-white'
                  : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5'
                }
              `}
            >
              <GridIcon cols={cfg.cols} rows={cfg.rows} />
            </button>
          )
        })}
      </div>

      {/* Add table button */}
      <button
        onClick={addSession}
        className="
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg
          bg-white/5 border border-white/10 text-zinc-300
          hover:bg-white/10 hover:border-white/20 hover:text-white
          transition-all duration-150 text-xs font-medium
        "
      >
        <span className="text-base leading-none">+</span>
        New Table
      </button>
    </header>
  )
}
