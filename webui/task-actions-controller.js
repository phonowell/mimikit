import { UI_TEXT } from './system-text.js'
import { buildTaskArchiveViewerUrl } from './archive-viewer-url.js'
import { createToastController } from './toast.js'
import { runCopyTaskIdAction } from './task-actions-copy-id.js'
import { createTaskActionsMenuController } from './task-actions-menu.js'
import { requestTaskAction } from './task-actions-request.js'

export const bindTaskActionsController = (tasksList, options = {}) => {
  if (!(tasksList instanceof HTMLElement)) return () => {}

  const taskDelete = options.taskDeleteController
  const toast = createToastController()
  const taskMenus = createTaskActionsMenuController({ tasksList })

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

  const runActionButton = (button, event) => {
    if (!(button instanceof HTMLButtonElement)) return false
    event.preventDefault()
    event.stopPropagation()
    taskMenus.closeAll()
    if (button.disabled) return true

    const action = button.getAttribute('data-task-action-inline') || ''
    const taskId = button.getAttribute('data-task-id') || ''

    if (action === 'copy-id') {
      void runCopyTaskIdAction({ button, taskId, toast })
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
      taskMenus.closeAll()
      if (!expanded) taskMenus.open(actions)
      return
    }

    const button = target.closest('[data-task-action-inline]')
    if (button instanceof HTMLButtonElement) {
      runActionButton(button, event)
      return
    }

    taskMenus.closeAll()
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
    const actionButton =
      target instanceof Element ? target.closest('[data-task-action-inline]') : null
    if (actionButton instanceof HTMLButtonElement) {
      runActionButton(actionButton, event)
      return
    }
    if (taskMenus.isClickInsideMenu(target)) return
    if (taskMenus.isClickInsideList(target)) return
    taskMenus.closeAll()
  }

  const onDocumentKeydown = (event) => {
    if (event.key !== 'Escape') return
    taskMenus.onEscape()
  }

  const unbindMenus = taskMenus.bind()
  tasksList.addEventListener('click', onListClick)
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)

  return () => {
    toast.dispose()
    unbindMenus()
    tasksList.removeEventListener('click', onListClick)
    document.removeEventListener('click', onDocumentClick)
    document.removeEventListener('keydown', onDocumentKeydown)
  }
}
