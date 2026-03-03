import { bindDialogControls, createDialogController } from './dialog.js'
import { renderEmptyListState } from './list-empty.js'
import { createListLayoutShiftSync } from './list-scroll-sync.js'
import { UI_TEXT } from './system-text.js'
import { subscribeTimeTick } from './time-tick.js'

const EMPTY_PANEL = {
  applySnapshot: () => {},
  setDisconnected: () => {},
  dispose: () => {},
}

export const bindSnapshotPanel = ({
  list,
  dialog,
  openBtn,
  closeBtn,
  render,
  normalizePayload,
  emptyClass,
}) => {
  if (!list || typeof render !== 'function' || typeof normalizePayload !== 'function')
    return EMPTY_PANEL

  let latestPayload = normalizePayload(null)
  let unsubscribeTimeTick = null
  const scrollSync = createListLayoutShiftSync({ listEl: list })

  const renderLatest = () => {
    render(list, latestPayload)
  }

  const startTimeTick = () => {
    if (unsubscribeTimeTick) return
    unsubscribeTimeTick = subscribeTimeTick(() => {
      renderLatest()
    })
  }

  const stopTimeTick = () => {
    if (!unsubscribeTimeTick) return
    unsubscribeTimeTick()
    unsubscribeTimeTick = null
  }

  const applySnapshot = (payload) => {
    latestPayload = normalizePayload(payload)
    renderLatest()
  }

  const setDisconnected = () => {
    renderEmptyListState(list, emptyClass, UI_TEXT.connectionLost)
  }

  const dialogEnabled = Boolean(dialog && openBtn)
  const controller = dialogEnabled
    ? createDialogController({
        dialog,
        trigger: openBtn,
        focusOnOpen: closeBtn,
        focusOnClose: openBtn,
        onOpen: () => {
          startTimeTick()
          renderLatest()
        },
        onAfterClose: stopTimeTick,
      })
    : null
  let unbindDialogControls = () => {}

  if (dialogEnabled && controller) {
    controller.setExpanded(false)
    unbindDialogControls = bindDialogControls({
      dialog,
      openBtn,
      closeBtn,
      controller,
    })
  } else {
    startTimeTick()
    renderLatest()
  }

  scrollSync.bind()

  return {
    applySnapshot,
    setDisconnected,
    dispose: () => {
      stopTimeTick()
      unbindDialogControls()
      scrollSync.dispose()
    },
  }
}
