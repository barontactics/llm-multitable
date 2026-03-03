import React, { useEffect, useRef, useState } from 'react'
import { ChatSession } from '../../types'
import { useChatStore } from '../../store/chatStore'
import ContextTabs from './ContextTabs'
import StatusBadge from './StatusBadge'
import { LocalFileBrowser, GDriveFileBrowser } from '../storage/FileBrowsers'

// ─── Message bubble ───────────────────────────────────────────────────────────

// Helper to render content with clickable links
function renderContentWithLinks(content: string) {
  // Strip out <file_content> tags and their contents (internal for agent only)
  const cleanedContent = content.replace(/<file_content>[\s\S]*?<\/file_content>/g, '')

  // Match URLs (http://, https://, file://)
  const urlRegex = /(https?:\/\/[^\s]+|file:\/\/[^\s]+)/g
  const parts = cleanedContent.split(urlRegex)

  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline break-all"
        >
          {part}
        </a>
      )
    }
    return part
  })
}

function MessageBubble({ role, content, isStreaming = false }: {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}) {
  const isUser = role === 'user'
  return (
    <div className={`flex gap-3 items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`
        w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold
        ${isUser ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}
      `}>
        {isUser ? 'U' : 'AI'}
      </div>

      {/* Bubble */}
      <div className={`
        max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed
        ${isUser
          ? 'bg-blue-500/15 border border-blue-500/20 text-blue-50 rounded-tr-sm'
          : 'bg-white/5 border border-white/8 text-zinc-200 rounded-tl-sm'
        }
      `}>
        <pre className="whitespace-pre-wrap font-sans break-words">
          {renderContentWithLinks(content)}
        </pre>
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-emerald-400 ml-1 animate-pulse rounded-sm" />
        )}
      </div>
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  session: ChatSession
  onClose: () => void
}

export default function ChatModal({ session, onClose }: Props) {
  const [input, setInput] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(session.title)
  const [activeBrowser, setActiveBrowser] = useState<'local' | 'gdrive' | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const sendMessage = useChatStore(s => s.sendMessage)
  const renameSession = useChatStore(s => s.renameSession)
  const toggleTools = useChatStore(s => s.toggleTools)
  const toggleLocalMode = useChatStore(s => s.toggleLocalMode)
  const _setStatus = useChatStore(s => s._setStatus)

  const isBusy = session.status === 'thinking' || session.status === 'streaming'

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages.length, session.streamingContent])

  // Auto-focus input when modal opens
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  // Dismiss attention when user opens modal
  useEffect(() => {
    if (session.status === 'needs-attention') {
      // Keep needs-attention until user actually sends a reply
      // Just focus the input
      inputRef.current?.focus()
    }
  }, [session.status])

  const handleSend = () => {
    const content = input.trim()
    if (!content || isBusy) return
    sendMessage(session.id, content)
    setInput('')
    // Reset attention state
    _setStatus(session.id, 'thinking')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTitleSave = () => {
    if (titleDraft.trim()) renameSession(session.id, titleDraft.trim())
    setIsEditingTitle(false)
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleFileSelect = (path: string) => {
    setActiveBrowser(null)
    if (!isBusy) {
      sendMessage(session.id, `Analyze ${path}`)
    }
  }

  const isAttention = session.status === 'needs-attention'

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Modal panel */}
      <div className={`
        relative flex ${activeBrowser ? 'flex-row' : 'flex-col'} w-full ${activeBrowser ? 'max-w-6xl' : 'max-w-3xl'} h-[88vh] mx-4
        rounded-2xl border shadow-modal animate-slide-up
        bg-surface-1
        ${isAttention ? 'border-accent-green/50' : 'border-white/10'}
      `}>

        {/* File Browser Sidebar */}
        {activeBrowser && session.useTools && (
          <div className="w-80 border-r border-white/10 flex flex-col">
            {activeBrowser === 'local' ? (
              <LocalFileBrowser
                onSelectFile={handleFileSelect}
                onClose={() => setActiveBrowser(null)}
              />
            ) : (
              <GDriveFileBrowser
                onSelectFile={handleFileSelect}
                onClose={() => setActiveBrowser(null)}
              />
            )}
          </div>
        )}

        {/* Main chat area */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">

        {/* ── Header ── */}
        <div className={`
          flex items-center gap-3 px-5 py-4 border-b flex-shrink-0
          ${isAttention ? 'border-accent-green/20 bg-accent-green/3' : 'border-white/8'}
        `}>
          {/* Title */}
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') setIsEditingTitle(false) }}
                className="bg-white/10 border border-white/20 rounded-lg px-3 py-1 text-sm text-white w-full outline-none"
              />
            ) : (
              <button
                onClick={() => { setTitleDraft(session.title); setIsEditingTitle(true) }}
                className="text-base font-semibold text-white hover:text-zinc-300 transition-colors text-left truncate max-w-full"
              >
                {session.title}
              </button>
            )}
          </div>

          {/* Status + attention */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {isAttention && (
              <span className="text-xs font-bold tracking-wider uppercase text-black bg-accent-green px-2.5 py-1 rounded-full animate-pulse">
                ▶ YOUR TURN
              </span>
            )}
            <StatusBadge status={session.status} />

            {/* Tools toggle */}
            <button
              onClick={() => toggleTools(session.id)}
              className={`
                text-[10px] font-semibold tracking-widest uppercase px-2 py-1 rounded-lg transition-all
                ${session.useTools
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-white/5 text-zinc-500 border border-white/8 hover:bg-white/10'
                }
              `}
              title={session.useTools ? 'MCP Tools Enabled' : 'Enable MCP Tools'}
            >
              🔧 {session.useTools ? 'ON' : 'OFF'}
            </button>

            {/* Local mode toggle */}
            <button
              onClick={() => toggleLocalMode(session.id)}
              className={`
                text-[10px] font-semibold tracking-widest uppercase px-2 py-1 rounded-lg transition-all
                ${session.useLocalMode
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/40 hover:bg-purple-500/30'
                  : 'bg-white/5 text-zinc-500 border border-white/8 hover:bg-white/10'
                }
              `}
              title={session.useLocalMode ? 'Local Claude Code (Subscription)' : 'Use Local Claude Code'}
            >
              💻 {session.useLocalMode ? 'LOCAL' : 'API'}
            </button>

            {/* Claude badge */}
            <span className="text-[10px] font-semibold tracking-widest uppercase text-zinc-500 bg-white/5 border border-white/8 px-2 py-1 rounded-lg">
              Claude
            </span>
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors text-xl leading-none ml-1"
          >
            ×
          </button>
        </div>

        {/* ── Context tags ── */}
        {session.contextTags.length > 0 && (
          <div className="px-5 py-2.5 border-b border-white/5 flex-shrink-0">
            <ContextTabs tags={session.contextTags} size="md" />
          </div>
        )}

        {/* ── File attachments ── */}
        {session.fileAttachments && session.fileAttachments.length > 0 && (
          <div className="px-5 py-2.5 border-b border-purple-500/10 bg-purple-500/5 flex-shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-purple-400">📎 Files in Context:</span>
              {session.fileAttachments.map(file => (
                <div key={file.id} className="flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/30 rounded-lg px-2 py-1">
                  <button
                    onClick={() => {
                      if (!isBusy) {
                        sendMessage(session.id, `Analyze ${file.path}`)
                      }
                    }}
                    className="text-xs text-purple-300 font-medium truncate max-w-[200px] hover:text-purple-100 transition-colors cursor-pointer"
                    title="Ask agent to analyze this file"
                  >
                    {file.name}
                  </button>
                  {file.viewLink && (
                    <a
                      href={file.viewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 transition-colors flex-shrink-0"
                      title="Open file in browser"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tools info ── */}
        {session.useTools && (
          <div className="px-5 py-2.5 border-b border-emerald-500/10 bg-emerald-500/5 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <span>🔧</span>
                <span>MCP Connectors</span>
              </div>

              {/* File browser buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveBrowser(activeBrowser === 'local' ? null : 'local')}
                  className={`px-3 py-1.5 rounded-lg transition-all text-sm font-medium ${
                    activeBrowser === 'local'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 hover:text-emerald-400'
                  }`}
                  title="Browse local files"
                >
                  📁 Local
                </button>
                <button
                  onClick={() => setActiveBrowser(activeBrowser === 'gdrive' ? null : 'gdrive')}
                  className={`px-3 py-1.5 rounded-lg transition-all text-sm font-medium ${
                    activeBrowser === 'gdrive'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 hover:text-emerald-400'
                  }`}
                  title="Browse Google Drive"
                >
                  ☁️ Drive
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 min-h-0">
          {session.messages.length === 0 && !session.streamingContent ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-600">
              <div className="text-5xl">💬</div>
              <p className="text-sm font-medium">Start the conversation</p>
              <p className="text-xs">Type a message below to begin</p>
            </div>
          ) : (
            <>
              {session.messages.map(msg => (
                <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
              ))}
              {session.streamingContent && (
                <MessageBubble role="assistant" content={session.streamingContent} isStreaming />
              )}
              {session.status === 'thinking' && !session.streamingContent && (
                <div className="flex gap-3 items-center">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-400">
                    AI
                  </div>
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full bg-emerald-400/50 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {session.error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  Error: {session.error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* ── Input area ── */}
        <div className={`
          border-t px-4 py-4 flex-shrink-0
          ${isAttention ? 'border-accent-green/20' : 'border-white/8'}
        `}>
          <div className={`
            flex gap-3 items-end rounded-xl border px-4 py-3 transition-all duration-200
            ${isAttention
              ? 'bg-accent-green/5 border-accent-green/30 focus-within:border-accent-green/60'
              : 'bg-white/5 border-white/10 focus-within:border-white/20'
            }
          `}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isBusy}
              placeholder={isBusy ? 'Waiting for response…' : isAttention ? 'AI responded — type your reply…' : 'Message (Enter to send, Shift+Enter for newline)'}
              rows={1}
              className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 resize-none outline-none min-h-[24px] max-h-40 leading-relaxed"
              style={{ height: 'auto' }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 160) + 'px'
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isBusy}
              className={`
                flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150
                ${input.trim() && !isBusy
                  ? isAttention
                    ? 'bg-accent-green text-black hover:bg-emerald-300'
                    : 'bg-blue-500 text-white hover:bg-blue-400'
                  : 'bg-white/5 text-zinc-600 cursor-not-allowed'
                }
              `}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] text-zinc-700 mt-1.5 px-1">
            Shift+Enter for newline · Esc to close
          </p>
        </div>
        </div>
      </div>
    </div>
  )
}
