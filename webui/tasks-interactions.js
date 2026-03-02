import { UI_TEXT } from './system-text.js'

const setTaskMenuOpen = (menuRoot, open) => {
  if (!(menuRoot instanceof HTMLElement)) return
  menuRoot.classList.toggle('is-open', open)
  const menu = menuRoot.querySelector('.task-menu')
  if (menu instanceof HTMLElement) {
    menu.hidden = !open
    menu.setAttribute('aria-hidden', open ? 'false' : 'true')
  }
  const trigger = menuRoot.querySelector('.task-more')
  if (trigger instanceof HTMLButtonElement)
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false')
}

const focusMenuTrigger = (menuRoot) => {
  if (!(menuRoot instanceof HTMLElement)) return
  const trigger = menuRoot.querySelector('.task-more')
  if (trigger instanceof HTMLButtonElement) trigger.focus()
}

const closeTaskMenus = (tasksList, exceptRoot = null) => {
  const opened = tasksList.querySelectorAll('.task-item-actions.is-open')
  for (const root of opened) {
    if (!(root instanceof HTMLElement)) continue
    if (exceptRoot && root === exceptRoot) continue
    setTaskMenuOpen(root, false)
  }
}

const requestCancel = async (taskId, button) => {
  if (!taskId) return
  const originalText = button?.textContent || '✕'
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

    const moreButton = target.closest('.task-more')
    if (moreButton instanceof HTMLButtonElement) {
      event.preventDefault()
      event.stopPropagation()
      const menuRoot = moreButton.closest('.task-item-actions')
      if (!(menuRoot instanceof HTMLElement)) return
      const nextOpen = !menuRoot.classList.contains('is-open')
      closeTaskMenus(tasksList, menuRoot)
      setTaskMenuOpen(menuRoot, nextOpen)
      return
    }

    const button = target.closest('.task-cancel')
    if (button instanceof HTMLButtonElement) {
      event.preventDefault()
      event.stopPropagation()
      const menuRoot = button.closest('.task-item-actions')
      if (menuRoot instanceof HTMLElement) setTaskMenuOpen(menuRoot, false)
      const taskId = button.getAttribute('data-task-id') || ''
      void requestCancel(taskId, button)
      return
    }

    const link = target.closest('.task-link')
    if (!link) return
    closeTaskMenus(tasksList)
    const openable = link.getAttribute('data-archive-openable') === 'true'
    if (!openable) return
    event.preventDefault()
    const taskId = link.getAttribute('data-task-id') || ''
    const archiveUrl = `/api/tasks/${encodeURIComponent(taskId)}/archive`
    const opened = window.open(archiveUrl, '_blank', 'noopener,noreferrer')
    if (!opened) console.warn('[webui] open task archive failed', 'popup blocked')
  }

  const onOutsidePointerDown = (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('.task-item-actions')) return
    closeTaskMenus(tasksList)
  }

  const onListKeydown = (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    if (event.key === 'Escape') {
      const menuRoot = target.closest('.task-item-actions.is-open')
      if (!(menuRoot instanceof HTMLElement)) return
      event.preventDefault()
      setTaskMenuOpen(menuRoot, false)
      focusMenuTrigger(menuRoot)
      return
    }

    if (event.key !== 'ArrowDown') return
    const moreButton = target.closest('.task-more')
    if (!(moreButton instanceof HTMLButtonElement)) return
    const menuRoot = moreButton.closest('.task-item-actions')
    if (!(menuRoot instanceof HTMLElement)) return
    event.preventDefault()
    closeTaskMenus(tasksList, menuRoot)
    setTaskMenuOpen(menuRoot, true)
    const firstAction = menuRoot.querySelector('.task-menu-item:not(:disabled)')
    if (firstAction instanceof HTMLButtonElement) firstAction.focus()
  }

  tasksList.addEventListener('click', onListClick)
  tasksList.addEventListener('keydown', onListKeydown)
  document.addEventListener('pointerdown', onOutsidePointerDown, true)

  return () => {
    tasksList.removeEventListener('click', onListClick)
    tasksList.removeEventListener('keydown', onListKeydown)
    document.removeEventListener('pointerdown', onOutsidePointerDown, true)
  }
}
