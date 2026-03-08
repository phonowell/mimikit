import { UI_TEXT } from './system-text.js'
import { buildTaskArchiveViewerUrl } from './archive-viewer-url.js'
import { copyTaskIdToClipboard } from './tasks-copy-id.js'

const resolveActionsElements = (actions) => {
  if (!(actions instanceof Element)) return null
  const toggle = actions.querySelector('[data-task-more-toggle]')
  const menu = actions.querySelector('.task-more-menu')
  if (!(toggle instanceof HTMLButtonElement)) return null
  if (!(menu instanceof HTMLElement)) return null
  return { toggle, menu }
}

const closeTaskActions = (actions) => {
  const elements = resolveActionsElements(actions)
  if (!elements) return
  elements.toggle.setAttribute('aria-expanded', 'false')
  elements.menu.hidden = true
}

const openTaskActions = (actions) => {
  const elements = resolveActionsElements(actions)
  if (!elements) return
  elements.toggle.setAttribute('aria-expanded', 'true')
  elements.menu.hidden = false
}

const closeAllTaskActions = (tasksList) => {
  if (!tasksList) return
  const actions = tasksList.querySelectorAll('.task-item-actions')
  for (const item of actions) closeTaskActions(item)
}

const TASK_ACTION_ENDPOINT = Object.freeze({
  cancel: 'cancel',
  delete: 'delete',
  pause: 'pause',
  resume: 'resume',
})

const TASK_ACTION_BUSY_TEXT = Object.freeze({
  cancel: UI_TEXT.cancelingTask,
  'copy-id': UI_TEXT.copyingTaskId,
  delete: UI_TEXT.deletingTask,
  pause: UI_TEXT.pausingTask,
  resume: UI_TEXT.resumingTask,
})

const FEEDBACK_HIDE_DELAY_MS = 2800

const requestTaskAction = async (taskId, action, button) => {
  if (!taskId) return
  const endpoint = TASK_ACTION_ENDPOINT[action]
  if (!endpoint) return
  const originalText = button?.textContent || action
  const originalLabel = button?.getAttribute('aria-label') || ''
  const originalTitle = button?.getAttribute('title') || ''
  const busyText = TASK_ACTION_BUSY_TEXT[action] || 'Working'
  const restoreButton = () => {
    if (!button) return
    button.disabled = false
    button.textContent = originalText
    if (originalLabel) button.setAttribute('aria-label', originalLabel)
    if (originalTitle) button.setAttribute('title', originalTitle)
  }
  if (button) {
    button.disabled = true
    button.textContent = '…'
    button.setAttribute('aria-label', busyText)
    button.setAttribute('title', busyText)
  }
  try {
    const res = await fetch(
      `/api/tasks/${encodeURIComponent(taskId)}/${endpoint}`,
      {
        method: 'POST',
      },
    )
    if (!res.ok) {
      let data = null
      try {
        data = await res.json()
      } catch {
        data = null
      }
      throw new Error(data?.error || `Failed to ${action} task`)
    }
    restoreButton()
  } catch (error) {
    restoreButton()
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[webui] ${action} task failed`, message)
  }
}

const createTaskFeedback = (feedbackEl) => {
  let hideTimer = null

  const clearHideTimer = () => {
    if (!hideTimer) return
    window.clearTimeout(hideTimer)
    hideTimer = null
  }

  const show = (state, message) => {
    if (!(feedbackEl instanceof HTMLElement)) return
    const text = typeof message === 'string' ? message.trim() : ''
    if (!text) return
    clearHideTimer()
    feedbackEl.hidden = false
    feedbackEl.dataset.state = state || ''
    feedbackEl.textContent = text
    hideTimer = window.setTimeout(() => {
      feedbackEl.hidden = true
      feedbackEl.textContent = ''
      feedbackEl.dataset.state = ''
      hideTimer = null
    }, FEEDBACK_HIDE_DELAY_MS)
  }

  const dispose = () => {
    clearHideTimer()
  }

  return { show, dispose }
}

export const bindTaskInteractions = (tasksList, options = {}) => {
  if (!tasksList) return () => {}
  const taskDelete = options.taskDeleteController
  const feedback = createTaskFeedback(options.feedbackEl)

  const requestTaskDeleteConfirm = async (taskId) => {
    if (taskDelete?.requestConfirmTaskDelete)
      return taskDelete.requestConfirmTaskDelete(taskId)
    return (
      typeof window === 'undefined' ||
      typeof window.confirm !== 'function' ||
      window.confirm(UI_TEXT.deleteTaskConfirmPrompt)
    )
  }

  const runTaskDeleteRequest = async (run) => {
    if (taskDelete?.wrapDeleteRequest) return taskDelete.wrapDeleteRequest(run)
    return run()
  }

  const onListClick = (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const toggle = target.closest('[data-task-more-toggle]')
    if (toggle instanceof HTMLButtonElement) {
      event.preventDefault()
      event.stopPropagation()
      const actions = toggle.closest('.task-item-actions')
      if (!(actions instanceof HTMLElement)) return
      const expanded = toggle.getAttribute('aria-expanded') === 'true'
      closeAllTaskActions(tasksList)
      if (!expanded) openTaskActions(actions)
      return
    }

    const button = target.closest('[data-task-action-inline]')
    if (button instanceof HTMLButtonElement) {
      event.preventDefault()
      event.stopPropagation()
      closeAllTaskActions(tasksList)
      if (button.disabled) return
      const action = button.getAttribute('data-task-action-inline') || ''
      const taskId = button.getAttribute('data-task-id') || ''
      if (action === 'copy-id') {
        void (async () => {
          const originalText = button.textContent || UI_TEXT.copyTaskIdAction
          const originalLabel = button.getAttribute('aria-label') || ''
          const originalTitle = button.getAttribute('title') || ''
          const busyText = TASK_ACTION_BUSY_TEXT[action] || 'Working'
          button.disabled = true
          button.textContent = '…'
          button.setAttribute('aria-label', busyText)
          button.setAttribute('title', busyText)
          const result = await copyTaskIdToClipboard(taskId)
          button.disabled = false
          button.textContent = originalText
          if (originalLabel) button.setAttribute('aria-label', originalLabel)
          if (originalTitle) button.setAttribute('title', originalTitle)
          if (result.ok) feedback.show('success', result.message)
          else feedback.show('error', result.message)
        })()
        return
      }
      if (action === 'delete') {
        void (async () => {
          const confirmed = await requestTaskDeleteConfirm(taskId)
          if (!confirmed) return
          await runTaskDeleteRequest(() => requestTaskAction(taskId, action, button))
        })()
        return
      }
      void requestTaskAction(taskId, action, button)
      return
    }

    closeAllTaskActions(tasksList)

    const link = target.closest('.task-link')
    if (!link) return
    const openable = link.getAttribute('data-archive-openable') === 'true'
    if (!openable) return
    event.preventDefault()
    const taskId = link.getAttribute('data-task-id') || ''
    const archiveUrl = buildTaskArchiveViewerUrl(taskId)
    const opened = window.open(archiveUrl, '_blank', 'noopener,noreferrer')
    if (!opened) console.warn('[webui] open task archive failed', 'popup blocked')
  }

  const onDocumentClick = (event) => {
    const target = event.target
    if (!(target instanceof Node)) return
    if (tasksList.contains(target)) return
    closeAllTaskActions(tasksList)
  }

  const onDocumentKeydown = (event) => {
    if (event.key !== 'Escape') return
    closeAllTaskActions(tasksList)
  }

  tasksList.addEventListener('click', onListClick)
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)

  return () => {
    feedback.dispose()
    tasksList.removeEventListener('click', onListClick)
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onDocumentKeydown)
  }
}
