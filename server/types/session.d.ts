import 'express-session'

declare module 'express-session' {
  interface SessionData {
    googleTokens?: any
    googleEmail?: string
    googleExtensionToken?: string
  }
}
