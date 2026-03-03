import { create } from 'zustand'
import { ChatSession, ChatStatus, ContextTag, FileAttachment, GridLayout, Message, pickTagColor, ToolUse, ToolResult } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0
function uid(): string {
  return `${Date.now()}-${++_idCounter}`
}

function makeSession(overrides?: Partial<ChatSession>): ChatSession {
  const id = uid()
  return {
    id,
    title: `Chat ${id.slice(-4)}`,
    messages: [],
    status: 'idle',
    contextTags: [],
    fileAttachments: [],
    lastUserPrompt: '',
    streamingContent: '',
    useTools: false,
    useLocalMode: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface ChatStore {
  sessions: ChatSession[]
  focusedId: string | null
  gridLayout: GridLayout

  // Google auth state
  googleAuthStatus: 'not_configured' | 'authenticating' | 'authenticated' | 'error'
  googleAuthUrl: string | null
  googleEmail: string | null

  // Session management
  addSession: () => string
  removeSession: (id: string) => void
  focusSession: (id: string | null) => void
  setGridLayout: (layout: GridLayout) => void
  renameSession: (id: string, title: string) => void
  toggleTools: (id: string) => void
  toggleLocalMode: (id: string) => void
  addFileAttachment: (sessionId: string, file: Omit<FileAttachment, 'id' | 'addedAt'>) => void

  // Google auth
  checkGoogleAuth: () => Promise<void>
  initiateGoogleAuth: () => Promise<void>

  // Messaging
  sendMessage: (sessionId: string, content: string) => void

  // Internal updaters (used by streaming logic)
  _patch: (id: string, patch: Partial<ChatSession>) => void
  _appendStream: (id: string, text: string) => void
  _finalizeStream: (id: string, toolUses?: ToolUse[], toolResults?: ToolResult[]) => void
  _setStatus: (id: string, status: ChatStatus, error?: string) => void
  _setContextTags: (id: string, tags: ContextTag[]) => void

  // Attention helpers
  attentionCount: () => number
  focusNextAttention: () => void
}

// ─── Store implementation ─────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [makeSession()],
  focusedId: null,
  gridLayout: '4',
  googleAuthStatus: 'not_configured',
  googleAuthUrl: null,
  googleEmail: null,

  // ── Session management ────────────────────────────────────────────────────

  addSession: () => {
    const s = makeSession()
    set(state => ({ sessions: [...state.sessions, s] }))
    return s.id
  },

  removeSession: (id) => {
    set(state => ({
      sessions: state.sessions.filter(s => s.id !== id),
      focusedId: state.focusedId === id ? null : state.focusedId,
    }))
  },

  focusSession: (id) => {
    set({ focusedId: id })
  },

  setGridLayout: (layout) => set({ gridLayout: layout }),

  renameSession: (id, title) => {
    get()._patch(id, { title })
  },

  toggleTools: (id) => {
    const session = get().sessions.find(s => s.id === id)
    if (session) {
      get()._patch(id, { useTools: !session.useTools })
    }
  },

  toggleLocalMode: (id) => {
    const session = get().sessions.find(s => s.id === id)
    if (session) {
      get()._patch(id, { useLocalMode: !session.useLocalMode })
    }
  },

  addFileAttachment: (sessionId, file) => {
    const session = get().sessions.find(s => s.id === sessionId)
    if (!session) return

    const attachment: FileAttachment = {
      id: uid(),
      ...file,
      addedAt: Date.now(),
    }

    get()._patch(sessionId, {
      fileAttachments: [...session.fileAttachments, attachment],
    })
  },

  // ── Messaging ─────────────────────────────────────────────────────────────

  sendMessage: (sessionId, content) => {
    const store = get()
    const session = store.sessions.find(s => s.id === sessionId)
    if (!session) return

    const userMsg: Message = {
      id: uid(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }

    store._patch(sessionId, {
      messages: [...session.messages, userMsg],
      lastUserPrompt: content,
      status: 'thinking',
      streamingContent: '',
      error: undefined,
    })

    streamResponse(sessionId, [...session.messages, userMsg])
  },

  // ── Internal ──────────────────────────────────────────────────────────────

  _patch: (id, patch) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
      ),
    }))
  },

  _appendStream: (id, text) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === id
          ? { ...s, status: 'streaming' as ChatStatus, streamingContent: s.streamingContent + text }
          : s,
      ),
    }))
  },

  _finalizeStream: (id, toolUses?: ToolUse[], toolResults?: ToolResult[]) => {
    const s = get().sessions.find(s => s.id === id)
    if (!s) return

    const assistantMsg: Message = {
      id: uid(),
      role: 'assistant',
      content: s.streamingContent,
      timestamp: Date.now(),
      toolUses,
      toolResults,
    }

    get()._patch(id, {
      messages: [...s.messages, assistantMsg],
      streamingContent: '',
      status: 'needs-attention',
      attentionAt: Date.now(),
    })

    extractContextTags(id, [...s.messages, assistantMsg])
  },

  _setStatus: (id, status, error?) => {
    get()._patch(id, { status, error })
  },

  _setContextTags: (id, tags) => {
    get()._patch(id, { contextTags: tags })
  },

  // ── Attention helpers ─────────────────────────────────────────────────────

  attentionCount: () => {
    return get().sessions.filter(s => s.status === 'needs-attention').length
  },

  focusNextAttention: () => {
    const sessions = get().sessions
    const attention = sessions.filter(s => s.status === 'needs-attention')
    if (attention.length === 0) return

    const currentIdx = attention.findIndex(s => s.id === get().focusedId)
    const next = attention[(currentIdx + 1) % attention.length]
    get().focusSession(next.id)
  },

  // ── Google auth ───────────────────────────────────────────────────────────

  checkGoogleAuth: async () => {
    try {
      const res = await fetch('/api/google/status')
      const data = await res.json()
      set({
        googleAuthStatus: data.authenticated ? 'authenticated' : 'not_configured',
        googleEmail: data.email || null,
      })
    } catch {
      set({ googleAuthStatus: 'error' })
    }
  },

  initiateGoogleAuth: async () => {
    try {
      set({ googleAuthStatus: 'authenticating' })
      const res = await fetch('/api/google/auth-url')
      const data = await res.json()

      if (data.authUrl) {
        // Open popup window for OAuth
        const width = 500
        const height = 600
        const left = (window.screen.width - width) / 2
        const top = (window.screen.height - height) / 2

        const popup = window.open(
          data.authUrl,
          'Google Auth',
          `width=${width},height=${height},left=${left},top=${top}`
        )

        // Poll for completion
        const checkComplete = setInterval(async () => {
          try {
            const statusRes = await fetch('/api/google/status')
            const statusData = await statusRes.json()

            if (statusData.authenticated) {
              clearInterval(checkComplete)
              popup?.close()
              set({
                googleAuthStatus: 'authenticated',
                googleEmail: statusData.email || null,
              })
            }
          } catch {
            // Continue polling
          }
        }, 1000)

        // Cleanup after 5 minutes
        setTimeout(() => {
          clearInterval(checkComplete)
          if (!popup?.closed) {
            popup?.close()
            if (get().googleAuthStatus === 'authenticating') {
              set({ googleAuthStatus: 'error' })
            }
          }
        }, 300000)
      }
    } catch {
      set({ googleAuthStatus: 'error' })
    }
  },
}))

// ─── Streaming with tool support ──────────────────────────────────────────────

async function streamResponse(sessionId: string, messages: Message[]) {
  const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
  if (!session) return

  try {
    // Choose endpoint based on local mode
    const endpoint = session.useLocalMode ? '/api/chat/local' : '/api/chat'

    // Build request body based on mode
    const body = session.useLocalMode
      ? {
          sessionId: session.localSessionId || sessionId,
          message: messages[messages.length - 1]?.content || '',
        }
      : {
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          useTools: session.useTools,
        }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let toolUses: ToolUse[] = []
    let toolResults: ToolResult[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))

          if (event.type === 'session_created') {
            // Store local session ID
            useChatStore.getState()._patch(sessionId, { localSessionId: event.sessionId })
          } else if (event.type === 'delta') {
            useChatStore.getState()._appendStream(sessionId, event.text)
          } else if (event.type === 'tool_uses') {
            toolUses = event.tools
            // Append tool use info to streaming content
            const toolInfo = event.tools.map((t: ToolUse) =>
              `\n\n🔧 Using tool: ${t.name}\n${JSON.stringify(t.input, null, 2)}`
            ).join('')
            useChatStore.getState()._appendStream(sessionId, toolInfo)
          } else if (event.type === 'tool_result') {
            toolResults.push({
              tool_use_id: event.tool_use_id,
              name: event.name,
              content: event.content,
              isError: event.isError,
            })

            // Track file attachments when files are read
            if ((event.name === 'read_file' || event.name === 'read_gdrive_file') && !event.isError) {
              const toolUse = toolUses.find(t => t.id === event.tool_use_id)
              if (toolUse) {
                // Extract file path and view link from content
                const pathMatch = event.content.match(/📄 File: (.+?)(?:\n|$)/)
                const linkMatch = event.content.match(/🔗 View: (.+?)(?:\n|$)/)

                if (pathMatch) {
                  const currentSession = useChatStore.getState().sessions.find(s => s.id === sessionId)
                  const filePath = toolUse.input.path

                  // Only add if not already in attachments
                  if (currentSession && !currentSession.fileAttachments.some(f => f.path === filePath)) {
                    useChatStore.getState().addFileAttachment(sessionId, {
                      name: pathMatch[1],
                      path: filePath,
                      viewLink: linkMatch?.[1],
                    })
                  }
                }
              }
            }

            // Append tool result to streaming content
            const resultPrefix = event.isError ? '❌' : '✅'
            useChatStore.getState()._appendStream(
              sessionId,
              `\n${resultPrefix} ${event.name} result:\n${event.content}\n`
            )
          } else if (event.type === 'done') {
            useChatStore.getState()._finalizeStream(sessionId, toolUses, toolResults)
          } else if (event.type === 'error') {
            useChatStore.getState()._setStatus(sessionId, 'error', event.message)
          }
        } catch {
          // ignore malformed SSE lines
        }
      }
    }
  } catch (err: any) {
    useChatStore.getState()._setStatus(sessionId, 'error', err.message)
  }
}

async function extractContextTags(sessionId: string, messages: Message[]) {
  try {
    const res = await fetch('/api/extract-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    })
    const data = await res.json()
    const tags: ContextTag[] = (data.tags as string[]).map((label, i) => ({
      id: `${sessionId}-tag-${i}`,
      label,
      color: pickTagColor(i),
    }))
    useChatStore.getState()._setContextTags(sessionId, tags)
  } catch {
    // silently fail — tags are non-critical
  }
}
