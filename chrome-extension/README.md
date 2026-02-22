# LLM MultiTable - Chrome Extension

This Chrome extension enables seamless Google Drive authentication for LLM MultiTable.

## 🚀 Installation

### Step 1: Get Google OAuth Client ID

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **Google Drive API**:
   - Go to **APIs & Services** → **Library**
   - Search for "Google Drive API" → Enable
4. Create OAuth credentials:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Chrome Extension**
   - Name: `LLM MultiTable Extension`
5. Copy the **Client ID** (format: `xxx.apps.googleusercontent.com`)

### Step 2: Configure Extension

1. Open `chrome-extension/manifest.json`
2. Replace `YOUR_CLIENT_ID` with your actual Client ID:
   ```json
   "oauth2": {
     "client_id": "123456789-abcdefg.apps.googleusercontent.com",
     ...
   }
   ```

### Step 3: Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder from this repo
5. The extension should now appear in your extensions list

### Step 4: Authenticate

1. Click the extension icon in Chrome toolbar
2. Click **"Sign in with Google"**
3. Authorize the app with your Google account
4. Done! The extension will now bridge credentials to LLM MultiTable

## 🔧 Usage

Once installed and authenticated:

1. Open LLM MultiTable at `http://localhost:5173`
2. The app will automatically detect the extension
3. Click **"Connect Google Drive"** in the toolbar
4. Google Drive tools will be available in chat sessions

## 🛠️ How It Works

1. **Extension** handles Google OAuth using Chrome's `identity` API
2. **Content script** bridges authentication between extension and web app
3. **Web app** receives OAuth token via `postMessage`
4. **Backend** uses token to access Google Drive on behalf of user

## 📁 Extension Structure

```
chrome-extension/
├── manifest.json       # Extension configuration
├── background.js       # OAuth handling (service worker)
├── content.js          # Bridge between extension and app
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic
└── icon*.png           # Extension icons
```

## 🔒 Permissions

The extension requires:
- `identity` - For Google OAuth
- `storage` - To store auth tokens locally
- `http://localhost:5173/*` - To inject content script
- `http://localhost:3001/*` - To communicate with backend

## 🐛 Troubleshooting

**Extension not detected:**
- Make sure extension is loaded in `chrome://extensions/`
- Refresh the LLM MultiTable page

**Authentication fails:**
- Check that Client ID in `manifest.json` is correct
- Ensure Google Drive API is enabled in Cloud Console
- Try clearing extension storage: Right-click extension → Options → Sign Out

**Tools not working:**
- Check that you're signed in (click extension icon to verify)
- Make sure MCP tools are enabled (🔧 toggle in chat)
