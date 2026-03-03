// ─── Core domain types ──────────────────────────────────────────────────────

export type ChatStatus =
  | 'idle'           // empty, waiting for first message
  | 'thinking'       // request sent, waiting for first token
  | 'streaming'      // tokens arriving
  | 'needs-attention' // LLM done — human's turn to respond
  | 'error'

export type TagColor = 'green' | 'blue' | 'purple' | 'amber' | 'pink' | 'cyan' | 'red'

export interface ContextTag {
  id: string
  label: string
  color: TagColor
}

export interface FileAttachment {
  id: string
  name: string
  path: string
  viewLink?: string
  addedAt: number
}

export interface ToolUse {
  id: string
  name: string
  input: Record<string, any>
}

export interface ToolResult {
  tool_use_id: string
  name: string
  content: string
  isError?: boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  toolUses?: ToolUse[]
  toolResults?: ToolResult[]
}

export const MODEL = 'claude-sonnet-4-6'

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  status: ChatStatus
  contextTags: ContextTag[]
  fileAttachments: FileAttachment[] // files loaded in this chat's context
  lastUserPrompt: string
  streamingContent: string   // partial assistant text during streaming
  createdAt: number
  updatedAt: number
  error?: string
  attentionAt?: number       // timestamp when attention was needed
  useTools: boolean          // whether this chat has MCP tools enabled
  useLocalMode: boolean      // whether to use local Claude Code CLI (subscription token)
  localSessionId?: string    // Claude CLI session ID for local mode
  pendingToolUses?: ToolUse[] // tools waiting to be executed
}

// ─── Layout types ────────────────────────────────────────────────────────────

export type GridLayout = '1' | '2' | '3' | '4' | '6' | '9' | '12'

export interface GridConfig {
  cols: number
  rows: number
  label: string
}

export const GRID_CONFIGS: Record<GridLayout, GridConfig> = {
  '1':  { cols: 1, rows: 1, label: '1×1' },
  '2':  { cols: 2, rows: 1, label: '2×1' },
  '3':  { cols: 3, rows: 1, label: '3×1' },
  '4':  { cols: 2, rows: 2, label: '2×2' },
  '6':  { cols: 3, rows: 2, label: '3×2' },
  '9':  { cols: 3, rows: 3, label: '3×3' },
  '12': { cols: 4, rows: 3, label: '4×3' },
}

// ─── Tag color palette ────────────────────────────────────────────────────────

const TAG_COLORS: TagColor[] = ['green', 'blue', 'purple', 'amber', 'pink', 'cyan', 'red']

export function pickTagColor(index: number): TagColor {
  return TAG_COLORS[index % TAG_COLORS.length]
}
