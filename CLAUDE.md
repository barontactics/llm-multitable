# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM MultiTable is a React + Express application for running multiple AI conversations simultaneously with poker-style attention signaling. Users can manage up to 12 parallel chats in a grid layout, with visual/audio cues when the AI finishes responding.

## Development Commands

```bash
# Start development (runs both Vite dev server + Express backend)
npm run dev

# Build for production (TypeScript compile + Vite build)
npm run build

# Preview production build
npm preview

# Run backend server only
npm run server
```

**Dev server URLs:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Environment Setup

Copy `.env.example` to `.env` and add your Anthropic API key:
```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
```

## Architecture

### Frontend (React 19 + Zustand)

**State management** is centralized in `src/store/chatStore.ts`:
- All chat sessions live in a single Zustand store
- Streaming logic (`streamResponse`) handles SSE consumption from the backend
- Context tag extraction (`extractContextTags`) runs after each assistant response
- Attention system tracks which tables have "needs-attention" status

**Key state transitions:**
```
idle → thinking → streaming → needs-attention → idle (on user reply)
```

**Component hierarchy:**
```
App.tsx
├── Toolbar.tsx          (layout selector + attention badge)
└── TableGrid.tsx        (grid container + modal orchestrator)
    ├── ChatTable.tsx    (individual table card with glow effect)
    └── ChatModal.tsx    (full-screen chat interface)
```

**Attention system:**
- When AI finishes responding, table status → `needs-attention`
- Card shows pulsing green border + "YOUR TURN" badge
- Tab key cycles through tables needing attention via `focusNextAttention()`
- Opening a table that needs attention clears its attention state

### Backend (Express + Anthropic SDK)

**`server/index.ts` exposes three endpoints:**

1. **POST `/api/chat`** — Streams AI responses via SSE
   - Uses `claude-sonnet-4-6` by default
   - Returns `{ type: 'delta', text }` events during streaming
   - Returns `{ type: 'done', usage }` when complete
   - Max tokens: 4096

2. **POST `/api/extract-context`** — Generates topic tags
   - Uses `claude-haiku-4-5-20251001` for fast extraction
   - Analyzes last 10 messages (truncated to 200 chars each)
   - Returns JSON array of 3-5 topic tags
   - Falls back to empty array on error

3. **GET `/api/health`** — Health check

**Streaming flow:**
1. Frontend calls `/api/chat` with message history
2. Backend creates Anthropic stream
3. For each `content_block_delta`, backend sends SSE event
4. Frontend appends deltas to `streamingContent` in store
5. On stream end, frontend finalizes message and triggers tag extraction

### Vite Configuration

- Dev server proxies `/api/*` → `http://localhost:3001`
- This allows frontend to call backend without CORS issues during development

## MCP Tool Support

Each chat session can optionally enable **MCP (Model Context Protocol) tools** for file system access:

**Available Tools:**
- `read_file` - Read files from ~/Desktop/Repo
- `list_directory` - List directory contents
- `write_file` - Write files to ~/Desktop/Repo
- `search_files` - Search for files matching a pattern

**Enabling tools:**
- Click the 🔧 toggle button in the chat modal header
- Tools are session-specific (per-table setting)
- When enabled, Claude can use tools autonomously during conversations

**Security:**
- All file paths are resolved relative to `~/Desktop/Repo`
- Access is restricted to files within `~/Desktop/Repo` only
- Path traversal attacks are prevented via `resolve()` + bounds checking
- Base directory configured in `server/mcp-tools.ts:6`

**Tool execution flow:**
1. User enables tools for a session via UI toggle
2. Frontend sends `useTools: true` in `/api/chat` request
3. Backend includes MCP tools in Anthropic API request
4. Claude decides when to use tools based on conversation context
5. Backend executes tools via `executeMCPTool()` in `server/mcp-tools.ts`
6. Results are streamed back to frontend and displayed inline

**Implementation files:**
- `server/mcp-tools.ts` - Tool definitions and execution logic
- `server/index.ts:16-99` - Streaming endpoint with tool support
- `src/store/chatStore.ts:188-262` - Frontend streaming with tool handling
- `src/types/index.ts:18-37` - ToolUse and ToolResult types

## Code Patterns

**Adding a new MCP tool:**
1. Add tool definition to `MCP_TOOLS` array in `server/mcp-tools.ts`
2. Add execution case in `executeMCPTool()` switch statement
3. Implement tool logic with proper error handling
4. Update tool list in `ChatModal.tsx` tools info banner

**Adding a new chat status:**
1. Update `ChatStatus` type in `src/types/index.ts`
2. Handle status in `StatusBadge.tsx` (color mapping)
3. Update state transitions in `chatStore.ts` as needed

**Modifying streaming behavior:**
- Edit `streamResponse()` in `src/store/chatStore.ts`
- SSE parsing happens in the `while(true)` read loop
- Status updates use `_setStatus()`, content uses `_appendStream()`
- Tool events handled via `tool_uses` and `tool_result` SSE events

**Changing AI model:**
- Default model is defined in `src/types/index.ts` as `MODEL` constant
- Backend uses this in `/api/chat` endpoint (server/index.ts:17)
- Context extraction always uses Haiku for speed (server/index.ts:58)

**Grid layout system:**
- Layouts defined in `GRID_CONFIGS` (src/types/index.ts)
- CSS grid template columns/rows set dynamically in `TableGrid.tsx`
- Max 12 tables enforced by largest layout (4×3)

## TypeScript Configuration

- Frontend: `tsconfig.json` (React JSX, ESNext modules)
- Backend: `tsconfig.node.json` (Node environment)
- Strict mode enabled, unused locals/params disabled for flexibility

## Code Quality & Architecture Preferences

**CRITICAL - Developer's Coding Standards:**

1. **Code for Scalability** - Write code that scales easily without requiring major refactoring
2. **Zero Redundancy** - Never write redundant code. If logic is duplicated, extract it immediately
3. **OOP Principles** - When multiple things share common behavior:
   - Define a base type/interface for shared properties
   - Use inheritance or composition to create specialized sub-classes
   - **Always prioritize this optimization over code duplication**
4. **DRY (Don't Repeat Yourself)** - If you're writing similar code twice, stop and refactor into reusable abstractions
5. **Type Safety** - Use TypeScript types and interfaces to enforce contracts
6. **Single Responsibility** - Each function/class should do one thing well

**Examples of Good Practice in this Codebase:**
- Unified MCP tools (`read_file`, `list_directory`, etc.) that route based on path prefix (`local/` vs `gdrive/`) rather than maintaining separate tool definitions
- Path-based routing logic in `parsePath()` that determines execution context
- Shared interfaces and base types for common patterns
