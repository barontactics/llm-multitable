import express from 'express'
import session from 'express-session'
import cors from 'cors'
import dotenv from 'dotenv'
import Anthropic from '@anthropic-ai/sdk'
import { MCP_TOOLS, executeMCPTool } from './mcp-tools.js'
import { GDRIVE_TOOLS, executeGDriveTool } from './gdrive-tools.js'
import { initGoogleAuth, getAuthUrl, getTokenFromCode, createUserClient, getUserClient } from './gdrive-auth.js'
import { google } from 'googleapis'
import { claudeSessionManager } from './claude-session-manager.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Anthropic client setup
// Note: OAuth tokens (sk-ant-oat01-...) from Claude Code are workspace-scoped
// and may have different expiration/refresh requirements than standard API keys
const apiKey = process.env.ANTHROPIC_API_KEY || ''

if (!apiKey) {
  console.error('⚠️  ANTHROPIC_API_KEY not found in .env file')
}

const client = new Anthropic({ apiKey })

// Initialize Google Drive auth (for env-based flow)
initGoogleAuth()

app.use(cors({ credentials: true, origin: 'http://localhost:5173' }))
app.use(express.json())
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'llm-multitable-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
  })
)

// ─── Streaming chat endpoint with tool support ────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, model = 'claude-sonnet-4-6', useTools = false } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  try {
    // Build request with optional tool support
    const requestParams: any = {
      model,
      max_tokens: 4096,
      messages: messages.map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    }

    if (useTools) {
      requestParams.tools = MCP_TOOLS
      requestParams.system = `You are a helpful AI assistant with access to file system tools.

CRITICAL FILE READING BEHAVIOR:
When you use read_file or read_gdrive_file tools:

1. **Read the file internally** - You have access to the full content within <file_content> tags (hidden from user UI)
2. **Understand the context** - Analyze what the file contains and its purpose
3. **Consider existing context** - Check if there are already files in the conversation context
4. **IMMEDIATELY ask guiding questions** - After the tool result, you MUST respond with 3-5 specific, actionable questions about what the user might want to do with this file
5. **File content is hidden** - The <file_content> tags and their contents are stripped from the UI, so users only see your questions and guidance

REQUIRED WORKFLOW:
After reading a file, you MUST immediately follow up with a response like this (do NOT just acknowledge the file):

"I've analyzed [filename]. Here are some ways I can help:

• [Question 1 based on file content]
• [Question 2 considering relationships with other files in context]
• [Question 3 suggesting concrete actions]
• [Question 4 about potential next steps]
• [Question 5 if applicable]

What would be most useful for you right now?"

ABSOLUTE PROHIBITIONS:
- NEVER dump file content, text excerpts, or quotes into the chat
- NEVER output personal names, email addresses, phone numbers, or any PII (Personally Identifiable Information)
- NEVER provide summaries that include specific personal details
- NEVER extract or show file text verbatim
- NEVER mention specific individuals by name from the documents

ALWAYS DO:
- Ask strategic, actionable questions based on the file's content TYPE and PURPOSE
- Consider relationships between multiple files in context
- Suggest concrete actions focusing on document structure, patterns, and insights
- Be proactive about identifying potential next steps
- Refer to people by their ROLES (e.g., "the consultant", "the client", "team members") instead of names
- Focus on document patterns, structures, and actionable insights rather than specific content

Example response after reading a consultant_onboarding.docx:
"I've loaded consultant_onboarding.docx into our context. I can see it's an onboarding document with structured processes. Here are some ways I can help:

• Would you like me to extract the timeline and key milestones?
• Should I identify any gaps or missing information in the process?
• Do you want me to compare this against industry best practices?
• Would you like me to create a checklist template based on the structure I see?
• Should I help draft communication materials following this framework?

What would be most useful for you right now?"

Example with multiple files in context:
"I've added pricing_strategy.xlsx to our context (joining the consultant_onboarding.docx we looked at earlier). I notice potential connections between these documents:

• Should I analyze if the pricing structure aligns with the consultant roles described in the onboarding doc?
• Would you like me to create a cost model for onboarding based on both files?
• Do you want me to check for consistency in terminology and structure between the two documents?
• Should I identify any pricing implications for the services outlined in the onboarding process?
• Would it be helpful to cross-reference the role definitions with the pricing tiers?

What analysis would be most valuable?"

Files are visible in the "Files in Context" section with clickable links for the user to view directly.`
    }

    const stream = await client.messages.stream(requestParams)

    let toolUseBlocks: any[] = []
    let currentToolInputJson = ''

    for await (const chunk of stream) {
      // Handle text deltas
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk.delta.text })}\n\n`)
      }

      // Handle tool use blocks
      if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
        toolUseBlocks.push({
          id: chunk.content_block.id,
          name: chunk.content_block.name,
          input: {},
        })
        currentToolInputJson = ''
      }

      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'input_json_delta') {
        currentToolInputJson += chunk.delta.partial_json || ''
      }

      if (chunk.type === 'content_block_stop') {
        const lastTool = toolUseBlocks[toolUseBlocks.length - 1]
        if (lastTool && currentToolInputJson) {
          try {
            lastTool.input = JSON.parse(currentToolInputJson)
          } catch {
            lastTool.input = {}
          }
          currentToolInputJson = ''
        }
      }
    }

    const finalMsg = await stream.finalMessage()

    // Execute any tool uses
    if (toolUseBlocks.length > 0) {
      res.write(`data: ${JSON.stringify({ type: 'tool_uses', tools: toolUseBlocks })}\n\n`)

      // Execute tools and send results
      for (const tool of toolUseBlocks) {
        // Get user's auth client from session (for GDrive paths)
        const userAuth = getUserClient(req.session.id || '')

        // Execute unified MCP tool (handles both local and gdrive paths)
        const result = await executeMCPTool(tool.name, tool.input, userAuth)

        res.write(`data: ${JSON.stringify({
          type: 'tool_result',
          tool_use_id: tool.id,
          name: tool.name,
          content: result.content,
          isError: result.isError
        })}\n\n`)
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done', usage: finalMsg.usage })}\n\n`)
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
  } finally {
    res.end()
  }
})

// ─── Local Claude CLI chat endpoint (uses subscription OAuth token) ───────
app.post('/api/chat/local', async (req, res) => {
  const { sessionId, message } = req.body

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message string required' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  try {
    // Create or reuse session
    let activeSessionId = sessionId
    if (!activeSessionId || !claudeSessionManager.getActiveSessions().includes(activeSessionId)) {
      activeSessionId = await claudeSessionManager.createSession(sessionId)
      res.write(`data: ${JSON.stringify({ type: 'session_created', sessionId: activeSessionId })}\n\n`)
    }

    // Send message and stream response
    await claudeSessionManager.sendMessage(
      activeSessionId,
      message,
      (text) => {
        // Stream text chunks
        res.write(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`)
      },
      () => {
        // Completion handler
        res.write(`data: ${JSON.stringify({ type: 'done', sessionId: activeSessionId })}\n\n`)
        res.end()
      },
      (error) => {
        // Error handler
        res.write(`data: ${JSON.stringify({ type: 'error', message: error })}\n\n`)
        res.end()
      }
    )
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
    res.end()
  }
})

// ─── Terminate Claude CLI session ──────────────────────────────────────────
app.post('/api/chat/local/terminate', async (req, res) => {
  const { sessionId } = req.body

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' })
  }

  try {
    await claudeSessionManager.terminateSession(sessionId)
    res.json({ ok: true, sessionId })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Get active Claude CLI sessions ────────────────────────────────────────
app.get('/api/chat/local/sessions', (_req, res) => {
  const sessions = claudeSessionManager.getActiveSessions()
  res.json({ sessions })
})

// ─── Context tag extraction endpoint ─────────────────────────────────────
app.post('/api/extract-context', async (req, res) => {
  const { messages, model = 'claude-haiku-4-5-20251001' } = req.body

  if (!messages || messages.length === 0) {
    return res.json({ tags: [] })
  }

  // Build a compact transcript for analysis
  const transcript = messages
    .slice(-10) // last 10 messages
    .map((m: { role: string; content: string }) => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n')

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: `Analyze this conversation and respond with ONLY a JSON array of 3-5 short topic tags (2-4 words each). No explanation, just the JSON array.

Conversation:
${transcript}

Respond with format: ["tag one", "tag two", "tag three"]`,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
    const match = text.match(/\[.*\]/s)
    const tags = match ? JSON.parse(match[0]) : []
    res.json({ tags: tags.slice(0, 5) })
  } catch (err: any) {
    res.json({ tags: [] })
  }
})

// ─── List available MCP tools ──────────────────────────────────────────────
app.get('/api/tools', (_req, res) => {
  res.json({ tools: [...MCP_TOOLS, ...GDRIVE_TOOLS] })
})

// ─── Google OAuth endpoints (per-user auth) ───────────────────────────────

app.get('/api/google/auth-url', (req, res) => {
  try {
    const url = getAuthUrl()
    res.json({ authUrl: url })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/google/callback', async (req, res) => {
  const { code } = req.query
  if (!code || typeof code !== 'string') {
    return res.status(400).send('Missing authorization code')
  }

  try {
    const tokens = await getTokenFromCode(code)

    // Store in session
    if (req.session) {
      const client = createUserClient(req.session.id, tokens)

      // Get user email
      const oauth2 = google.oauth2({ version: 'v2', auth: client })
      const userInfo = await oauth2.userinfo.get()

      req.session.googleTokens = tokens
      req.session.googleEmail = userInfo.data.email || 'Unknown'

      res.send(`
        <html>
          <head><title>Google Drive Connected</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1 style="color: #10b981;">✅ Google Drive Connected!</h1>
            <p style="color: #6b7280;">Signed in as: <strong>${userInfo.data.email}</strong></p>
            <p style="color: #6b7280;">You can close this window now.</p>
            <script>window.close()</script>
          </body>
        </html>
      `)
    }
  } catch (err: any) {
    res.status(500).send(`Error: ${err.message}`)
  }
})

app.get('/api/google/status', (req, res) => {
  const authenticated = !!(req.session && (req.session.googleTokens || req.session.googleExtensionToken))
  const email = req.session?.googleEmail || null
  res.json({ authenticated, email })
})

app.post('/api/google/disconnect', (req, res) => {
  if (req.session) {
    delete req.session.googleTokens
    delete req.session.googleEmail
  }
  res.json({ ok: true })
})

app.get('/api/google/config-status', (_req, res) => {
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  res.json({ configured })
})

app.post('/api/google/setup', async (req, res) => {
  const { clientId, clientSecret } = req.body

  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'Client ID and Secret required' })
  }

  // Update environment variables (runtime only, requires restart to persist)
  process.env.GOOGLE_CLIENT_ID = clientId
  process.env.GOOGLE_CLIENT_SECRET = clientSecret
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/api/google/callback'

  // Reinitialize Google auth with new credentials
  initGoogleAuth()

  res.json({ ok: true, message: 'Credentials saved. Note: Restart server to persist changes.' })
})

app.post('/api/google/extension-auth', async (req, res) => {
  const { token, email } = req.body

  if (!token || !email) {
    return res.status(400).json({ error: 'Token and email required' })
  }

  // Store in session
  if (req.session) {
    req.session.googleExtensionToken = token
    req.session.googleEmail = email
  }

  res.json({ ok: true })
})

app.post('/api/google/gis-auth', async (req, res) => {
  const { accessToken } = req.body

  if (!accessToken) {
    return res.status(400).json({ error: 'Access token required' })
  }

  try {
    // Get user info using the access token
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const userInfo = await userInfoResponse.json()

    // Create OAuth2 client with the access token
    if (req.session) {
      const sessionId = req.session.id
      const tokens = { access_token: accessToken }
      createUserClient(sessionId, tokens)

      req.session.googleEmail = userInfo.email
      req.session.googleTokens = tokens
    }

    res.json({ ok: true, email: userInfo.email })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── File browsing endpoints ───────────────────────────────────────────────

app.post('/api/browse-local', async (req, res) => {
  const { path = '.' } = req.body

  try {
    const result = await executeMCPTool('list_directory', { path: `local/${path}` })

    // Parse the result into structured format
    const lines = result.content.split('\n').filter(l => l.trim())
    const files = lines.map(line => {
      const [type, ...nameParts] = line.trim().split(/\s+/)
      return {
        type: type.trim(),
        name: nameParts.join(' ')
      }
    })

    res.json({ files })
  } catch (err: any) {
    res.status(500).json({ error: err.message, files: [] })
  }
})

app.post('/api/browse-gdrive', async (req, res) => {
  const { folderId } = req.body

  try {
    const userAuth = getUserClient(req.session?.id || '')
    const result = await executeGDriveTool(
      'list_gdrive_files',
      { folderId },
      userAuth
    )

    // Parse the GDrive result
    const blocks = result.content.split('\n\n')
    const files = blocks.map(block => {
      const lines = block.split('\n')
      const name = lines[0]?.split('(')[0]?.trim()
      const mimeType = lines[0]?.match(/\((.+)\)/)?.[1]
      const id = lines[1]?.match(/ID: (.+)/)?.[1]

      return { name, mimeType, id }
    }).filter(f => f.name && f.id)

    res.json({ files })
  } catch (err: any) {
    res.status(500).json({ error: err.message, files: [] })
  }
})

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: 'claude-sonnet-4-6', toolsAvailable: true })
})

app.listen(PORT, () => {
  console.log(`\n🎰 LLM MultiTable server running on http://localhost:${PORT}\n`)
})
