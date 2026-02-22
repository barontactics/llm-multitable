import { useState, useEffect, useRef } from 'react'
import { useChatStore } from '../../store/chatStore'

declare global {
  interface Window {
    google?: any
  }
}

interface Props {
  compact?: boolean
}

export default function GoogleDriveSetup({ compact = false }: Props) {
  const { googleAuthStatus, googleEmail, checkGoogleAuth } = useChatStore()
  const [showWizard, setShowWizard] = useState(false)
  const [step, setStep] = useState(1)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const tokenClientRef = useRef<any>(null)

  useEffect(() => {
    checkGoogleAuth()

    // Initialize Google Identity Services Token Client
    const initTokenClient = () => {
      if (window.google) {
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '982515582462-6dijk5iqvj8jejng25s0gpqgeu7b64hs.apps.googleusercontent.com',
          scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
          callback: async (response: any) => {
            if (response.access_token) {
              try {
                await fetch('/api/google/gis-auth', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ accessToken: response.access_token }),
                })
                checkGoogleAuth()
              } catch (err) {
                console.error('Failed to send token to backend:', err)
              }
            }
          },
        })
      }
    }

    const checkInterval = setInterval(() => {
      if (window.google) {
        clearInterval(checkInterval)
        initTokenClient()
      }
    }, 100)

    return () => clearInterval(checkInterval)
  }, [])

  const handleConnect = () => {
    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken()
    }
  }

  const handleSaveCredentials = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/google/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      })

      if (res.ok) {
        setShowWizard(false)
        checkGoogleAuth()
      } else {
        alert('Failed to save credentials. Please check and try again.')
      }
    } catch (err) {
      alert('Error saving credentials')
    } finally {
      setSaving(false)
    }
  }

  // Compact button view (for ChatModal tools info section)
  if (compact) {
    if (googleAuthStatus === 'authenticated') {
      return (
        <div className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
          <span className="text-emerald-400">☁️</span>
          <span className="text-emerald-300 font-medium">Google Drive</span>
          {googleEmail && (
            <span className="text-emerald-500/70">({googleEmail})</span>
          )}
        </div>
      )
    }

    if (googleAuthStatus === 'authenticating') {
      return (
        <button
          disabled
          className="flex items-center gap-2 text-xs bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 rounded-lg cursor-wait"
        >
          <span className="animate-spin">⏳</span>
          <span className="text-blue-300">Authenticating...</span>
        </button>
      )
    }

    if (googleAuthStatus === 'error') {
      return (
        <button
          onClick={handleConnect}
          className="flex items-center gap-2 text-xs bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
        >
          <span className="text-red-400">⚠️</span>
          <span className="text-red-300">Auth Failed - Retry</span>
        </button>
      )
    }

    return (
      <button
        onClick={handleConnect}
        className="flex items-center gap-2 text-xs bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
        title="Connect Google Drive with OAuth"
      >
        <span>☁️</span>
        <span className="text-zinc-300 font-medium">Connect Google Drive</span>
      </button>
    )
  }

  // Setup wizard modal view
  return (
    <>
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-1 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-surface-1 border-b border-white/10 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">☁️ Connect Google Drive</h2>
                <p className="text-sm text-zinc-400 mt-1">Step {step} of 3</p>
              </div>
              <button
                onClick={() => setShowWizard(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Step 1: Create Google Cloud Project */}
            {step === 1 && (
              <div className="p-6 space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h3 className="text-blue-300 font-semibold mb-2">📋 Step 1: Create Google Cloud Project</h3>
                  <ol className="text-sm text-zinc-300 space-y-2 list-decimal list-inside">
                    <li>
                      Go to{' '}
                      <a
                        href="https://console.cloud.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        Google Cloud Console
                      </a>
                    </li>
                    <li>Click <strong>"Select a project"</strong> → <strong>"New Project"</strong></li>
                    <li>Enter project name (e.g., "LLM MultiTable") and click <strong>"Create"</strong></li>
                    <li>Wait for project creation to complete</li>
                  </ol>
                </div>

                <button
                  onClick={() => setStep(2)}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 rounded-lg transition-colors"
                >
                  Next: Enable Google Drive API →
                </button>
              </div>
            )}

            {/* Step 2: Enable API & Configure OAuth */}
            {step === 2 && (
              <div className="p-6 space-y-4">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                  <h3 className="text-emerald-300 font-semibold mb-2">🔧 Step 2: Enable API & Configure OAuth</h3>

                  <div className="space-y-3 text-sm text-zinc-300">
                    <div>
                      <p className="font-semibold text-emerald-400 mb-1">A. Enable Google Drive API</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>In your project, go to <strong>"APIs & Services"</strong> → <strong>"Library"</strong></li>
                        <li>Search for <strong>"Google Drive API"</strong></li>
                        <li>Click on it and press <strong>"Enable"</strong></li>
                      </ol>
                    </div>

                    <div>
                      <p className="font-semibold text-emerald-400 mb-1">B. Configure OAuth Consent Screen</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2">
                        <li>Go to <strong>"APIs & Services"</strong> → <strong>"OAuth consent screen"</strong></li>
                        <li>Select <strong>"External"</strong> and click <strong>"Create"</strong></li>
                        <li>Fill in app name: <code className="bg-black/30 px-1 rounded">LLM MultiTable</code></li>
                        <li>Add your email for support and developer contact</li>
                        <li>Click <strong>"Save and Continue"</strong></li>
                        <li>On Scopes page, click <strong>"Add or Remove Scopes"</strong></li>
                        <li>Search and select: <code className="bg-black/30 px-1 rounded">drive.readonly</code> and <code className="bg-black/30 px-1 rounded">drive.file</code></li>
                        <li>Click <strong>"Update"</strong> → <strong>"Save and Continue"</strong></li>
                        <li>Add your Gmail as a test user</li>
                        <li>Click <strong>"Save and Continue"</strong> → <strong>"Back to Dashboard"</strong></li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-zinc-300 font-medium py-3 rounded-lg transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-3 rounded-lg transition-colors"
                  >
                    Next: Create Credentials →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Create OAuth Credentials */}
            {step === 3 && (
              <div className="p-6 space-y-4">
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                  <h3 className="text-purple-300 font-semibold mb-2">🔑 Step 3: Create OAuth Client ID</h3>
                  <ol className="text-sm text-zinc-300 space-y-2 list-decimal list-inside">
                    <li>Go to <strong>"APIs & Services"</strong> → <strong>"Credentials"</strong></li>
                    <li>Click <strong>"Create Credentials"</strong> → <strong>"OAuth 2.0 Client ID"</strong></li>
                    <li>Select <strong>"Web application"</strong></li>
                    <li>Name it: <code className="bg-black/30 px-1 rounded">LLM MultiTable</code></li>
                    <li>
                      Under <strong>"Authorized redirect URIs"</strong>, click <strong>"Add URI"</strong> and paste:
                      <div className="bg-black/30 p-2 rounded mt-1 font-mono text-xs text-purple-300 break-all">
                        http://localhost:3001/api/google/callback
                      </div>
                    </li>
                    <li>Click <strong>"Create"</strong></li>
                    <li>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> and paste below:</li>
                  </ol>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Client ID
                    </label>
                    <input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="123456789-abcdefg.apps.googleusercontent.com"
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:border-purple-500/50 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      Client Secret
                    </label>
                    <input
                      type="password"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="GOCSPX-xxxxxxxxxxxxx"
                      className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:border-purple-500/50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-zinc-300 font-medium py-3 rounded-lg transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleSaveCredentials}
                    disabled={!clientId || !clientSecret || saving}
                    className="flex-1 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save & Connect ✓'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
