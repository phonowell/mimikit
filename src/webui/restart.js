export function bindRestart({ restartBtn, statusText, statusDot, messages }) {
  if (!restartBtn) return

  restartBtn.addEventListener('click', async () => {
    const skipConfirm =
      messages &&
      typeof messages.isFullyIdle === 'function' &&
      messages.isFullyIdle()
    if (!skipConfirm && !confirm('Restart server?')) return
    restartBtn.disabled = true
    if (statusText) statusText.textContent = 'restarting...'
    if (statusDot) statusDot.dataset.state = ''
    try {
      await fetch('/api/restart', { method: 'POST' })
    } catch {
      // expected: connection drops
    }

    const waitForServer = () => {
      setTimeout(async () => {
        try {
          const res = await fetch('/api/status')
          if (res.ok) {
            restartBtn.disabled = false
            if (messages) messages.start()
            return
          }
        } catch {
          // still down
        }
        waitForServer()
      }, 1000)
    }

    if (messages) messages.stop()
    waitForServer()
  })
}
