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
const RECONNECT_BASE_DELAY_MS = 1200
const RECONNECT_MAX_DELAY_MS = 12000

const isRecord = (value) => value && typeof value === 'object'

const asUsageNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const normalizeUsage = (raw) => {
  if (!isRecord(raw)) return null
  const input = asUsageNumber(raw.input)
  const output = asUsageNumber(raw.output)
  const inputCacheRead = asUsageNumber(raw.inputCacheRead)
  const inputCacheWrite = asUsageNumber(raw.inputCacheWrite)
  const outputCache = asUsageNumber(raw.outputCache)
  const total = asUsageNumber(raw.total)
  const sessionTotal = asUsageNumber(raw.sessionTotal)
  if (
    input === null &&
    output === null &&
    inputCacheRead === null &&
    inputCacheWrite === null &&
    outputCache === null &&
    total === null &&
    sessionTotal === null
  )
    return null
  return {
    ...(input !== null ? { input } : {}),
    ...(output !== null ? { output } : {}),
    ...(inputCacheRead !== null ? { inputCacheRead } : {}),
    ...(inputCacheWrite !== null ? { inputCacheWrite } : {}),
    ...(outputCache !== null ? { outputCache } : {}),
    ...(total !== null ? { total } : {}),
    ...(sessionTotal !== null ? { sessionTotal } : {}),
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

const STREAM_FRAME_MS = 16

const scheduleFrame = (callback) => {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
    return window.requestAnimationFrame(callback)
  return setTimeout(() => callback(Date.now()), STREAM_FRAME_MS)
}

const cancelFrame = (handle) => {
  if (handle === null || handle === undefined) return
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(handle)
    return
  }
  clearTimeout(handle)
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

const normalizeStreamPatch = (raw) => {
  if (!isRecord(raw)) return null
  const mode = typeof raw.mode === 'string' ? raw.mode.trim().toLowerCase() : ''
  if (mode === 'clear') return { mode: 'clear' }
  if (mode === 'replace') {
    if (!isRecord(raw.stream)) return null
    return { mode: 'replace', stream: raw.stream }
  }
  if (mode !== 'delta') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!id) return null
  const delta = typeof raw.delta === 'string' ? raw.delta : ''
  return {
    mode: 'delta',
    id,
    delta,
    ...(Object.prototype.hasOwnProperty.call(raw, 'usage')
      ? { usage: raw.usage }
      : {}),
  }
}

const applyStreamPatch = (currentStreamMessage, patch) => {
  if (patch.mode === 'clear') return null
  if (patch.mode === 'replace') return normalizeStreamMessage(patch.stream)

  const streamId = `stream-${patch.id}`
  const base =
    currentStreamMessage?.id === streamId
      ? currentStreamMessage
      : {
          id: streamId,
          role: 'agent',
          text: '',
          createdAt: new Date().toISOString(),
          streaming: true,
        }
  const normalizedUsage = Object.prototype.hasOwnProperty.call(patch, 'usage')
    ? normalizeUsage(patch.usage)
    : undefined
  const nextText = `${base.text}${patch.delta}`
  return {
    ...base,
    text: nextText,
    ...(normalizedUsage === undefined
      ? 'usage' in base
        ? { usage: base.usage }
        : {}
      : normalizedUsage
        ? { usage: normalizedUsage }
      : {}),
  }
}

const mergeStreamPatches = (rawPatches) => {
  const merged = []
  for (const rawPatch of rawPatches) {
    const patch = normalizeStreamPatch(rawPatch)
    if (!patch) continue
    const previous = merged[merged.length - 1]
    if (patch.mode !== 'delta' || previous?.mode !== 'delta' || previous.id !== patch.id) {
      merged.push(patch)
      continue
    }
    previous.delta += patch.delta
    if (Object.prototype.hasOwnProperty.call(patch, 'usage')) previous.usage = patch.usage
  }
  return merged
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
  onTodosSnapshot,
  onFocusesSnapshot,
  onDisconnected,
}) {
  let lastStatus = null
  let eventSource = null
  let isStarted = false
  let currentStreamMessage = null
  const pendingEvents = []
  let pendingFrame = null
  let reconnectTimer = null
  let reconnectAttempts = 0
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

  const applyMessagesPayload = (msgData, streamMessage) => {
    const hasMessagesPayload = isRecord(msgData)
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
    currentStreamMessage = normalizeStreamMessage(streamPayload)
    if (isRecord(snapshot.status)) updateStatus(snapshot.status)
    else syncLoadingState()
    applyMessagesPayload(snapshot.messages, currentStreamMessage)
    if (typeof onTasksSnapshot === 'function' && isRecord(snapshot.tasks)) 
      onTasksSnapshot(snapshot.tasks)
    if (typeof onTodosSnapshot === 'function' && isRecord(snapshot.todos))
      onTodosSnapshot(snapshot.todos)
    if (typeof onFocusesSnapshot === 'function' && isRecord(snapshot.focuses))
      onFocusesSnapshot(snapshot.focuses)
  }

  const flushPendingEvents = () => {
    pendingFrame = null
    if (pendingEvents.length === 0) return

    let lastSnapshot = null
    const streamPatches = []
    for (const event of pendingEvents) {
      if (event.type === 'snapshot') {
        lastSnapshot = event.payload
        streamPatches.length = 0
        continue
      }
      if (event.type === 'stream') streamPatches.push(event.payload)
    }
    pendingEvents.length = 0

    if (lastSnapshot) applySnapshot(lastSnapshot)
    const mergedStreamPatches = mergeStreamPatches(streamPatches)
    if (mergedStreamPatches.length === 0) return
    for (const patch of mergedStreamPatches)
      currentStreamMessage = applyStreamPatch(currentStreamMessage, patch)
    applyMessagesPayload(null, currentStreamMessage)
  }

  const enqueueEvent = (event) => {
    pendingEvents.push(event)
    if (pendingFrame !== null) return
    pendingFrame = scheduleFrame(flushPendingEvents)
  }

  const clearReconnectTimer = () => {
    if (reconnectTimer === null) return
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const scheduleReconnect = () => {
    if (!isStarted || eventSource || reconnectTimer !== null) return
    const delayMs = Math.min(
      RECONNECT_MAX_DELAY_MS,
      RECONNECT_BASE_DELAY_MS * Math.max(1, 2 ** reconnectAttempts),
    )
    reconnectAttempts += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (!isStarted || eventSource) return
      openEvents()
    }, delayMs)
  }

  const closeEvents = () => {
    clearReconnectTimer()
    if (pendingFrame !== null) {
      cancelFrame(pendingFrame)
      pendingFrame = null
    }
    pendingEvents.length = 0
    if (!eventSource) return
    eventSource.close()
    eventSource = null
  }

  function openEvents() {
    if (eventSource) return
    const source = new EventSource(EVENTS_URL)
    const handleConnected = () => {
      reconnectAttempts = 0
    }

    const onSnapshotEvent = (event) => {
      const snapshot = parseSnapshot(event.data)
      if (!snapshot) return
      enqueueEvent({ type: 'snapshot', payload: snapshot })
    }

    const onStreamEvent = (event) => {
      const patch = parseSnapshot(event.data)
      if (!patch) return
      enqueueEvent({ type: 'stream', payload: patch })
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
      if (eventSource !== source) return
      setDisconnected()
      if (typeof onDisconnected === 'function') onDisconnected()
      source.close()
      eventSource = null
      scheduleReconnect()
    }

    source.onopen = handleConnected
    source.addEventListener('snapshot', onSnapshotEvent)
    source.addEventListener('stream', onStreamEvent)
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
    reconnectAttempts = 0
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
