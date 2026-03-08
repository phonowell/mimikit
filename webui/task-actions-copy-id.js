import { UI_TEXT } from './system-text.js'
import { copyTaskIdToClipboard } from './tasks-copy-id.js'
import { TASK_ACTION_BUSY_TEXT } from './task-actions-config.js'

export const runCopyTaskIdAction = async ({ button, taskId, toast }) => {
  if (!(button instanceof HTMLButtonElement)) return false
  const originalText = button.textContent || UI_TEXT.copyTaskIdAction
  const originalLabel = button.getAttribute('aria-label') || ''
  const originalTitle = button.getAttribute('title') || ''
  const busyText = TASK_ACTION_BUSY_TEXT['copy-id'] || 'Working'

  button.disabled = true
  button.textContent = '…'
  button.setAttribute('aria-label', busyText)
  button.setAttribute('title', busyText)

  const result = await copyTaskIdToClipboard(taskId)

  button.disabled = false
  button.textContent = originalText
  if (originalLabel) button.setAttribute('aria-label', originalLabel)
  else button.removeAttribute('aria-label')
  if (originalTitle) button.setAttribute('title', originalTitle)
  else button.removeAttribute('title')

  toast?.show(result.message, result.ok ? 'success' : 'error')
  return result.ok
}
