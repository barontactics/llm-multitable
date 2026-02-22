import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'

// ─── Base directory (configurable via .env) ────────────────────────────────
const BASE_DIR = process.env.MCP_BASE_DIR || join(homedir(), 'Desktop', 'Repo')

// ─── MCP Tool Definitions ──────────────────────────────────────────────────

export interface MCPTool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
}

export const MCP_TOOLS: MCPTool[] = [
  {
    name: 'read_file',
    description: 'Read file contents from local filesystem or Google Drive. Use "local/" prefix for local files, "gdrive/" for Google Drive files.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path with prefix: "local/path/to/file.txt" or "gdrive/file-id-or-name"',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files in local directory or Google Drive folder. Use "local/" prefix for local, "gdrive/" for Google Drive.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path with prefix: "local/path/to/dir" or "gdrive/" or "gdrive/folder-id"',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file in local filesystem or Google Drive. Use "local/" prefix for local, "gdrive/" for Google Drive.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path with prefix: "local/path/to/file.txt" or "gdrive/filename"',
        },
        content: {
          type: 'string',
          description: 'Content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for files by pattern in local filesystem or Google Drive. Use "local/" or "gdrive/" prefix.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path with prefix and pattern: "local/**/*.ts" or "gdrive/search-query"',
        },
      },
      required: ['path'],
    },
  },
]

// ─── Helper: Parse path prefix ────────────────────────────────────────────

function parsePath(path: string): { type: 'local' | 'gdrive'; path: string } {
  if (path.startsWith('gdrive/')) {
    return { type: 'gdrive', path: path.slice(7) } // Remove 'gdrive/' prefix
  } else if (path.startsWith('local/')) {
    return { type: 'local', path: path.slice(6) } // Remove 'local/' prefix
  }
  // Default to local if no prefix
  return { type: 'local', path }
}

// ─── Tool Execution (routing logic) ────────────────────────────────────────

export async function executeMCPTool(
  toolName: string,
  args: Record<string, any>,
  gdriveAuth?: any,
): Promise<{ content: string; isError?: boolean }> {
  const { type, path } = parsePath(args.path || '')

  // Route to Google Drive execution
  if (type === 'gdrive') {
    const { executeGDriveToolUnified } = await import('./gdrive-tools.js')
    return executeGDriveToolUnified(toolName, { ...args, path }, gdriveAuth)
  }

  // Local file system execution
  // Security: Resolve path and ensure it's within BASE_DIR
  function safePath(relativePath: string = '.'): string {
    const resolved = resolve(join(BASE_DIR, relativePath))
    if (!resolved.startsWith(BASE_DIR)) {
      throw new Error('Access denied: Path is outside base directory')
    }
    return resolved
  }

  try {
    switch (toolName) {
      case 'read_file': {
        const filePath = safePath(path)
        const content = await fs.readFile(filePath, 'utf-8')
        const stats = await fs.stat(filePath)
        const fileName = filePath.split('/').pop() || path
        const lines = content.split('\n').length

        // Metadata + full content for agent analysis
        const formattedContent = `📄 File: ${fileName}\n` +
                                `📂 Path: ${path}\n` +
                                `📊 Size: ${(stats.size / 1024).toFixed(2)} KB\n` +
                                `📝 Lines: ${lines}\n` +
                                `🔗 View: file://${filePath}\n\n` +
                                `<file_content>\n${content}\n</file_content>`

        return { content: formattedContent }
      }

      case 'list_directory': {
        const dirPath = safePath(path || '.')
        const entries = await fs.readdir(dirPath, { withFileTypes: true })
        const formatted = entries.map(e => {
          const type = e.isDirectory() ? 'dir' : 'file'
          return `${type.padEnd(5)} ${e.name}`
        })
        return { content: formatted.join('\n') }
      }

      case 'write_file': {
        const filePath = safePath(path)
        await fs.writeFile(filePath, args.content, 'utf-8')
        return { content: `Successfully wrote to ${path}` }
      }

      case 'search_files': {
        // path contains pattern for local search (e.g., "**/*.ts")
        const searchPath = safePath('.')
        const pattern = new RegExp(path.replace(/\*/g, '.*'), 'i')
        const results: string[] = []

        async function walk(dir: string) {
          const entries = await fs.readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = join(dir, entry.name)
            if (entry.isDirectory()) {
              // Skip node_modules, .git, etc.
              if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                await walk(fullPath)
              }
            } else if (pattern.test(entry.name)) {
              results.push(fullPath.replace(BASE_DIR, '~/Desktop/Repo'))
            }
          }
        }

        await walk(searchPath)
        return { content: results.join('\n') || 'No files found' }
      }

      default:
        return { content: `Unknown tool: ${toolName}`, isError: true }
    }
  } catch (error: any) {
    return { content: `Error: ${error.message}`, isError: true }
  }
}
