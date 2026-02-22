import { google } from 'googleapis'
import { getAuthClient } from './gdrive-auth.js'
import type { MCPTool } from './mcp-tools.js'
import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')
const XLSX = require('xlsx')
const textract = require('textract')

const BASE_DIR = process.env.MCP_BASE_DIR || join(homedir(), 'Desktop', 'Repo')

// ─── Google Drive Tool Definitions ────────────────────────────────────────

export const GDRIVE_TOOLS: MCPTool[] = [
  {
    name: 'list_gdrive_files',
    description: 'List files in Google Drive folder',
    input_schema: {
      type: 'object',
      properties: {
        folderId: {
          type: 'string',
          description: 'Google Drive folder ID (optional, defaults to root)',
        },
        query: {
          type: 'string',
          description: 'Search query (e.g., "name contains \'report\'")',
        },
      },
    },
  },
  {
    name: 'read_gdrive_file',
    description: 'Read content of a Google Drive file (text files only)',
    input_schema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'download_gdrive_file',
    description: 'Download a Google Drive file and get its content',
    input_schema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'download_gdrive_to_local',
    description: 'Download a Google Drive file and save it to the local MCP directory',
    input_schema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        localPath: {
          type: 'string',
          description: 'Local file path (relative to MCP base directory)',
        },
      },
      required: ['fileId', 'localPath'],
    },
  },
  {
    name: 'upload_gdrive_file',
    description: 'Upload content to a new file in Google Drive',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'File name',
        },
        content: {
          type: 'string',
          description: 'File content',
        },
        folderId: {
          type: 'string',
          description: 'Parent folder ID (optional)',
        },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'search_gdrive',
    description: 'Search Google Drive for files matching criteria',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "fullText contains \'budget\'")',
        },
        maxResults: {
          type: 'number',
          description: 'Max results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
]

// ─── Unified Tool Execution (for path-based routing) ──────────────────────

export async function executeGDriveToolUnified(
  toolName: string,
  args: Record<string, any>,
  auth?: any,
): Promise<{ content: string; isError?: boolean }> {
  // Map unified tool names to GDrive-specific operations
  const path = args.path || ''

  switch (toolName) {
    case 'read_file':
      // Treat path as file ID
      return executeGDriveTool('read_gdrive_file', { fileId: path }, auth)

    case 'list_directory':
      // Treat path as folder ID (empty = root)
      return executeGDriveTool('list_gdrive_files', { folderId: path || undefined }, auth)

    case 'write_file':
      // Upload new file
      return executeGDriveTool('upload_gdrive_file', {
        name: path.split('/').pop() || 'file.txt',
        content: args.content
      }, auth)

    case 'search_files':
      // Use path as search query
      return executeGDriveTool('search_gdrive', { query: `fullText contains '${path}'` }, auth)

    default:
      return { content: `Tool ${toolName} not supported for Google Drive`, isError: true }
  }
}

// ─── Tool Execution ────────────────────────────────────────────────────────

export async function executeGDriveTool(
  toolName: string,
  args: Record<string, any>,
  auth?: any,
): Promise<{ content: string; isError?: boolean }> {
  // Use provided auth (from session) or fallback to global auth
  const authClient = auth || getAuthClient()

  if (!authClient) {
    return {
      content: 'Google Drive not authenticated. Please connect Google Drive first.',
      isError: true,
    }
  }

  const drive = google.drive({ version: 'v3', auth: authClient })

  try {
    switch (toolName) {
      case 'list_gdrive_files': {
        const query = args.folderId
          ? `'${args.folderId}' in parents and trashed = false`
          : args.query || `'root' in parents and trashed = false`

        const res = await drive.files.list({
          q: query,
          pageSize: 50,
          fields: 'files(id, name, mimeType, size, modifiedTime)',
          orderBy: 'folder,name',
        })

        const files = res.data.files || []
        if (files.length === 0) {
          return { content: 'No files found' }
        }

        const formatted = files
          .map(
            f =>
              `${f.name} (${f.mimeType})\n  ID: ${f.id}\n  Size: ${f.size || 'N/A'} bytes\n  Modified: ${f.modifiedTime}`,
          )
          .join('\n\n')

        return { content: formatted }
      }

      case 'read_gdrive_file':
      case 'download_gdrive_file': {
        let { fileId } = args

        // Get file metadata first
        let metadata = await drive.files.get({
          fileId,
          fields: 'name, mimeType, size, webViewLink, shortcutDetails',
        })

        // If it's a shortcut, follow it to the target file
        if (metadata.data.mimeType === 'application/vnd.google-apps.shortcut') {
          const targetId = (metadata.data as any).shortcutDetails?.targetId
          if (targetId) {
            fileId = targetId
            metadata = await drive.files.get({
              fileId,
              fields: 'name, mimeType, size, webViewLink',
            })
          } else {
            return {
              content: `📄 File: ${metadata.data.name}\n` +
                      `⚠️ This is a shortcut but the target file could not be accessed.\n` +
                      `View at: ${metadata.data.webViewLink}`,
              isError: false
            }
          }
        }

        const mimeType = metadata.data.mimeType || ''
        const fileName = metadata.data.name || 'file'

        // Handle PDFs with text extraction
        if (mimeType.toLowerCase().includes('pdf')) {
          try {
            const res = await drive.files.get(
              { fileId, alt: 'media' },
              { responseType: 'arraybuffer' },
            )

            const data = await pdfParse(Buffer.from(res.data as ArrayBuffer))

            return {
              content: `📄 File: ${fileName}\n` +
                      `📎 Type: ${mimeType}\n` +
                      `📊 Pages: ${data.numpages}\n` +
                      `🔗 View: ${metadata.data.webViewLink || 'N/A'}\n\n` +
                      `<file_content>\n${data.text}\n</file_content>`,
              isError: false
            }
          } catch (err: any) {
            return {
              content: `📄 File: ${fileName}\n` +
                      `📎 Type: ${mimeType}\n` +
                      `📊 Size: ${metadata.data.size ? `${(parseInt(metadata.data.size) / 1024).toFixed(2)} KB` : 'Unknown'}\n` +
                      `🔗 View: ${metadata.data.webViewLink || 'N/A'}\n\n` +
                      `⚠️ Failed to extract text from PDF: ${err.message}\n\n` +
                      `💡 To work with this file:\n` +
                      `• Use download_gdrive_to_local to save it locally\n` +
                      `• Open it in your browser: ${metadata.data.webViewLink}`,
              isError: false
            }
          }
        }

        // Handle Word documents (.docx)
        if (mimeType.includes('wordprocessingml') || mimeType.includes('msword') || fileName.endsWith('.docx')) {
          try {
            const res = await drive.files.get(
              { fileId, alt: 'media' },
              { responseType: 'arraybuffer' },
            )

            const result = await mammoth.extractRawText({ buffer: Buffer.from(res.data as ArrayBuffer) })

            return {
              content: `📄 File: ${fileName}\n` +
                      `📎 Type: Microsoft Word Document\n` +
                      `🔗 View: ${metadata.data.webViewLink || 'N/A'}\n\n` +
                      `<file_content>\n${result.value}\n</file_content>`,
              isError: false
            }
          } catch (err: any) {
            return {
              content: `📄 File: ${fileName}\n` +
                      `📎 Type: Microsoft Word Document\n` +
                      `⚠️ Failed to extract text: ${err.message}\n\n` +
                      `View at: ${metadata.data.webViewLink}`,
              isError: false
            }
          }
        }

        // Handle Excel spreadsheets (.xlsx, .xls)
        if (mimeType.includes('spreadsheetml') || mimeType.includes('excel') || fileName.match(/\.xlsx?$/)) {
          try {
            const res = await drive.files.get(
              { fileId, alt: 'media' },
              { responseType: 'arraybuffer' },
            )

            const workbook = XLSX.read(Buffer.from(res.data as ArrayBuffer), { type: 'buffer' })
            let content = ''

            workbook.SheetNames.forEach((sheetName: string) => {
              const sheet = workbook.Sheets[sheetName]
              const csv = XLSX.utils.sheet_to_csv(sheet)
              content += `\n\n──── Sheet: ${sheetName} ────\n${csv}`
            })

            return {
              content: `📄 File: ${fileName}\n` +
                      `📎 Type: Microsoft Excel Spreadsheet\n` +
                      `📊 Sheets: ${workbook.SheetNames.length}\n` +
                      `🔗 View: ${metadata.data.webViewLink || 'N/A'}\n\n` +
                      `<file_content>\n${content}\n</file_content>`,
              isError: false
            }
          } catch (err: any) {
            return {
              content: `📄 File: ${fileName}\n` +
                      `📎 Type: Microsoft Excel Spreadsheet\n` +
                      `⚠️ Failed to extract data: ${err.message}\n\n` +
                      `View at: ${metadata.data.webViewLink}`,
              isError: false
            }
          }
        }

        // Check for other binary/non-text files (images, videos, audio)
        const binaryTypes = ['image', 'video', 'audio', 'zip', 'binary', 'octet-stream']
        const isBinary = binaryTypes.some(type => mimeType.toLowerCase().includes(type))

        if (isBinary) {
          const emoji = mimeType.includes('image') ? '🖼️' :
                       mimeType.includes('video') ? '🎬' :
                       mimeType.includes('audio') ? '🎵' : '📦'

          return {
            content: `${emoji} File: ${fileName}\n` +
                    `📎 Type: ${mimeType}\n` +
                    `📊 Size: ${metadata.data.size ? `${(parseInt(metadata.data.size) / 1024).toFixed(2)} KB` : 'Unknown'}\n` +
                    `🔗 View: ${metadata.data.webViewLink || 'N/A'}\n\n` +
                    `⚠️ This is a binary file that cannot be read as text.\n\n` +
                    `💡 To work with this file:\n` +
                    `• Use download_gdrive_to_local to save it locally\n` +
                    `• Open it in your browser: ${metadata.data.webViewLink || 'see webViewLink above'}`,
            isError: false
          }
        }

        // Export Google Workspace files with appropriate format
        if (mimeType.includes('google-apps')) {
          let exportMimeType = 'text/plain'

          // Map Google Workspace types to appropriate export formats
          if (mimeType.includes('document')) {
            exportMimeType = 'text/plain'
          } else if (mimeType.includes('spreadsheet')) {
            exportMimeType = 'text/csv'
          } else if (mimeType.includes('presentation')) {
            exportMimeType = 'text/plain'
          } else if (mimeType.includes('drawing')) {
            return {
              content: `File: ${fileName}\nType: ${mimeType}\nNote: Drawings cannot be exported as text. View at: ${metadata.data.webViewLink}`,
              isError: false
            }
          } else {
            // For unsupported types, show file info
            return {
              content: `File: ${fileName}\nType: ${mimeType}\nNote: This file type cannot be exported as text. Try viewing it at: ${metadata.data.webViewLink}`,
              isError: false
            }
          }

          const res = await drive.files.export(
            { fileId, mimeType: exportMimeType },
            { responseType: 'text' },
          )

          const exportedContent = String(res.data)

          return {
            content: `📄 File: ${fileName}\n` +
                    `📎 Type: ${mimeType}\n` +
                    `🔗 View: ${metadata.data.webViewLink || 'N/A'}\n\n` +
                    `<file_content>\n${exportedContent}\n</file_content>`
          }
        }

        // Try to extract text from any other file type using textract
        try {
          const res = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'arraybuffer' },
          )

          // First try as plain text
          const textTypes = ['text/', 'application/json', 'application/javascript', 'application/xml', 'application/csv']
          if (textTypes.some(type => mimeType.includes(type))) {
            const textContent = Buffer.from(res.data as ArrayBuffer).toString('utf-8')

            return {
              content: `📄 File: ${fileName}\n` +
                      `📎 Type: ${mimeType}\n` +
                      `🔗 View: ${metadata.data.webViewLink || 'N/A'}\n\n` +
                      `<file_content>\n${textContent}\n</file_content>`
            }
          }

          // Try textract for other formats (RTF, ODT, etc.)
          const tempPath = join(BASE_DIR, `.temp_${Date.now()}_${fileName}`)
          await fs.writeFile(tempPath, Buffer.from(res.data as ArrayBuffer))

          return new Promise((resolve) => {
            textract.fromFileWithPath(tempPath, async (error: any, text: string) => {
              // Clean up temp file
              try {
                await fs.unlink(tempPath)
              } catch {}

              if (error || !text || text.trim().length === 0) {
                // Fallback for truly unsupported types
                resolve({
                  content: `📄 File: ${fileName}\n` +
                          `📎 Type: ${mimeType}\n` +
                          `📊 Size: ${metadata.data.size ? `${(parseInt(metadata.data.size) / 1024).toFixed(2)} KB` : 'Unknown'}\n` +
                          `🔗 View: ${metadata.data.webViewLink || 'N/A'}\n\n` +
                          `⚠️ Could not extract text from this file type.\n\n` +
                          `💡 Options:\n` +
                          `• Use download_gdrive_to_local to save it locally\n` +
                          `• Open in browser: ${metadata.data.webViewLink}`,
                  isError: false
                })
              } else {
                resolve({
                  content: `📄 File: ${fileName}\n` +
                          `📎 Type: ${mimeType}\n` +
                          `🔗 View: ${metadata.data.webViewLink || 'N/A'}\n\n` +
                          `<file_content>\n${text}\n</file_content>`,
                  isError: false
                })
              }
            })
          })
        } catch (err: any) {
          return {
            content: `📄 File: ${fileName}\n` +
                    `📎 Type: ${mimeType}\n` +
                    `⚠️ Error reading file: ${err.message}\n\n` +
                    `View at: ${metadata.data.webViewLink}`,
            isError: false
          }
        }
      }

      case 'upload_gdrive_file': {
        const { name, content, folderId } = args

        const fileMetadata: any = { name }
        if (folderId) {
          fileMetadata.parents = [folderId]
        }

        const res = await drive.files.create({
          requestBody: fileMetadata,
          media: {
            mimeType: 'text/plain',
            body: content,
          },
          fields: 'id, name, webViewLink',
        })

        return {
          content: `✅ Uploaded: ${res.data.name}\nID: ${res.data.id}\nLink: ${res.data.webViewLink}`,
        }
      }

      case 'download_gdrive_to_local': {
        const { fileId, localPath } = args

        // Validate and resolve path
        const fullPath = resolve(join(BASE_DIR, localPath))
        if (!fullPath.startsWith(BASE_DIR)) {
          return { content: 'Error: Path outside base directory', isError: true }
        }

        // Get file metadata
        const metadata = await drive.files.get({
          fileId,
          fields: 'name, mimeType',
        })

        const mimeType = metadata.data.mimeType || ''
        const fileName = metadata.data.name || 'download'

        let fileContent: any

        // Export Google Workspace files
        if (mimeType.includes('google-apps')) {
          let exportMimeType = 'text/plain'

          if (mimeType.includes('document')) {
            exportMimeType = 'text/plain'
          } else if (mimeType.includes('spreadsheet')) {
            exportMimeType = 'text/csv'
          } else if (mimeType.includes('presentation')) {
            exportMimeType = 'text/plain'
          } else if (mimeType.includes('drawing')) {
            exportMimeType = 'application/pdf'
          } else {
            return {
              content: `File type ${mimeType} cannot be exported. Try a different file.`,
              isError: true
            }
          }

          const res = await drive.files.export(
            { fileId, mimeType: exportMimeType },
            { responseType: 'text' },
          )
          fileContent = res.data
        } else {
          // Download regular files
          const res = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'text' },
          )
          fileContent = res.data
        }

        // Write to local file
        await fs.writeFile(fullPath, fileContent, 'utf-8')

        return {
          content: `✅ Downloaded: ${fileName}\nSaved to: ${localPath}\nFull path: ${fullPath}`,
        }
      }

      case 'search_gdrive': {
        const { query, maxResults = 10 } = args

        const res = await drive.files.list({
          q: query,
          pageSize: maxResults,
          fields: 'files(id, name, mimeType, modifiedTime)',
        })

        const files = res.data.files || []
        if (files.length === 0) {
          return { content: 'No files found matching query' }
        }

        const formatted = files
          .map(f => `${f.name}\n  ID: ${f.id}\n  Type: ${f.mimeType}`)
          .join('\n\n')

        return { content: `Found ${files.length} file(s):\n\n${formatted}` }
      }

      default:
        return { content: `Unknown Google Drive tool: ${toolName}`, isError: true }
    }
  } catch (error: any) {
    return {
      content: `Google Drive Error: ${error.message}`,
      isError: true,
    }
  }
}
