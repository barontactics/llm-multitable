import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

// ─── Google Drive OAuth2 Setup ────────────────────────────────────────────

let oauth2Client: OAuth2Client | null = null
const userClients = new Map<string, OAuth2Client>() // sessionId -> OAuth2Client

export function initGoogleAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback'

  if (!clientId || !clientSecret) {
    console.warn('⚠️  Google Drive credentials not found. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env')
    return null
  }

  oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

  // If refresh token is available, set it
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (refreshToken) {
    oauth2Client.setCredentials({ refresh_token: refreshToken })
    console.log('✅ Google Drive authentication initialized')
  } else {
    console.warn('⚠️  No GOOGLE_REFRESH_TOKEN found. Run OAuth flow to get one.')
  }

  return oauth2Client
}

export function getAuthClient(): OAuth2Client | null {
  return oauth2Client
}

export function getAuthUrl(): string {
  if (!oauth2Client) {
    throw new Error('OAuth2 client not initialized')
  }

  const scopes = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file',
  ]

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  })
}

export async function getTokenFromCode(code: string) {
  if (!oauth2Client) {
    throw new Error('OAuth2 client not initialized')
  }

  const { tokens } = await oauth2Client.getToken(code)
  oauth2Client.setCredentials(tokens)
  return tokens
}

// ─── Per-user session auth ────────────────────────────────────────────────

export function createUserClient(sessionId: string, tokens: any): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google/callback'

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured')
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  client.setCredentials(tokens)
  userClients.set(sessionId, client)
  return client
}

export function getUserClient(sessionId: string): OAuth2Client | null {
  return userClients.get(sessionId) || null
}

export function removeUserClient(sessionId: string) {
  userClients.delete(sessionId)
}