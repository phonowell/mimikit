import { bindDialogControls, createDialogController } from './dialog.js'
import { renderEmptyListState } from './list-empty.js'
import { createListLayoutShiftSync } from './list-scroll-sync.js'
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
  const scrollSync = createListLayoutShiftSync({ listEl: tasksList })
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
    renderEmptyListState(tasksList, 'tasks-empty', UI_TEXT.connectionLost)
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
  let unbindDialogControls = () => {}

  if (dialogEnabled && dialog) {
    dialog.setExpanded(false)
    unbindDialogControls = bindDialogControls({
      dialog: tasksDialog,
      openBtn: tasksOpenBtn,
      closeBtn: tasksCloseBtn,
      controller: dialog,
    })
  } else
    startTicker()

  scrollSync.bind()

  return {
    applyTasksSnapshot,
    setDisconnected,
    dispose: () => {
      stopTicker()
      unbindTaskInteractions()
      unbindDialogControls()
      scrollSync.dispose()
    },
  }
}
