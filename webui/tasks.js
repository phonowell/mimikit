import { createDialogController } from './dialog.js'
import { UI_TEXT } from './system-text.js'
import { bindTaskInteractions } from './tasks-interactions.js'
import { renderTasks } from './tasks-view-render.js'
import { createElapsedTicker } from './tasks-view-time.js'
import { subscribeTimeTick } from './time-tick.js'

const EMPTY_TASKS = { tasks: [] }

const normalizeTasksPayload = (value) => {
  if (!value || typeof value !== 'object') return EMPTY_TASKS
  const tasks = Array.isArray(value.tasks) ? value.tasks : []
  return { tasks }
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
  let unsubscribeTimeTick = null
  const unbindTaskInteractions = bindTaskInteractions(tasksList)

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
    if (!unsubscribeTimeTick) {
      unsubscribeTimeTick = subscribeTimeTick(() => {
        renderLatestTasks()
      })
    }
    renderLatestTasks()
  }

  const stopTicker = () => {
    elapsedTicker.stop()
    if (unsubscribeTimeTick) {
      unsubscribeTimeTick()
      unsubscribeTimeTick = null
    }
  }

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
  } else 
    startTicker()
  

  return {
    applyTasksSnapshot,
    setDisconnected,
    dispose: () => {
      stopTicker()
      unbindTaskInteractions()
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
