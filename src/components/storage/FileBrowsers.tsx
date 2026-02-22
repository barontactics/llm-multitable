import React, { useState, useEffect } from 'react'
import GoogleDriveSetup from './GoogleDriveSetup'
import { useChatStore } from '../../store/chatStore'

interface BaseFileBrowserProps {
  onSelectFile: (path: string) => void
  onClose: () => void
}

// ─── Local File Browser ────────────────────────────────────────────────────

export function LocalFileBrowser({ onSelectFile, onClose }: BaseFileBrowserProps) {
  const [files, setFiles] = useState<any[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [loading, setLoading] = useState(false)

  const loadFiles = async (path: string = '.') => {
    setLoading(true)
    try {
      const response = await fetch('/api/browse-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      })
      const data = await response.json()
      setFiles(data.files || [])
    } catch (err) {
      console.error('Failed to load local files:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFiles(currentPath)
  }, [])

  const handleFileClick = (file: any) => {
    if (file.type === 'dir') {
      const newPath = currentPath ? `${currentPath}/${file.name}` : file.name
      setCurrentPath(newPath)
      loadFiles(newPath)
    } else {
      const fullPath = currentPath ? `local/${currentPath}/${file.name}` : `local/${file.name}`
      onSelectFile(fullPath)
    }
  }

  const handleBack = () => {
    if (currentPath) {
      const parts = currentPath.split('/')
      parts.pop()
      const newPath = parts.join('/')
      setCurrentPath(newPath)
      loadFiles(newPath)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-semibold text-white">📁 Local Files</span>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Current path */}
      {currentPath && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border-b border-white/10">
          <button
            onClick={handleBack}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            ← Back
          </button>
          <span className="text-xs text-zinc-500">/{currentPath}</span>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-500">
            Loading...
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-500">
            No files found
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {files.map((file, idx) => (
              <button
                key={idx}
                onClick={() => handleFileClick(file)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
              >
                <span className="text-lg">{file.type === 'dir' ? '📁' : '📄'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{file.name}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Google Drive File Browser ─────────────────────────────────────────────

export function GDriveFileBrowser({ onSelectFile, onClose }: BaseFileBrowserProps) {
  const [files, setFiles] = useState<any[]>([])
  const [folderId, setFolderId] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const { googleAuthStatus, checkGoogleAuth } = useChatStore()

  const loadFiles = async (folderId?: string) => {
    setLoading(true)
    try {
      const response = await fetch('/api/browse-gdrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      })
      const data = await response.json()
      setFiles(data.files || [])
    } catch (err) {
      console.error('Failed to load Google Drive files:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkGoogleAuth()
  }, [])

  useEffect(() => {
    if (googleAuthStatus === 'authenticated') {
      loadFiles(folderId)
    }
  }, [googleAuthStatus])

  const handleFileClick = (file: any) => {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      setFolderId(file.id)
      loadFiles(file.id)
    } else {
      onSelectFile(`gdrive/${file.id}`)
    }
  }

  const handleBack = () => {
    setFolderId(undefined)
    loadFiles()
  }

  // Show auth component if not authenticated
  if (googleAuthStatus !== 'authenticated') {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-sm font-semibold text-white">☁️ Google Drive</span>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Auth section */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <div className="text-5xl mb-2">☁️</div>
          <h3 className="text-lg font-semibold text-white">Connect Google Drive</h3>
          <p className="text-sm text-zinc-400 text-center max-w-xs">
            Sign in with your Google account to browse and access your Drive files
          </p>
          <GoogleDriveSetup compact />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-semibold text-white">☁️ Google Drive</span>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Current path */}
      {folderId && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border-b border-white/10">
          <button
            onClick={handleBack}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            ← Back
          </button>
          <span className="text-xs text-zinc-500">My Drive</span>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-zinc-500">
            Loading...
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-500">
            No files found
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {files.map((file, idx) => (
              <button
                key={idx}
                onClick={() => handleFileClick(file)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
              >
                <span className="text-lg">
                  {file.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{file.name}</div>
                  <div className="text-xs text-zinc-500 truncate">{file.mimeType}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
