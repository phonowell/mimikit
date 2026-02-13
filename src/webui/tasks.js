import { createDialogController } from './dialog.js'
import { UI_TEXT } from './system-text.js'
import { createElapsedTicker, renderTasks } from './tasks-view.js'

const EMPTY_TASKS = { tasks: [], counts: {} }

const normalizeTasksPayload = (value) => {
  if (!value || typeof value !== 'object') return EMPTY_TASKS
  const tasks = Array.isArray(value.tasks) ? value.tasks : []
  const counts = value.counts && typeof value.counts === 'object' ? value.counts : {}
  return { tasks, counts }
}

export function bindTasksPanel({
  tasksList,
  tasksDialog,
  tasksOpenBtn,
  tasksCloseBtn,
}) {
  if (!tasksList) {
    return {
      applyTasksSnapshot: () => {},
      setDisconnected: () => {},
      dispose: () => {},
    }
  }

  let latestTasks = EMPTY_TASKS
  const elapsedTicker = createElapsedTicker(tasksList)

  const renderLatestTasks = () => {
    renderTasks(tasksList, latestTasks)
    elapsedTicker.update()
  }

  const applyTasksSnapshot = (payload) => {
    latestTasks = normalizeTasksPayload(payload)
    renderLatestTasks()
  }

  const setDisconnected = () => {
    tasksList.innerHTML = ''
    const empty = document.createElement('li')
    empty.className = 'tasks-empty'
    const article = document.createElement('article')
    article.textContent = UI_TEXT.connectionLost
    empty.appendChild(article)
    tasksList.appendChild(empty)
  }

  const startTicker = () => {
    elapsedTicker.start()
    renderLatestTasks()
  }

  const stopTicker = () => {
    elapsedTicker.stop()
  }

  async function requestCancel(taskId, button) {
    if (!taskId) return
    const originalText = button?.textContent || '✕'
    const originalLabel = button?.getAttribute('aria-label') || ''
    const originalTitle = button?.getAttribute('title') || ''
    if (button) {
      button.disabled = true
      button.textContent = '…'
      button.setAttribute('aria-label', UI_TEXT.cancelingTask)
      button.setAttribute('title', UI_TEXT.cancelingTask)
    }
    try {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(taskId)}/cancel`,
        { method: 'POST' },
      )
      if (!res.ok) {
        let data = null
        try {
          data = await res.json()
        } catch {
          data = null
        }
        throw new Error(data?.error || 'Failed to cancel task')
      }
      if (button) {
        button.disabled = false
        button.textContent = originalText
        if (originalLabel) button.setAttribute('aria-label', originalLabel)
        if (originalTitle) button.setAttribute('title', originalTitle)
      }
    } catch (error) {
      if (button) {
        button.disabled = false
        button.textContent = originalText
        if (originalLabel) button.setAttribute('aria-label', originalLabel)
        if (originalTitle) button.setAttribute('title', originalTitle)
      }
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[webui] cancel task failed', message)
    }
  }

  tasksList.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const button = target.closest('.task-cancel')
    if (button instanceof HTMLButtonElement) {
      event.preventDefault()
      event.stopPropagation()
      const taskId = button.getAttribute('data-task-id') || ''
      void requestCancel(taskId, button)
      return
    }

    const link = target.closest('.task-link')
    if (link) {
      const openable = link.getAttribute('data-archive-openable') === 'true'
      if (!openable) return
      event.preventDefault()
      const taskId = link.getAttribute('data-task-id') || ''
      const archiveUrl = `/api/tasks/${encodeURIComponent(taskId)}/archive`
      const opened = window.open(archiveUrl, '_blank', 'noopener,noreferrer')
      if (!opened) {
        console.warn('[webui] open task archive failed', 'popup blocked')
        return
      }
      return
    }
  })

  const dialogEnabled = Boolean(tasksDialog && tasksOpenBtn)
  const dialog = dialogEnabled
    ? createDialogController({
        dialog: tasksDialog,
        trigger: tasksOpenBtn,
        focusOnOpen: tasksCloseBtn,
        focusOnClose: tasksOpenBtn,
        onOpen: startTicker,
        onAfterClose: stopTicker,
      })
    : null

  const onOpen = (event) => {
    event.preventDefault()
    if (dialog) dialog.open()
  }
  const onClose = (event) => {
    event.preventDefault()
    if (dialog) dialog.close()
  }
  const onDialogClick = (event) => {
    if (dialog) dialog.handleDialogClick(event)
  }
  const onDialogClose = () => {
    if (dialog) dialog.handleDialogClose()
  }
  const onDialogCancel = (event) => {
    if (dialog) dialog.handleDialogCancel(event)
  }

  if (dialogEnabled && dialog) {
    dialog.setExpanded(false)
    tasksOpenBtn.addEventListener('click', onOpen)
    if (tasksCloseBtn) tasksCloseBtn.addEventListener('click', onClose)
    tasksDialog.addEventListener('click', onDialogClick)
    tasksDialog.addEventListener('cancel', onDialogCancel)
    tasksDialog.addEventListener('close', onDialogClose)
  } else {
    startTicker()
  }

  return {
    applyTasksSnapshot,
    setDisconnected,
    dispose: () => {
      stopTicker()
      if (dialogEnabled && dialog) {
        tasksOpenBtn.removeEventListener('click', onOpen)
        if (tasksCloseBtn) tasksCloseBtn.removeEventListener('click', onClose)
        tasksDialog.removeEventListener('click', onDialogClick)
        tasksDialog.removeEventListener('cancel', onDialogCancel)
        tasksDialog.removeEventListener('close', onDialogClose)
      }
    },
  }
}
