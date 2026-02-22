# LLM MultiTable

Multi-table LLM chat viewer inspired by online poker multi-tabling (ACR/Ignition style).
Run multiple AI conversations simultaneously with poker-style attention signals when the AI responds.

## Features

- **Multi-table grid** — 1×1 up to 4×3 layout (12 simultaneous chats)
- **Attention signal** — pulsing green glow + "YOUR TURN" badge when AI responds and needs your reply
- **Tab key cycling** — press Tab to jump to the next table needing attention
- **Live streaming** — responses stream token-by-token in real time
- **Context tabs** — AI-extracted topic tags auto-update on each table
- **Last prompt preview** — truncated current prompt always visible on each card
- **Mini message history** — last few messages visible without opening the table
- **Model selector** — switch between Claude Sonnet, Opus, Haiku per table

## Setup

```bash
cp .env.example .env
# Add your Anthropic API key to .env

npm install
npm run dev
```

Open http://localhost:5173

## Usage

| Action | How |
|---|---|
| Open a chat | Click any table card |
| New table | Click **+ New Table** or empty slot |
| Close table | × button on card header |
| Jump to attention | Press **Tab** or click the green badge |
| Send message | Enter (Shift+Enter for newline) |
| Rename chat | Click title in modal |
| Change model | Dropdown in modal header |
| Change layout | Grid icons in toolbar |

## Architecture

```
server/
  index.ts          Express + Anthropic streaming SSE backend

src/
  store/chatStore.ts  Zustand global state + streaming logic
  types/index.ts      Domain types
  components/
    Toolbar.tsx       Top bar with layout selector + attention badge
    TableGrid.tsx     CSS grid of chat cards + modal orchestration
    ChatTable.tsx     Individual table card (mini view + attention glow)
    ChatModal.tsx     Full-screen chat interface
    ContextTabs.tsx   Colored topic tag pills
    StatusBadge.tsx   Status dot indicator
  lib/truncate.ts     Text utilities
```
