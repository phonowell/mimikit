import { createDialogController } from './dialog.js'
import { createElapsedTicker, renderTasks } from './tasks-view.js'

const TASK_POLL_MS = 5000

export function bindTasksPanel({
  tasksList,
  tasksDialog,
  tasksOpenBtn,
  tasksCloseBtn,
}) {
  if (!tasksList) return
  let pollTimer = null
  let isPolling = false
  const elapsedTicker = createElapsedTicker(tasksList)

  const startPolling = () => {
    if (isPolling) return
    isPolling = true
    elapsedTicker.start()
    loadTasks()
  }

  const stopPolling = () => {
    isPolling = false
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
    elapsedTicker.stop()
  }

  async function loadTasks() {
    if (!isPolling) return
    if (!tasksList) return
    try {
      const res = await fetch('/api/tasks?limit=200')
      if (!res.ok) throw new Error('Failed to load tasks')
      const data = await res.json()
      renderTasks(tasksList, data)
      elapsedTicker.update()
    } catch (error) {
      tasksList.innerHTML = ''
      const empty = document.createElement('li')
      empty.className = 'tasks-empty'
      const article = document.createElement('article')
      const message = error instanceof Error ? error.message : String(error)
      article.textContent = message
      empty.appendChild(article)
      tasksList.appendChild(empty)
    }

    if (!isPolling) return
    pollTimer = window.setTimeout(loadTasks, TASK_POLL_MS)
  }

  async function requestCancel(taskId, button) {
    if (!taskId) return
    const originalText = button?.textContent || ''
    if (button) {
      button.disabled = true
      button.textContent = 'Canceling...'
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
        } catch (error) {
          data = null
        }
        throw new Error(data?.error || 'Failed to cancel task')
      }
      if (pollTimer) {
        clearTimeout(pollTimer)
        pollTimer = null
      }
      await loadTasks()
    } catch (error) {
      if (button) {
        button.disabled = false
        button.textContent = originalText || 'Cancel'
      }
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[webui] cancel task failed', message)
    }
  }

  tasksList.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

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

    const button = target.closest('.task-cancel')
    if (!button) return
    event.preventDefault()
    const taskId = button.getAttribute('data-task-id') || ''
    void requestCancel(taskId, button)
  })

  const dialogEnabled = Boolean(tasksDialog && tasksOpenBtn)
  const dialog = dialogEnabled
    ? createDialogController({
        dialog: tasksDialog,
        trigger: tasksOpenBtn,
        focusOnOpen: tasksCloseBtn,
        focusOnClose: tasksOpenBtn,
        onOpen: startPolling,
        onAfterClose: stopPolling,
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
    startPolling()
  }

  return () => {
    stopPolling()
    if (dialogEnabled && dialog) {
      tasksOpenBtn.removeEventListener('click', onOpen)
      if (tasksCloseBtn) tasksCloseBtn.removeEventListener('click', onClose)
      tasksDialog.removeEventListener('click', onDialogClick)
      tasksDialog.removeEventListener('cancel', onDialogCancel)
      tasksDialog.removeEventListener('close', onDialogClose)
    }
  }
}
