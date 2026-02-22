// Popup UI logic

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthStatus()

  document.getElementById('signin-btn').addEventListener('click', signIn)
  document.getElementById('signout-btn').addEventListener('click', signOut)
})

async function checkAuthStatus() {
  chrome.runtime.sendMessage({ action: 'getAuthStatus' }, (response) => {
    document.getElementById('loading').style.display = 'none'
    document.getElementById('content').style.display = 'block'

    const statusBadge = document.getElementById('status-badge')
    const emailRow = document.getElementById('email-row')
    const emailSpan = document.getElementById('email')
    const signinBtn = document.getElementById('signin-btn')
    const signoutBtn = document.getElementById('signout-btn')

    if (response.authenticated) {
      statusBadge.textContent = 'Connected'
      statusBadge.className = 'badge badge-success'

      emailRow.style.display = 'flex'
      emailSpan.textContent = response.email

      signinBtn.style.display = 'none'
      signoutBtn.style.display = 'block'
    } else {
      statusBadge.textContent = 'Not Connected'
      statusBadge.className = 'badge badge-error'

      emailRow.style.display = 'none'

      signinBtn.style.display = 'block'
      signoutBtn.style.display = 'none'
    }
  })
}

async function signIn() {
  const btn = document.getElementById('signin-btn')
  btn.disabled = true
  btn.textContent = 'Signing in...'

  chrome.runtime.sendMessage({ action: 'authenticate' }, (response) => {
    if (response.success) {
      checkAuthStatus()
    } else {
      alert('Sign in failed: ' + response.error)
      btn.disabled = false
      btn.textContent = '☁️ Sign in with Google'
    }
  })
}

async function signOut() {
  if (!confirm('Are you sure you want to sign out?')) {
    return
  }

  const btn = document.getElementById('signout-btn')
  btn.disabled = true
  btn.textContent = 'Signing out...'

  chrome.runtime.sendMessage({ action: 'signOut' }, (response) => {
    if (response.success) {
      checkAuthStatus()
    } else {
      alert('Sign out failed')
      btn.disabled = false
      btn.textContent = 'Sign Out'
    }
  })
}
