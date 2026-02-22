import React from 'react'
import { ChatStatus } from '../types'

interface Props {
  status: ChatStatus
  compact?: boolean
}

const STATUS_CONFIG: Record<ChatStatus, { dot: string; label: string; text: string }> = {
  idle:             { dot: 'bg-zinc-500',              label: 'Idle',       text: 'text-zinc-400' },
  thinking:         { dot: 'bg-blue-400 animate-pulse', label: 'Thinking…',  text: 'text-blue-400' },
  streaming:        { dot: 'bg-green-400 animate-pulse', label: 'Streaming', text: 'text-green-400' },
  'needs-attention':{ dot: 'bg-accent-green animate-ping', label: 'Your Turn', text: 'text-accent-green' },
  error:            { dot: 'bg-red-500',               label: 'Error',      text: 'text-red-400' },
}

export default function StatusBadge({ status, compact = false }: Props) {
  const cfg = STATUS_CONFIG[status]

  return (
    <div className={`flex items-center gap-1.5 ${cfg.text}`}>
      <span className="relative flex h-2 w-2">
        {status === 'needs-attention' && (
          <span className={`absolute inline-flex h-full w-full rounded-full ${cfg.dot} opacity-75`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${
          status === 'needs-attention' ? 'bg-accent-green' : cfg.dot.split(' ')[0]
        }`} />
      </span>
      {!compact && (
        <span className="text-[11px] font-medium tracking-wide">{cfg.label}</span>
      )}
    </div>
  )
}
