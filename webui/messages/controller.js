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
  hasStreamChange,
  updateLoadingVisibilityState,
  updateMessageState,
  updateStreamState,
} from './state.js'

const MESSAGE_LIMIT = 50
const EVENTS_URL = '/api/events'

const isRecord = (value) => value && typeof value === 'object'

const asUsageNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const normalizeUsage = (raw) => {
  if (!isRecord(raw)) return null
  const input = asUsageNumber(raw.input)
  const output = asUsageNumber(raw.output)
  const total = asUsageNumber(raw.total)
  if (input === null && output === null && total === null) return null
  return {
    ...(input !== null ? { input } : {}),
    ...(output !== null ? { output } : {}),
    ...(total !== null ? { total } : {}),
  }
}

const parseSnapshot = (raw) => {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

const normalizeStreamMessage = (raw) => {
  if (!isRecord(raw)) return null
  const role = typeof raw.role === 'string' ? raw.role : 'agent'
  if (role !== 'agent') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const text = typeof raw.text === 'string' ? raw.text : ''
  const usage = normalizeUsage(raw.usage)
  if (!id || (text.length === 0 && !usage)) return null
  const createdAt =
    typeof raw.createdAt === 'string' && raw.createdAt.trim()
      ? raw.createdAt
      : typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
        ? raw.updatedAt
        : new Date().toISOString()
  return {
    id: `stream-${id}`,
    role: 'agent',
    text,
    ...(usage ? { usage } : {}),
    createdAt,
    streaming: true,
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

  const applyMessagesPayload = (msgData, streamPayload) => {
    const hasMessagesPayload = isRecord(msgData)
    const streamMessage = normalizeStreamMessage(streamPayload)
    const incoming = hasMessagesPayload && Array.isArray(msgData.messages) ? msgData.messages : []
    const mode =
      hasMessagesPayload && typeof msgData.mode === 'string' ? msgData.mode : 'full'
    const messages = hasMessagesPayload
      ? mergeIncomingMessages({
          mode,
          lastMessages: messageState.lastMessages,
          incoming,
          limit: MESSAGE_LIMIT,
        })
      : messageState.lastMessages
    if (streamMessage) {
      messageState.awaitingReply = false
      loading.setLoading(false)
    }
    const newestId = messages.length > 0 ? messages[messages.length - 1].id : null
    const loadingVisible = loading.isLoading()
    const messageChanged = hasMessageChange(messageState, messages, newestId)
    const loadingChanged = hasLoadingVisibilityChange(messageState, loadingVisible)
    const streamChanged = hasStreamChange(messageState, streamMessage)
    const changed = messageChanged || loadingChanged || streamChanged
    if (messageChanged || loadingChanged) {
      const enterMessageIds = collectNewMessageIds(messageState, messages)
      const rendered = doRender(messages, enterMessageIds, streamMessage)
      if (rendered)
        applyRenderedState(messageState, rendered, { loading, syncLoadingState })
    } else if (streamChanged) 
      doRenderStream(streamMessage)
    
    updateMessageState(messageState, messages, newestId)
    updateLoadingVisibilityState(messageState, loading.isLoading())
    updateStreamState(messageState, streamMessage)
    return changed
  }

  const applySnapshot = (snapshot) => {
    if (!isRecord(snapshot)) return
    const streamPayload = isRecord(snapshot.stream) ? snapshot.stream : null
    if (isRecord(snapshot.status)) updateStatus(snapshot.status)
    else syncLoadingState()
    applyMessagesPayload(snapshot.messages, streamPayload)
    if (typeof onTasksSnapshot === 'function' && isRecord(snapshot.tasks)) 
      onTasksSnapshot(snapshot.tasks)
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
        if (payload && typeof payload.error === 'string' && payload.error.trim()) 
          console.warn('[webui] stream error', payload.error)
        
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
    sendMessage,
    isFullyIdle,
  }
}
