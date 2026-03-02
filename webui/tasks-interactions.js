import { UI_TEXT } from './system-text.js'

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

const requestCancel = async (taskId, button) => {
  if (!taskId) return
  const originalText = button?.textContent || 'cancel'
  const originalLabel = button?.getAttribute('aria-label') || ''
  const originalTitle = button?.getAttribute('title') || ''
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
    button.setAttribute('aria-label', UI_TEXT.cancelingTask)
    button.setAttribute('title', UI_TEXT.cancelingTask)
  }
  try {
    const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
    })
    if (!res.ok) {
      let data = null
      try {
        data = await res.json()
      } catch {
        data = null
      }
      throw new Error(data?.error || 'Failed to cancel task')
    }
    restoreButton()
  } catch (error) {
    restoreButton()
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[webui] cancel task failed', message)
  }
}

export const bindTaskInteractions = (tasksList) => {
  if (!tasksList) return () => {}

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

    const button = target.closest('[data-task-cancel-inline="true"]')
    if (button instanceof HTMLButtonElement) {
      event.preventDefault()
      event.stopPropagation()
      closeAllTaskActions(tasksList)
      if (button.disabled) return
      const taskId = button.getAttribute('data-task-id') || ''
      void requestCancel(taskId, button)
      return
    }

    closeAllTaskActions(tasksList)

    const link = target.closest('.task-link')
    if (!link) return
    const openable = link.getAttribute('data-archive-openable') === 'true'
    if (!openable) return
    event.preventDefault()
    const taskId = link.getAttribute('data-task-id') || ''
    const archiveUrl = `/api/tasks/${encodeURIComponent(taskId)}/archive`
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
    tasksList.removeEventListener('click', onListClick)
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onDocumentKeydown)
  }
}
