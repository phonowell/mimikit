import { createLoadingController } from './loading.js'
import {
  createDisconnectHandler,
  isStatusFullyIdle,
  updateControllerStatus,
} from './controller-status.js'
import { createDeleteMessageController } from './controller-delete.js'
import { createQuoteController } from './quote.js'
import { createMessageRendering } from './rendering.js'
import { createScrollController } from './scroll.js'
import { createSendHandler } from './send.js'
import { subscribeTimeTick } from '../time-tick.js'
import { createMessageState } from './state.js'
import { createControllerQueue } from './controller-queue.js'
import { createSseController } from './controller-sse.js'
import { createPayloadController } from './controller-payload.js'
import { createControllerViewState } from './controller-view-state.js'

const EVENTS_URL = '/api/events'
const RECONNECT_BASE_DELAY_MS = 1200
const RECONNECT_MAX_DELAY_MS = 12000

export function createMessagesController({
  messagesEl,
  scrollBottomBtn,
  statusDot,
  statusText,
  input,
  sendBtn,
  workerDots,
  quotePreview,
  quoteLabel,
  quoteText,
  quoteClearBtn,
  deleteConfirmDialog,
  deleteConfirmCancelBtn,
  deleteConfirmBtn,
  onTasksSnapshot,
  onPlansSnapshot,
  onFocusesSnapshot,
  onChoiceSnapshot,
  onAgentMessages,
  onDisconnected,
}) {
  let lastStatus = null
  let isStarted = false
  let unsubscribeTimeTick = null
  const messageState = createMessageState()
  const setLastStatus = (value) => {
    lastStatus = value
  }

  const scroll = createScrollController({ messagesEl, scrollBottomBtn, scrollBottomMultiplier: 1.5 })

  let removeEmpty = () => {}
  const loading = createLoadingController({
    messagesEl,
    isNearBottom: scroll.isNearBottom,
    scrollToBottom: scroll.scrollToBottom,
    updateScrollButton: scroll.updateScrollButton,
    removeEmpty: () => removeEmpty(),
  })
  const quote = createQuoteController({ quotePreview, quoteLabel, quoteText, input })
  const deleteMessages = createDeleteMessageController({
    messagesEl,
    removeEmpty: () => removeEmpty(),
    updateScrollButton: scroll.updateScrollButton,
    quote,
    deleteConfirmDialog,
    deleteConfirmCancelBtn,
    deleteConfirmBtn,
  })

  const rendering = createMessageRendering({
    messagesEl,
    scroll,
    loading,
    quote,
    onDelete: deleteMessages.deleteMessage,
    isDeleteMode: () => viewState.isDeleteMode(),
  })
  removeEmpty = rendering.removeEmpty
  const { doRender } = rendering
  const viewState = createControllerViewState({
    scroll,
    messageState,
    quote,
    deleteMessages,
    doRender,
  })

  const syncLoadingState = () => {
    const shouldWait = messageState.awaitingReply
    if (shouldWait && !loading.isLoading()) loading.setLoading(true)
    else if (!shouldWait && loading.isLoading()) loading.setLoading(false)
  }

  const updateStatus = (status) =>
    updateControllerStatus({ status, statusDot, statusText, workerDots, setLastStatus, syncLoadingState })

  const setDisconnected = createDisconnectHandler({
    statusDot,
    statusText,
    workerDots,
    messageState,
    loading,
    setLastStatus,
  })

  const payload = createPayloadController({
    messageState,
    loading,
    doRender,
    syncLoadingState,
    updateStatus,
    onTasksSnapshot,
    onPlansSnapshot,
    onFocusesSnapshot,
    onChoiceSnapshot,
    onAgentMessages,
  })

  const queue = createControllerQueue({ applySnapshot: payload.applySnapshot, applyTasksSnapshot: payload.applyTasksSnapshot })

  const sse = createSseController({
    eventsUrl: EVENTS_URL,
    reconnectBaseDelayMs: RECONNECT_BASE_DELAY_MS,
    reconnectMaxDelayMs: RECONNECT_MAX_DELAY_MS,
    isStarted: () => isStarted,
    onSnapshotEvent: (snapshot) => {
      queue.enqueueEvent({ type: 'snapshot', payload: snapshot })
    },
    onTasksEvent: (tasks) => {
      queue.enqueueEvent({ type: 'tasks', payload: tasks })
    },
    onDisconnected: () => {
      setDisconnected()
      if (typeof onDisconnected === 'function') onDisconnected()
    },
  })

  const sendMessage = createSendHandler({
    sendBtn,
    input,
    messageState,
    loading,
    quote,
    scroll,
    messagesEl,
    removeEmpty,
  })

  if (quoteClearBtn) quoteClearBtn.addEventListener('click', quote.clear)
  if (quotePreview) quotePreview.addEventListener('dblclick', quote.clear)
  deleteMessages.bindDialogEvents()

  const start = () => {
    if (isStarted) return
    isStarted = true
    if (!unsubscribeTimeTick) {
      unsubscribeTimeTick = subscribeTimeTick(() => {
        viewState.refreshRenderedTimes()
      })
    }
    scroll.bindScrollControls()
    sse.start()
  }

  const stop = () => {
    isStarted = false
    if (unsubscribeTimeTick) {
      unsubscribeTimeTick()
      unsubscribeTimeTick = null
    }
    queue.clearPendingEvents()
    sse.stop()
  }

  const isFullyIdle = () => isStatusFullyIdle(lastStatus)

  return {
    start,
    stop,
    sendMessage,
    isFullyIdle,
    isNearBottom: scroll.isNearBottom,
    syncAfterLayoutShift: scroll.syncAfterLayoutShift,
    beginChoicePanelLayoutShift: viewState.beginChoicePanelLayoutShift,
    endChoicePanelLayoutShift: viewState.endChoicePanelLayoutShift,
    setDeleteMode: viewState.setDeleteMode,
    isDeleteMode: viewState.isDeleteMode,
  }
}
