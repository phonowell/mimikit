import { createLoadingController } from './loading.js'
import { fetchWithTimeout } from '../fetch-with-timeout.js'
import { renderError } from './render-list.js'
import {
  createDisconnectHandler,
  isStatusFullyIdle,
  updateControllerStatus,
} from './controller-status.js'
import { createQuoteController } from './quote.js'
import { createMessageRendering } from './rendering.js'
import { createScrollController } from './scroll.js'
import { createSendHandler } from './send.js'
import { subscribeTimeTick } from '../time-tick.js'
import { createMessageState } from './state.js'
import { createControllerQueue } from './controller-queue.js'
import { createSseController } from './controller-sse.js'
import { createPayloadController } from './controller-payload.js'
import { UI_TEXT } from '../system-text.js'

const EVENTS_URL = '/api/events'
const RECONNECT_BASE_DELAY_MS = 1200
const RECONNECT_MAX_DELAY_MS = 12000
const DELETE_REQUEST_TIMEOUT_MS = 15000

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
  onTasksSnapshot,
  onPlansSnapshot,
  onFocusesSnapshot,
  onDisconnected,
}) {
  let lastStatus = null
  let isStarted = false
  let currentStreamMessage = null
  let unsubscribeTimeTick = null
  const messageState = createMessageState()

  const scroll = createScrollController({
    messagesEl,
    scrollBottomBtn,
    scrollBottomMultiplier: 1.5,
  })
  let removeEmpty = () => {}
  const loading = createLoadingController({
    messagesEl,
    isNearBottom: scroll.isNearBottom,
    scrollToBottom: scroll.scrollToBottom,
    updateScrollButton: scroll.updateScrollButton,
    removeEmpty: () => removeEmpty(),
  })
  const quote = createQuoteController({ quotePreview, quoteLabel, quoteText, input })
  const deleteMessage = async (msg) => {
    const id = typeof msg?.id === 'string' ? msg.id.trim() : ''
    if (!id) return
    try {
      const res = await fetchWithTimeout(
        `/api/messages/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
        DELETE_REQUEST_TIMEOUT_MS,
      )
      if (!res.ok) {
        let data = null
        try {
          data = await res.json()
        } catch {
          data = null
        }
        throw new Error(data?.error || UI_TEXT.deleteFailed)
      }
      const activeQuote = quote.getActive()
      if (activeQuote?.id === id) quote.clear()
    } catch (error) {
      renderError(
        { messagesEl, removeEmpty, updateScrollButton: scroll.updateScrollButton },
        error,
      )
    }
  }

  const rendering = createMessageRendering({
    messagesEl,
    scroll,
    loading,
    quote,
    onDelete: deleteMessage,
  })
  removeEmpty = rendering.removeEmpty
  const { doRender, doRenderStream } = rendering

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
    doRenderStream,
    syncLoadingState,
    updateStatus,
    onTasksSnapshot,
    onPlansSnapshot,
    onFocusesSnapshot,
    getCurrentStreamMessage: () => currentStreamMessage,
    setCurrentStreamMessage: (value) => {
      currentStreamMessage = value
    },
  })

  const queue = createControllerQueue({
    applySnapshot: payload.applySnapshot,
    applyMessagesPayload: payload.applyMessagesPayload,
    getCurrentStreamMessage: () => currentStreamMessage,
    setCurrentStreamMessage: (value) => {
      currentStreamMessage = value
    },
  })

  const sse = createSseController({
    eventsUrl: EVENTS_URL,
    reconnectBaseDelayMs: RECONNECT_BASE_DELAY_MS,
    reconnectMaxDelayMs: RECONNECT_MAX_DELAY_MS,
    isStarted: () => isStarted,
    onSnapshotEvent: (snapshot) => {
      queue.enqueueEvent({ type: 'snapshot', payload: snapshot })
    },
    onStreamEvent: (patch) => {
      queue.enqueueEvent({ type: 'stream', payload: patch })
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

  const refreshRenderedTimes = () => {
    const messages = Array.isArray(messageState.lastMessages)
      ? messageState.lastMessages
      : []
    if (messages.length === 0 && !currentStreamMessage) return
    doRender(messages, new Set(), currentStreamMessage)
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
  }
}
