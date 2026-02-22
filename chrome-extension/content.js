// Content script - bridges extension auth to the web app

// Inject auth status checker
window.addEventListener('load', () => {
  // Signal to the app that the extension is installed
  window.postMessage({ type: 'LLMMULTITABLE_EXTENSION_READY' }, '*')
})

// Listen for auth requests from the web app
window.addEventListener('message', async (event) => {
  // Only accept messages from the same window
  if (event.source !== window) return

  if (event.data.type === 'LLMMULTITABLE_AUTH_REQUEST') {
    // Request authentication from background script
    chrome.runtime.sendMessage({ action: 'authenticate' }, (response) => {
      if (response.success) {
        // Send credentials back to web app
        window.postMessage({
          type: 'LLMMULTITABLE_AUTH_SUCCESS',
          token: response.token,
          email: response.email
        }, '*')
      } else {
        window.postMessage({
          type: 'LLMMULTITABLE_AUTH_ERROR',
          error: response.error
        }, '*')
      }
    })
  }

  if (event.data.type === 'LLMMULTITABLE_AUTH_STATUS') {
    chrome.runtime.sendMessage({ action: 'getAuthStatus' }, (response) => {
      window.postMessage({
        type: 'LLMMULTITABLE_AUTH_STATUS_RESPONSE',
        ...response
      }, '*')
    })
  }

  if (event.data.type === 'LLMMULTITABLE_SIGNOUT') {
    chrome.runtime.sendMessage({ action: 'signOut' }, (response) => {
      window.postMessage({
        type: 'LLMMULTITABLE_SIGNOUT_RESPONSE',
        success: response.success
      }, '*')
    })
  }
})
