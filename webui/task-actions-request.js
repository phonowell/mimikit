import { TASK_ACTION_BUSY_TEXT, TASK_ACTION_ENDPOINT } from './task-actions-config.js'

const withButtonBusyState = (button, action, run) => {
  if (!(button instanceof HTMLButtonElement)) return run()
  const originalText = button.textContent || action
  const originalLabel = button.getAttribute('aria-label') || ''
  const originalTitle = button.getAttribute('title') || ''
  const busyText = TASK_ACTION_BUSY_TEXT[action] || 'Working'

  button.disabled = true
  button.textContent = '…'
  button.setAttribute('aria-label', busyText)
  button.setAttribute('title', busyText)

  const restore = () => {
    button.disabled = false
    button.textContent = originalText
    if (originalLabel) button.setAttribute('aria-label', originalLabel)
    else button.removeAttribute('aria-label')
    if (originalTitle) button.setAttribute('title', originalTitle)
    else button.removeAttribute('title')
  }

  return Promise.resolve()
    .then(run)
    .finally(restore)
}

export const requestTaskAction = async (taskId, action, button) => {
  if (!taskId) return
  const endpoint = TASK_ACTION_ENDPOINT[action]
  if (!endpoint) return

  try {
    await withButtonBusyState(button, action, async () => {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/${endpoint}`, {
        method: 'POST',
      })
      if (response.ok) return
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      throw new Error(payload?.error || `Failed to ${action} task`)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[webui] ${action} task failed`, message)
  }
}
