import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

interface ClaudeSession {
  id: string
  process: ChildProcess
  workingDir: string
  isActive: boolean
}

class ClaudeSessionManager {
  private sessions: Map<string, ClaudeSession> = new Map()
  private baseWorkingDir: string

  constructor() {
    // Create a base directory for all Claude sessions
    this.baseWorkingDir = path.join(os.tmpdir(), 'claude-multitable-sessions')
    if (!fs.existsSync(this.baseWorkingDir)) {
      fs.mkdirSync(this.baseWorkingDir, { recursive: true })
    }
  }

  /**
   * Create a new Claude CLI session
   */
  async createSession(sessionId?: string): Promise<string> {
    const id = sessionId || randomUUID()

    // Create isolated working directory for this session
    const workingDir = path.join(this.baseWorkingDir, id)
    if (!fs.existsSync(workingDir)) {
      fs.mkdirSync(workingDir, { recursive: true })
    }

    // Note: We'll create the process on-demand when sending messages
    // since Claude CLI in --print mode is single-shot (not a persistent session)
    const session: ClaudeSession = {
      id,
      process: null as any, // Will be created per-message
      workingDir,
      isActive: true
    }

    this.sessions.set(id, session)
    return id
  }

  /**
   * Send a message to a Claude session and stream the response
   */
  async sendMessage(
    sessionId: string,
    message: string,
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): Promise<void> {
    const session = this.sessions.get(sessionId)

    if (!session || !session.isActive) {
      onError('Session not found or inactive')
      return
    }

    // Spawn a new Claude process for each message
    // Claude CLI in --print mode is single-shot, not persistent
    const claudeProcess = spawn(
      'claude',
      ['--print', '--output-format', 'stream-json', '--verbose', '--input-format', 'text'],
      {
        cwd: session.workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Claude CLI uses its own authentication, not ANTHROPIC_API_KEY
          HOME: process.env.HOME, // Ensure HOME is set for Claude config
        }
      }
    )

    let responseBuffer = ''
    let hasCompleted = false

    const stdoutHandler = (data: Buffer) => {
      const text = data.toString()
      responseBuffer += text

      // Parse stream-json format
      const lines = responseBuffer.split('\n')
      responseBuffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const json = JSON.parse(line)

          // Handle stream-json events from Claude CLI
          if (json.type === 'assistant' && json.message) {
            // Extract text content from assistant message
            if (json.message.content && Array.isArray(json.message.content)) {
              for (const block of json.message.content) {
                if (block.type === 'text' && block.text) {
                  onChunk(block.text)
                }
              }
            }
          } else if (json.type === 'system' && json.subtype === 'error') {
            onError(json.message || 'Unknown error')
          } else if (json.type === 'result' && json.subtype === 'success') {
            if (!hasCompleted) {
              hasCompleted = true
              onComplete()
            }
          }
        } catch (e) {
          // Skip non-JSON lines or parsing errors
          console.debug(`Failed to parse line: ${line}`)
        }
      }
    }

    const stderrHandler = (data: Buffer) => {
      const errorText = data.toString()
      console.error(`Claude session ${sessionId} stderr:`, errorText)
      // Don't call onError for stderr unless it's a real error
      // Claude CLI outputs some info to stderr that's not an error
    }

    const exitHandler = (code: number | null) => {
      if (!hasCompleted) {
        if (code === 0) {
          onComplete()
        } else {
          onError(`Claude process exited with code ${code}`)
        }
      }
    }

    claudeProcess.stdout?.on('data', stdoutHandler)
    claudeProcess.stderr?.on('data', stderrHandler)
    claudeProcess.on('exit', exitHandler)
    claudeProcess.on('error', (err) => {
      onError(`Failed to spawn Claude: ${err.message}`)
    })

    // Send message to Claude CLI via stdin
    try {
      claudeProcess.stdin?.write(message)
      claudeProcess.stdin?.end()
    } catch (err: any) {
      onError(`Failed to send message: ${err.message}`)
    }
  }

  /**
   * Terminate a Claude session
   */
  async terminateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)

    if (!session) {
      return
    }

    session.isActive = false

    // No persistent process to kill since we spawn per-message

    // Cleanup working directory
    try {
      fs.rmSync(session.workingDir, { recursive: true, force: true })
    } catch (err) {
      console.error(`Failed to cleanup session ${sessionId} directory:`, err)
    }

    this.sessions.delete(sessionId)
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.entries())
      .filter(([_, session]) => session.isActive)
      .map(([id]) => id)
  }

  /**
   * Cleanup all sessions
   */
  async cleanup(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys())
    await Promise.all(sessionIds.map(id => this.terminateSession(id)))
  }
}

// Singleton instance
export const claudeSessionManager = new ClaudeSessionManager()

// Cleanup on process exit
process.on('exit', () => {
  claudeSessionManager.cleanup()
})

process.on('SIGINT', () => {
  claudeSessionManager.cleanup()
  process.exit()
})

process.on('SIGTERM', () => {
  claudeSessionManager.cleanup()
  process.exit()
})
