import { formatDateTime } from './time.js'

export function bindTasksModal({
  tasksBtn,
  tasksModal,
  tasksList,
  tasksMeta,
  tasksCloseBtn,
}) {
  function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  function formatUsage(usage) {
    if (!usage) return ''
    const input = asNumber(usage.input)
    const output = asNumber(usage.output)
    const total = asNumber(usage.total)
    const parts = []
    if (total !== null) {
      parts.push(`${total} tokens`)
    } else if (input !== null || output !== null) {
      const sum = (input ?? 0) + (output ?? 0)
      if (sum > 0) parts.push(`${sum} tokens`)
    }
    if (input !== null) parts.push(`in ${input}`)
    if (output !== null) parts.push(`out ${output}`)
    return parts.join(' · ')
  }

  async function loadTasks() {
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
  }

  function renderTasks(data) {
    if (!tasksList || !tasksMeta) return
    const tasks = data?.tasks || []
    const counts = data?.counts || {}
    const parts = [`${tasks.length} tasks`]
    if (counts.pending) parts.push(`${counts.pending} pending`)
    if (counts.running) parts.push(`${counts.running} running`)
    if (counts.done) parts.push(`${counts.done} done`)
    if (counts.failed) parts.push(`${counts.failed} failed`)
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

      const article = document.createElement('article')

      const title = document.createElement('div')
      title.className = 'task-title'
      title.textContent = task.title || task.id

      const meta = document.createElement('small')
      meta.className = 'task-meta'

      const status = document.createElement('span')
      status.className = 'task-status'
      status.textContent = task.status || 'pending'
      meta.appendChild(status)

      const time = task.completedAt || task.createdAt
      if (time) {
        const timeEl = document.createElement('span')
        timeEl.textContent = formatDateTime(time)
        meta.appendChild(timeEl)
      }

      const usageText = formatUsage(task.usage)
      if (usageText) {
        const usage = document.createElement('span')
        usage.textContent = usageText
        meta.appendChild(usage)
      }

      const id = document.createElement('span')
      id.textContent = `id:${task.id}`
      meta.appendChild(id)

      article.appendChild(title)
      article.appendChild(meta)
      item.appendChild(article)
      tasksList.appendChild(item)
    }
  }

  function openTasksModal() {
    if (!tasksModal) return
    if (typeof tasksModal.showModal === 'function') {
      tasksModal.showModal()
    } else {
      tasksModal.setAttribute('open', '')
    }
    document.body.classList.add('modal-open')
    loadTasks()
  }

  function closeTasksModal() {
    if (!tasksModal) return
    if (typeof tasksModal.close === 'function') {
      tasksModal.close()
    } else {
      tasksModal.removeAttribute('open')
    }
    document.body.classList.remove('modal-open')
  }

  if (tasksBtn) {
    tasksBtn.addEventListener('click', () => {
      openTasksModal()
    })
  }

  if (tasksCloseBtn) {
    tasksCloseBtn.addEventListener('click', (event) => {
      event.preventDefault()
      closeTasksModal()
    })
  }

  if (tasksModal) {
    tasksModal.addEventListener('click', (event) => {
      if (event.target === tasksModal) closeTasksModal()
    })
    tasksModal.addEventListener('close', () => {
      document.body.classList.remove('modal-open')
    })
  }
}
