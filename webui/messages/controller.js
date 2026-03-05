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
  onInspectAction,
  onTasksSnapshot,
  onPlansSnapshot,
  onFocusesSnapshot,
  onChoiceSnapshot,
  onDisconnected,
}) {
  let lastStatus = null
  let isStarted = false
  let unsubscribeTimeTick = null
  let deleteModeEnabled = false
  const messageState = createMessageState()

  const scroll = createScrollController({
    messagesEl,
    scrollBottomBtn,
    scrollBottomMultiplier: 1.5,
  })
  let stickBottomAfterChoicePanelShift = false

  const beginChoicePanelLayoutShift = () => {
    stickBottomAfterChoicePanelShift = scroll.isNearBottom()
  }

  const endChoicePanelLayoutShift = () => {
    scroll.syncAfterLayoutShift({ stickToBottom: stickBottomAfterChoicePanelShift })
    stickBottomAfterChoicePanelShift = false
  }

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
    onInspectAction,
    isDeleteMode: () => deleteModeEnabled,
  })
  removeEmpty = rendering.removeEmpty
  const { doRender } = rendering

  const syncLoadingState = () => {
    const shouldWait = messageState.awaitingReply
    if (shouldWait && !loading.isLoading()) loading.setLoading(true)
    else if (!shouldWait && loading.isLoading()) loading.setLoading(false)
  }

  const updateStatus = (status) => {
    updateControllerStatus({
      status,
      statusDot,
      statusText,
      workerDots,
      setLastStatus: (value) => {
        lastStatus = value
      },
      syncLoadingState,
    })
  }

  const setDisconnected = createDisconnectHandler({
    statusDot,
    statusText,
    workerDots,
    messageState,
    loading,
    setLastStatus: (value) => {
      lastStatus = value
    },
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
  })

  const queue = createControllerQueue({
    applySnapshot: payload.applySnapshot,
    applyTasksSnapshot: payload.applyTasksSnapshot,
  })

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

  const refreshRenderedTimes = () => {
    const messages = Array.isArray(messageState.lastMessages)
      ? messageState.lastMessages
      : []
    if (messages.length === 0) return
    doRender(messages, new Set())
  }

  const setDeleteMode = (enabled) => {
    const nextDeleteMode = Boolean(enabled)
    if (deleteModeEnabled === nextDeleteMode) return deleteModeEnabled
    deleteModeEnabled = nextDeleteMode
    deleteMessages.setDeleteMode(nextDeleteMode)
    if (nextDeleteMode) quote.clear()
    const messages = Array.isArray(messageState.lastMessages)
      ? messageState.lastMessages
      : []
    doRender(messages, new Set())
    return deleteModeEnabled
  }

  const start = () => {
    if (isStarted) return
    isStarted = true
    if (!unsubscribeTimeTick) {
      unsubscribeTimeTick = subscribeTimeTick(() => {
        refreshRenderedTimes()
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
    beginChoicePanelLayoutShift,
    endChoicePanelLayoutShift,
    setDeleteMode,
    isDeleteMode: () => deleteModeEnabled,
  }
}
