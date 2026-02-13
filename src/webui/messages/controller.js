import { createLoadingController } from './loading.js'
import {
  createDisconnectHandler,
  isStatusFullyIdle,
  mergeIncomingMessages,
  updateControllerStatus,
} from './controller-status.js'
import { createQuoteController } from './quote.js'
import { createMessageRendering } from './rendering.js'
import { createScrollController } from './scroll.js'
import { createSendHandler } from './send.js'
import {
  applyRenderedState,
  collectNewMessageIds,
  createMessageState,
  hasLoadingVisibilityChange,
  hasMessageChange,
  updateLoadingVisibilityState,
  updateMessageState,
} from './state.js'

const MESSAGE_LIMIT = 50
const EVENTS_URL = '/api/events'

const isRecord = (value) => value && typeof value === 'object'

const parseSnapshot = (raw) => {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

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
  onDisconnected,
}) {
  let lastStatus = null
  let eventSource = null
  let isStarted = false
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

  const rendering = createMessageRendering({ messagesEl, scroll, loading, quote })
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

  const cursors = {
    message: { set: () => {} },
    statusEtag: { set: () => {} },
    messagesEtag: { set: () => {} },
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
    cursors,
  })

  const applyMessagesPayload = (msgData) => {
    if (!isRecord(msgData)) {
      updateLoadingVisibilityState(messageState, loading.isLoading())
      return false
    }
    const incoming = Array.isArray(msgData.messages) ? msgData.messages : []
    const mode = typeof msgData.mode === 'string' ? msgData.mode : 'full'
    const messages = mergeIncomingMessages({
      mode,
      lastMessages: messageState.lastMessages,
      incoming,
      limit: MESSAGE_LIMIT,
    })
    const newestId = messages.length > 0 ? messages[messages.length - 1].id : null
    const loadingVisible = loading.isLoading()
    const changed =
      hasMessageChange(messageState, messages, newestId) ||
      hasLoadingVisibilityChange(messageState, loadingVisible)
    if (changed) {
      const enterMessageIds = collectNewMessageIds(messageState, messages)
      const rendered = doRender(messages, enterMessageIds)
      if (rendered)
        applyRenderedState(messageState, rendered, { loading, syncLoadingState })
    }
    updateMessageState(messageState, messages, newestId)
    updateLoadingVisibilityState(messageState, loading.isLoading())
    return changed
  }

  const applySnapshot = (snapshot) => {
    if (!isRecord(snapshot)) return
    if (isRecord(snapshot.status)) updateStatus(snapshot.status)
    else syncLoadingState()
    if (isRecord(snapshot.messages)) applyMessagesPayload(snapshot.messages)
    else syncLoadingState()
    if (typeof onTasksSnapshot === 'function' && isRecord(snapshot.tasks)) {
      onTasksSnapshot(snapshot.tasks)
    }
  }

  const closeEvents = () => {
    if (!eventSource) return
    eventSource.close()
    eventSource = null
  }

  const openEvents = () => {
    if (eventSource) return
    const source = new EventSource(EVENTS_URL)

    const onSnapshotEvent = (event) => {
      const snapshot = parseSnapshot(event.data)
      if (!snapshot) return
      applySnapshot(snapshot)
    }

    const onMessageEvent = (event) => {
      const snapshot = parseSnapshot(event.data)
      if (!snapshot) return
      applySnapshot(snapshot)
    }

    const onServerErrorEvent = (event) => {
      try {
        const payload = parseSnapshot(event.data)
        if (payload && typeof payload.error === 'string' && payload.error.trim()) {
          console.warn('[webui] stream error', payload.error)
        }
      } catch {
        // no-op
      }
    }

    const onTransportError = () => {
      setDisconnected()
      if (typeof onDisconnected === 'function') onDisconnected()
    }

    source.addEventListener('snapshot', onSnapshotEvent)
    source.addEventListener('message', onMessageEvent)
    source.addEventListener('error', onServerErrorEvent)
    source.onerror = onTransportError
    eventSource = source
  }

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

  const start = () => {
    if (isStarted) return
    isStarted = true
    scroll.bindScrollControls()
    openEvents()
  }

  const stop = () => {
    isStarted = false
    closeEvents()
  }

  const isFullyIdle = () => isStatusFullyIdle(lastStatus)

  return {
    start,
    stop,
    clearStatusEtag: () => {},
    sendMessage,
    isFullyIdle,
  }
}
