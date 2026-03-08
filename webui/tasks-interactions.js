import { UI_TEXT } from './system-text.js'
import { buildTaskArchiveViewerUrl } from './archive-viewer-url.js'
import { copyTaskIdToClipboard } from './tasks-copy-id.js'
import { createPageMenuController } from './page-menu.js'
import { createToastController } from './toast.js'
const resolveActionsElements = (actions) => {
  if (!(actions instanceof Element)) return null
  const toggle = actions.querySelector('[data-task-more-toggle]')
  const menu = actions.querySelector('.task-more-menu')
  if (!(toggle instanceof HTMLButtonElement)) return null
  if (!(menu instanceof HTMLElement)) return null
  return {
    toggle,
    menu,
    pageMenuController: createPageMenuController({
      trigger: toggle,
      menu,
    }),
  }
}

const actionsElementsCache = new WeakMap()

const getActionsElements = (actions) => {
  if (!(actions instanceof HTMLElement)) return null
  const cached = actionsElementsCache.get(actions)
  if (cached) return cached
  const resolved = resolveActionsElements(actions)
  if (!resolved) return null
  actionsElementsCache.set(actions, resolved)
  return resolved
}

const closeTaskActions = (actions) => {
  const elements = getActionsElements(actions)
  if (!elements) return
  elements.pageMenuController.close()
  elements.toggle.setAttribute('aria-expanded', 'false')
}

const closeTaskActionsWithFocus = (actions) => {
  const elements = getActionsElements(actions)
  if (!elements) return
  elements.pageMenuController.close()
  elements.toggle.setAttribute('aria-expanded', 'false')
  if (typeof elements.toggle.focus === 'function') elements.toggle.focus()
}

const openTaskActions = (actions) => {
  const elements = getActionsElements(actions)
  if (!elements) return
  elements.pageMenuController.open()
  elements.toggle.setAttribute('aria-expanded', 'true')
}

const closeAllTaskActions = (tasksList) => {
  if (!tasksList) return
  const actions = tasksList.querySelectorAll('.task-item-actions')
  for (const item of actions) closeTaskActions(item)
}

const disposeTaskActions = (actions) => {
  const elements = getActionsElements(actions)
  elements?.pageMenuController?.destroy?.()
  actionsElementsCache.delete(actions)
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

export const bindTaskInteractions = (tasksList, options = {}) => {
  if (!tasksList) return () => {}
  const taskDelete = options.taskDeleteController
  const toast = createToastController()
  let activeActions = null

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

  const closeTaskActionsScoped = (actions, { focusToggle = false } = {}) => {
    if (!(actions instanceof HTMLElement)) return
    if (focusToggle) closeTaskActionsWithFocus(actions)
    else closeTaskActions(actions)
    if (activeActions === actions) activeActions = null
  }

  const closeAllTaskActionsScoped = () => {
    closeAllTaskActions(tasksList)
    activeActions = null
  }

  const onTaskActionButtonClick = (button, event) => {
    if (!(button instanceof HTMLButtonElement)) return false
    event.preventDefault()
    event.stopPropagation()
    closeAllTaskActionsScoped()
    if (button.disabled) return true
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
        if (result.ok) toast.show(result.message, 'success')
        else toast.show(result.message, 'error')
      })()
      return true
    }
    if (action === 'delete') {
      void (async () => {
        const confirmed = await requestTaskDeleteConfirm(taskId)
        if (!confirmed) return
        await runTaskDeleteRequest(() => requestTaskAction(taskId, action, button))
      })()
      return true
    }
    void requestTaskAction(taskId, action, button)
    return true
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
      closeAllTaskActionsScoped()
      if (!expanded) {
        openTaskActions(actions)
        activeActions = actions
      }
      return
    }

    const button = target.closest('[data-task-action-inline]')
    if (button instanceof HTMLButtonElement) {
      onTaskActionButtonClick(button, event)
      return
    }

    closeAllTaskActionsScoped()

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
    const taskActionBtn =
      target instanceof Element ? target.closest('[data-task-action-inline]') : null
    if (taskActionBtn instanceof HTMLButtonElement) {
      onTaskActionButtonClick(taskActionBtn, event)
      return
    }
    if (target instanceof Element && target.closest('.task-more-menu')) return
    if (tasksList.contains(target)) return
    closeAllTaskActionsScoped()
  }

  const onDocumentKeydown = (event) => {
    if (event.key !== 'Escape') return
    const openedActions = tasksList.querySelector(
      '.task-item-actions [data-task-more-toggle][aria-expanded="true"]',
    )?.closest('.task-item-actions')
    if (openedActions instanceof HTMLElement) {
      closeTaskActionsScoped(openedActions, { focusToggle: true })
      return
    }
    closeAllTaskActionsScoped()
  }

  tasksList.addEventListener('click', onListClick)
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
  const listObserver = new MutationObserver(() => {
    if (activeActions instanceof HTMLElement && !activeActions.isConnected) {
      closeTaskActionsScoped(activeActions)
      disposeTaskActions(activeActions)
      activeActions = null
    }
  })
  listObserver.observe(tasksList, {
    childList: true,
    subtree: true,
  })

  return () => {
    toast.dispose()
    listObserver.disconnect()
    if (activeActions instanceof HTMLElement) {
      disposeTaskActions(activeActions)
      activeActions = null
    }
    const actions = tasksList.querySelectorAll('.task-item-actions')
    for (const item of actions) {
      if (!(item instanceof HTMLElement)) continue
      disposeTaskActions(item)
    }
    tasksList.removeEventListener('click', onListClick)
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onDocumentKeydown)
  }
}
