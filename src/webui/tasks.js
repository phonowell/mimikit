import { formatDateTime } from './time.js'

const TASK_POLL_MS = 5000

export function bindTasksPanel({
  tasksList,
  tasksMeta,
  tasksDialog,
  tasksOpenBtn,
  tasksCloseBtn,
}) {
  if (!tasksList || !tasksMeta) return
  let pollTimer = null
  let isPolling = false
  let isOpen = false

  function formatStatusCounts(counts) {
    const parts = []
    if (!counts) return parts
    if (counts.pending) parts.push(`${counts.pending} pending`)
    if (counts.running) parts.push(`${counts.running} running`)
    if (counts.succeeded) parts.push(`${counts.succeeded} succeeded`)
    if (counts.failed) parts.push(`${counts.failed} failed`)
    if (counts.canceled) parts.push(`${counts.canceled} canceled`)
    return parts
  }

  function startPolling() {
    if (isPolling) return
    isPolling = true
    loadTasks()
  }

  function stopPolling() {
    isPolling = false
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
  }

  function setExpanded(nextOpen) {
    if (!tasksOpenBtn) return
    tasksOpenBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false')
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
      renderTasks(data)
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

  function renderTasks(data) {
    if (!tasksList || !tasksMeta) return
    const tasks = data?.tasks || []
    const counts = data?.counts || {}
    const parts = [`${tasks.length} tasks`, ...formatStatusCounts(counts)]
    tasksMeta.textContent = parts.join(' · ')
    tasksList.innerHTML = ''

    if (tasks.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'tasks-empty'
      const article = document.createElement('article')
      article.textContent = 'No tasks'
      empty.appendChild(article)
      tasksList.appendChild(empty)
      return
    }

    for (const task of tasks) {
      const item = document.createElement('li')
      item.className = 'task-item'
      item.dataset.status = task.status || 'pending'

      const link = document.createElement('a')
      link.className = 'task-link'
      link.href = `#task-${task.id}`
      link.dataset.status = task.status || 'pending'

      const title = document.createElement('span')
      title.className = 'task-title'
      title.textContent = task.title || task.id

      const meta = document.createElement('small')
      meta.className = 'task-meta'

      const status = document.createElement('span')
      status.className = 'task-status'
      status.textContent = task.status || 'pending'
      meta.appendChild(status)

      if (task.createdAt) {
        const timeEl = document.createElement('span')
        timeEl.className = 'task-time'
        timeEl.textContent = `created ${formatDateTime(task.createdAt)}`
        meta.appendChild(timeEl)
      }

      const id = document.createElement('span')
      id.className = 'task-id'
      id.textContent = `id:${task.id}`
      meta.appendChild(id)

      link.appendChild(title)
      link.appendChild(meta)
      item.appendChild(link)
      tasksList.appendChild(item)
    }
  }

  function openDialog() {
    if (!tasksDialog) return
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
    if (typeof tasksDialog.close === 'function') {
      tasksDialog.close()
    } else {
      tasksDialog.removeAttribute('open')
    }
    isOpen = false
    setExpanded(false)
    stopPolling()
    if (tasksOpenBtn) tasksOpenBtn.focus()
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
    isOpen = false
    setExpanded(false)
    stopPolling()
    if (tasksOpenBtn) tasksOpenBtn.focus()
  }

  if (dialogEnabled) {
    setExpanded(isOpen)
    tasksOpenBtn.addEventListener('click', onOpen)
    if (tasksCloseBtn) tasksCloseBtn.addEventListener('click', onClose)
    tasksDialog.addEventListener('click', onDialogClick)
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
      tasksDialog.removeEventListener('close', onDialogClose)
    }
  }
}
