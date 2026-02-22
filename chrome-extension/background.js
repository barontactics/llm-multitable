// Background service worker for OAuth handling

// Listen for authentication requests from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'authenticate') {
    authenticateWithGoogle()
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }))
    return true // Keep message channel open for async response
  }

  if (request.action === 'getAuthStatus') {
    getAuthStatus()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ authenticated: false, error: error.message }))
    return true
  }

  if (request.action === 'signOut') {
    signOut()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }))
    return true
  }
})

async function authenticateWithGoogle() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      if (!token) {
        reject(new Error('No token received'))
        return
      }

      try {
        // Get user info
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${token}` }
        })
        const userInfo = await userInfoResponse.json()

        // Store credentials
        await chrome.storage.local.set({
          googleToken: token,
          googleEmail: userInfo.email,
          authenticatedAt: Date.now()
        })

        resolve({
          token,
          email: userInfo.email
        })
      } catch (error) {
        reject(error)
      }
    })
  })
}

async function getAuthStatus() {
  const data = await chrome.storage.local.get(['googleToken', 'googleEmail', 'authenticatedAt'])

  if (!data.googleToken) {
    return { authenticated: false }
  }

  // Check if token is still valid (test with API call)
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${data.googleToken}` }
    })

    if (response.ok) {
      return {
        authenticated: true,
        email: data.googleEmail,
        token: data.googleToken
      }
    } else {
      // Token expired, clear it
      await chrome.storage.local.remove(['googleToken', 'googleEmail', 'authenticatedAt'])
      return { authenticated: false }
    }
  } catch (error) {
    return { authenticated: false }
  }
}

async function signOut() {
  const data = await chrome.storage.local.get(['googleToken'])

  if (data.googleToken) {
    // Revoke token
    chrome.identity.removeCachedAuthToken({ token: data.googleToken }, () => {
      chrome.storage.local.remove(['googleToken', 'googleEmail', 'authenticatedAt'])
    })
  }
}
