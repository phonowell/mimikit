import { createElapsedTicker, renderTasks } from './tasks-view.js'

const TASK_POLL_MS = 5000

export function bindTasksPanel({
  tasksList,
  tasksMeta,
  tasksDialog,
  tasksOpenBtn,
  tasksCloseBtn,
}) {
  if (!tasksList || !tasksMeta) return
  const closeAnimationMs = 140
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let pollTimer = null
  let isPolling = false
  let isOpen = false
  let closeTimer = null
  let closeAnimationHandler = null
  const elapsedTicker = createElapsedTicker(tasksList)

  function startPolling() {
    if (isPolling) return
    isPolling = true
    elapsedTicker.start()
    loadTasks()
  }

  function stopPolling() {
    isPolling = false
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
    elapsedTicker.stop()
  }

  function setExpanded(nextOpen) {
    if (!tasksOpenBtn) return
    tasksOpenBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false')
  }

  function clearClosingState() {
    if (!tasksDialog) return
    tasksDialog.classList.remove('is-closing')
    if (closeAnimationHandler) {
      tasksDialog.removeEventListener('animationend', closeAnimationHandler)
      closeAnimationHandler = null
    }
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
  }

  function finalizeClose() {
    if (!isOpen) return
    isOpen = false
    setExpanded(false)
    stopPolling()
    clearClosingState()
    if (tasksOpenBtn) tasksOpenBtn.focus()
  }

  function performClose() {
    if (!tasksDialog || !isOpen) return
    if (typeof tasksDialog.close === 'function') {
      tasksDialog.close()
    } else {
      tasksDialog.removeAttribute('open')
      finalizeClose()
    }
  }

  async function loadTasks() {
    if (!isPolling) return
    if (!tasksList || !tasksMeta) return
    tasksMeta.textContent = 'Loading...'
    tasksList.innerHTML = ''
    try {
      const res = await fetch('/api/tasks?limit=200')
      if (!res.ok) throw new Error('Failed to load tasks')
      const data = await res.json()
      renderTasks(tasksList, tasksMeta, data)
      elapsedTicker.update()
    } catch (error) {
      tasksMeta.textContent = 'Failed to load tasks'
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
    const button = target.closest('.task-cancel')
    if (!button) return
    event.preventDefault()
    const taskId = button.getAttribute('data-task-id') || ''
    void requestCancel(taskId, button)
  })

  function openDialog() {
    if (!tasksDialog) return
    if (tasksDialog.classList.contains('is-closing')) {
      clearClosingState()
      return
    }
    if (isOpen) return
    if (typeof tasksDialog.showModal === 'function') {
      if (!tasksDialog.open) tasksDialog.showModal()
    } else {
      tasksDialog.setAttribute('open', '')
    }
    isOpen = true
    setExpanded(true)
    startPolling()
    if (tasksCloseBtn) {
      window.requestAnimationFrame(() => {
        tasksCloseBtn.focus()
      })
    }
  }

  function closeDialog() {
    if (!tasksDialog) return
    if (!isOpen) return
    if (tasksDialog.classList.contains('is-closing')) return
    if (prefersReducedMotion) {
      performClose()
      return
    }
    tasksDialog.classList.add('is-closing')
    const onAnimationEnd = (event) => {
      if (event.target !== tasksDialog) return
      if (closeAnimationHandler) {
        tasksDialog.removeEventListener('animationend', closeAnimationHandler)
        closeAnimationHandler = null
      }
      if (closeTimer) {
        clearTimeout(closeTimer)
        closeTimer = null
      }
      performClose()
    }
    closeAnimationHandler = onAnimationEnd
    tasksDialog.addEventListener('animationend', onAnimationEnd)
    closeTimer = window.setTimeout(() => {
      if (closeAnimationHandler) {
        tasksDialog.removeEventListener('animationend', closeAnimationHandler)
        closeAnimationHandler = null
      }
      performClose()
    }, closeAnimationMs + 40)
  }

  const dialogEnabled = Boolean(tasksDialog && tasksOpenBtn)
  const onOpen = (event) => {
    event.preventDefault()
    openDialog()
  }
  const onClose = (event) => {
    event.preventDefault()
    closeDialog()
  }
  const onDialogClick = (event) => {
    if (event.target === tasksDialog) closeDialog()
  }
  const onDialogClose = () => {
    if (!isOpen) return
    finalizeClose()
  }
  const onDialogCancel = (event) => {
    event.preventDefault()
    closeDialog()
  }

  if (dialogEnabled) {
    setExpanded(isOpen)
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
    if (dialogEnabled) {
      tasksOpenBtn.removeEventListener('click', onOpen)
      if (tasksCloseBtn) tasksCloseBtn.removeEventListener('click', onClose)
      tasksDialog.removeEventListener('click', onDialogClick)
      tasksDialog.removeEventListener('cancel', onDialogCancel)
      tasksDialog.removeEventListener('close', onDialogClose)
    }
  }
}
