import React, { useCallback } from 'react'
import { ChatSession } from '../../types'
import { truncate } from '../../lib/truncate'
import ContextTabs from './ContextTabs'
import StatusBadge from './StatusBadge'
import { useChatStore } from '../../store/chatStore'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  session: ChatSession
  onClick: () => void
}

// ─── Attention glow overlay ───────────────────────────────────────────────────

function AttentionRing() {
  return (
    <>
      {/* Pulsing border */}
      <div className="absolute inset-0 rounded-xl pointer-events-none animate-pulse-attention" />
      {/* Corner indicators */}
      <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent-green animate-ping" />
      {/* Sweep gradient */}
      <div className="absolute inset-0 rounded-xl pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent-green/5 to-transparent animate-pulse-slow" />
      </div>
    </>
  )
}

// ─── Mini message list ────────────────────────────────────────────────────────

function MiniMessages({ session }: { session: ChatSession }) {
  const visibleMessages = session.messages.slice(-4)
  const hasStreaming = session.streamingContent.length > 0

  if (visibleMessages.length === 0 && !hasStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-600 text-xs font-medium">Start a conversation…</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col gap-1.5 overflow-hidden min-h-0">
      {visibleMessages.map((msg) => (
        <div
          key={msg.id}
          className={`flex gap-1.5 items-start ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
        >
          {/* Avatar dot */}
          <div className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${
            msg.role === 'user' ? 'bg-blue-400' : 'bg-emerald-400'
          }`} />
          <p className={`text-[10px] leading-relaxed line-clamp-2 ${
            msg.role === 'user' ? 'text-blue-200/70 text-right' : 'text-zinc-300/70'
          }`}>
            {truncate(msg.content, 100)}
          </p>
        </div>
      ))}

      {/* Live streaming text */}
      {hasStreaming && (
        <div className="flex gap-1.5 items-start">
          <div className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 bg-emerald-400 animate-pulse" />
          <p className="text-[10px] leading-relaxed line-clamp-2 text-zinc-300/70">
            {truncate(session.streamingContent, 100)}
            <span className="inline-block w-1 h-2.5 bg-emerald-400 ml-0.5 animate-pulse" />
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main card ────────────────────────────────────────────────────────────────

export default function ChatTable({ session, onClick }: Props) {
  const removeSession = useChatStore(s => s.removeSession)
  const isAttention = session.status === 'needs-attention'
  const isActive = session.status === 'streaming' || session.status === 'thinking'

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    removeSession(session.id)
  }, [removeSession, session.id])

  return (
    <div
      onClick={onClick}
      className={`
        relative flex flex-col rounded-xl cursor-pointer
        bg-surface-2 border transition-all duration-200 select-none
        animate-bounce-in overflow-hidden
        ${isAttention
          ? 'border-accent-green/60 shadow-attention'
          : isActive
            ? 'border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
            : 'border-white/5 hover:border-white/10 shadow-table hover:shadow-[0_8px_32px_rgba(0,0,0,0.6)]'
        }
      `}
      style={{ minHeight: 0 }}
    >
      {/* Attention glow rings */}
      {isAttention && <AttentionRing />}

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Attention badge */}
          {isAttention && (
            <span className="flex-shrink-0 text-[9px] font-bold tracking-widest uppercase text-black bg-accent-green px-1.5 py-0.5 rounded animate-pulse">
              ▶ YOUR TURN
            </span>
          )}
          <h3 className="text-xs font-semibold text-zinc-200 truncate">
            {session.title}
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={session.status} compact />
          <button
            onClick={handleClose}
            className="text-zinc-600 hover:text-zinc-300 transition-colors text-sm leading-none"
            title="Close table"
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Messages area ── */}
      <div className="flex-1 flex flex-col gap-2 px-3 py-2.5 min-h-0 overflow-hidden">
        <MiniMessages session={session} />
      </div>

      {/* ── Footer ── */}
      <div className="px-3 pb-2.5 flex-shrink-0 space-y-2">
        {/* Last user prompt */}
        {session.lastUserPrompt && (
          <div className={`rounded-lg px-2.5 py-1.5 ${
            isAttention ? 'bg-accent-green/5 border border-accent-green/20' : 'bg-white/3 border border-white/5'
          }`}>
            <p className="text-[10px] text-zinc-400 mb-0.5 uppercase tracking-wider font-medium">
              Last prompt
            </p>
            <p className={`text-[11px] leading-snug font-mono ${
              isAttention ? 'text-accent-green/80' : 'text-zinc-300'
            }`}>
              {truncate(session.lastUserPrompt, 80)}
            </p>
          </div>
        )}

        {/* Context tags */}
        {session.contextTags.length > 0 && (
          <ContextTabs tags={session.contextTags} size="sm" />
        )}

        {/* Model chip */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-wider">
            claude
          </span>
          <span className="text-[9px] text-zinc-700">
            {session.messages.length} msg{session.messages.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Clickable overlay hint */}
      <div className={`absolute inset-0 rounded-xl bg-white/0 hover:bg-white/[0.02] transition-colors pointer-events-none`} />
    </div>
  )
}
