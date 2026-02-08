import { renderMarkdown } from '../markdown.js'
import { applyStatus } from '../status.js'

import { formatElapsedLabel, formatTime, formatUsage } from './format.js'
import { createLoadingController } from './loading.js'
import { createBrowserNotificationController } from './notification.js'
import { createQuoteController } from './quote.js'
import { renderMessages } from './render.js'
import { createScrollController } from './scroll.js'
import { createSendHandler } from './send.js'
import {
  applyRenderedState,
  clearMessageState,
  collectNewMessageIds,
  createMessageState,
  hasLoadingVisibilityChange,
  hasMessageChange,
  updateLoadingVisibilityState,
  updateMessageState,
} from './state.js'
import { clearWorkerDots, updateWorkerDots } from './worker-dots.js'

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
}) {
  const ACTIVE_POLL_MS = 2000
  const IDLE_POLL_MS = 30000
  const RETRY_BASE_MS = 1000
  const RETRY_MAX_MS = 30000
  const MESSAGE_LIMIT = 50

  let pollTimer = null
  let isPolling = false
  let pausedByVisibility = false
  let consecutiveFailures = 0
  let emptyRemoved = false
  let lastStatus = null
  let lastMessageCursor = null
  let lastStatusEtag = null
  let lastMessagesEtag = null
  let unbindNotificationPrompt = () => {}
  const messageState = createMessageState()
  const notifications = createBrowserNotificationController()

  const removeEmpty = () => {
    if (emptyRemoved) return
    const el = document.querySelector('[data-empty]')
    if (el) el.remove()
    emptyRemoved = true
  }

  const scroll = createScrollController({
    messagesEl,
    scrollBottomBtn,
    scrollBottomMultiplier: 1.5,
  })
  const loading = createLoadingController({
    messagesEl,
    isNearBottom: scroll.isNearBottom,
    scrollToBottom: scroll.scrollToBottom,
    updateScrollButton: scroll.updateScrollButton,
    removeEmpty,
  })
  const quote = createQuoteController({ quotePreview, quoteLabel, quoteText, input })

  const syncLoadingState = () => {
    const thinkerRunning = Boolean(lastStatus?.thinkerRunning)
    const shouldWait = messageState.awaitingReply && thinkerRunning
    if (shouldWait) {
      if (!loading.isLoading()) loading.setLoading(true)
    } else if (loading.isLoading()) loading.setLoading(false)
  }

  const doRender = (messages, enterMessageIds) => {
    if (!messages?.length) return null
    return renderMessages({
      messages,
      messagesEl,
      removeEmpty,
      renderMarkdown,
      formatTime,
      formatUsage,
      formatElapsedLabel,
      isNearBottom: scroll.isNearBottom,
      scrollToBottom: scroll.scrollToBottom,
      updateScrollButton: scroll.updateScrollButton,
      loading,
      enterMessageIds,
      onQuote: quote.set,
    })
  }

  const buildMessagesUrl = () => {
    const query = lastMessageCursor
      ? `?limit=${MESSAGE_LIMIT}&afterId=${encodeURIComponent(lastMessageCursor)}`
      : `?limit=${MESSAGE_LIMIT}`
    return `/api/messages${query}`
  }

  const mergeIncomingMessages = (incoming, mode) => {
    const merged =
      mode === 'delta' && messageState.lastMessages.length > 0
        ? [...messageState.lastMessages, ...incoming]
        : incoming
    return merged.slice(Math.max(0, merged.length - MESSAGE_LIMIT))
  }

  const fetchMessages = async () => {
    const headers = {}
    if (lastMessagesEtag) headers['If-None-Match'] = lastMessagesEtag
    const msgRes = await fetch(buildMessagesUrl(), { headers })
    if (msgRes.status === 304) return null
    const etag = msgRes.headers.get('etag')
    if (etag) lastMessagesEtag = etag
    return msgRes.json()
  }

  const fetchStatus = async () => {
    const headers = {}
    if (lastStatusEtag) headers['If-None-Match'] = lastStatusEtag
    const statusRes = await fetch('/api/status', { headers })
    if (statusRes.status === 304) return null
    const etag = statusRes.headers.get('etag')
    if (etag) lastStatusEtag = etag
    return statusRes.json()
  }

  const fetchAndRenderMessages = async () => {
    const msgData = await fetchMessages()
    if (msgData === null) {
      updateLoadingVisibilityState(messageState, loading.isLoading())
      return false
    }
    const incoming = msgData.messages || []
    const mode =
      msgData && typeof msgData.mode === 'string' ? msgData.mode : 'full'
    const messages = mergeIncomingMessages(incoming, mode)
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
      notifications.notifyMessages(messages, enterMessageIds)
    }
    updateMessageState(messageState, messages, newestId)
    lastMessageCursor = newestId
    updateLoadingVisibilityState(messageState, loading.isLoading())
    return changed
  }

  const scheduleNextPoll = (delayMs) => {
    if (!isPolling || pausedByVisibility) return
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = window.setTimeout(poll, delayMs)
  }

  const currentPollDelay = () => {
    if (isFullyIdle()) return IDLE_POLL_MS
    return ACTIVE_POLL_MS
  }

  const currentBackoffDelay = () => {
    const shift = Math.max(0, consecutiveFailures - 1)
    const factor = 2 ** shift
    return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * factor)
  }

  const updateStatus = (status) => {
    lastStatus = status
    if (statusText && statusDot)
      applyStatus({ statusDot, statusText }, status.agentStatus)
    updateWorkerDots(workerDots, status)
    syncLoadingState()
  }

  const setDisconnected = () => {
    applyStatus({ statusDot, statusText }, 'disconnected')
    lastStatus = null
    clearWorkerDots(workerDots)
    clearMessageState(messageState)
    lastStatusEtag = null
    lastMessageCursor = null
    lastMessagesEtag = null
    loading.setLoading(false)
  }

  const poll = async () => {
    if (!isPolling) return
    try {
      const [statusRes, msgRes] = await Promise.all([
        fetchStatus(),
        fetchMessages(),
      ])
      if (statusRes !== null) {
        updateStatus(statusRes)
      } else {
        syncLoadingState()
      }
      if (msgRes !== null) {
        const incoming = msgRes.messages || []
        const mode =
          msgRes && typeof msgRes.mode === 'string' ? msgRes.mode : 'full'
        const messages = mergeIncomingMessages(incoming, mode)
        const newestId = messages.length > 0 ? messages[messages.length - 1].id : null
        const loadingVisible = loading.isLoading()
        if (
          hasMessageChange(messageState, messages, newestId) ||
          hasLoadingVisibilityChange(messageState, loadingVisible)
        ) {
          const enterMessageIds = collectNewMessageIds(messageState, messages)
          const rendered = doRender(messages, enterMessageIds)
          if (rendered)
            applyRenderedState(messageState, rendered, { loading, syncLoadingState })
          notifications.notifyMessages(messages, enterMessageIds)
        } else {
          syncLoadingState()
        }
        updateMessageState(messageState, messages, newestId)
        lastMessageCursor = newestId
        updateLoadingVisibilityState(messageState, loading.isLoading())
      } else {
        syncLoadingState()
      }
      consecutiveFailures = 0
    } catch (error) {
      consecutiveFailures += 1
      console.warn('[webui] poll failed', error)
      setDisconnected()
    }
    const nextDelay =
      consecutiveFailures > 0 ? currentBackoffDelay() : currentPollDelay()
    scheduleNextPoll(nextDelay)
  }

  const sendMessage = createSendHandler({
    sendBtn,
    input,
    onUserMessageSubmitted: notifications.primePermission,
    messageState,
    loading,
    quote,
    fetchAndRenderMessages,
    scroll,
    messagesEl,
    removeEmpty,
  })

  if (quoteClearBtn) quoteClearBtn.addEventListener('click', quote.clear)

  const start = () => {
    if (isPolling) return
    scroll.bindScrollControls()
    unbindNotificationPrompt = notifications.bindPermissionPrompt()
    isPolling = true
    pausedByVisibility =
      typeof document !== 'undefined' && document.hidden === true
    if (pausedByVisibility) return
    poll()
  }
  const stop = () => {
    isPolling = false
    pausedByVisibility = false
    unbindNotificationPrompt()
    unbindNotificationPrompt = () => {}
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
  }

  const onVisibilityChange = () => {
    if (!isPolling) return
    const hidden =
      typeof document !== 'undefined' && document.hidden === true
    if (hidden) {
      pausedByVisibility = true
      if (pollTimer) clearTimeout(pollTimer)
      pollTimer = null
      return
    }
    const wasPaused = pausedByVisibility
    pausedByVisibility = false
    if (wasPaused) {
      if (pollTimer) clearTimeout(pollTimer)
      pollTimer = null
      poll()
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  const isFullyIdle = () =>
    lastStatus &&
    lastStatus.agentStatus === 'idle' &&
    !(lastStatus.activeTasks ?? 0) &&
    !(lastStatus.pendingTasks ?? 0)

  return { start, stop, sendMessage, isFullyIdle }
}
