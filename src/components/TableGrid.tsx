import React, { useState } from 'react'
import { useChatStore } from '../store/chatStore'
import { GRID_CONFIGS, GridLayout } from '../types'
import ChatTable from './chat/ChatTable'
import ChatModal from './chat/ChatModal'

// ─── Empty slot placeholder ───────────────────────────────────────────────────

function EmptySlot({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      onClick={onAdd}
      className="
        flex flex-col items-center justify-center gap-2
        rounded-xl border-2 border-dashed border-white/8 cursor-pointer
        hover:border-white/20 hover:bg-white/[0.02] transition-all duration-200
        text-zinc-700 hover:text-zinc-500
      "
    >
      <span className="text-2xl">+</span>
      <span className="text-xs font-medium">New Chat</span>
    </div>
  )
}

// ─── Main grid ────────────────────────────────────────────────────────────────

export default function TableGrid() {
  const sessions = useChatStore(s => s.sessions)
  const focusedId = useChatStore(s => s.focusedId)
  const gridLayout = useChatStore(s => s.gridLayout)
  const addSession = useChatStore(s => s.addSession)
  const focusSession = useChatStore(s => s.focusSession)

  const config = GRID_CONFIGS[gridLayout]
  const totalSlots = config.cols * config.rows

  const focusedSession = focusedId ? sessions.find(s => s.id === focusedId) : null

  const handleOpenModal = (id: string) => {
    focusSession(id)
  }

  const handleCloseModal = () => {
    focusSession(null)
  }

  // Build slot items: sessions first, then empty slots up to totalSlots
  const slots = Array.from({ length: totalSlots }, (_, i) => sessions[i] ?? null)

  return (
    <>
      {/* Grid */}
      <div
        className="flex-1 p-4 min-h-0"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
          gridTemplateRows: `repeat(${config.rows}, 1fr)`,
          gap: '12px',
        }}
      >
        {slots.map((session, i) =>
          session ? (
            <ChatTable
              key={session.id}
              session={session}
              onClick={() => handleOpenModal(session.id)}
            />
          ) : (
            <EmptySlot key={`empty-${i}`} onAdd={addSession} />
          ),
        )}
      </div>

      {/* Focused chat modal */}
      {focusedSession && (
        <ChatModal session={focusedSession} onClose={handleCloseModal} />
      )}
    </>
  )
}
