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
  let pollTimer = null
  let isPolling = false
  let emptyRemoved = false
  let lastStatus = null
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

  const fetchAndRenderMessages = async () => {
    const msgRes = await fetch('/api/messages?limit=50')
    const msgData = await msgRes.json()
    const messages = msgData.messages || []
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
    updateLoadingVisibilityState(messageState, loading.isLoading())
    return changed
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
    loading.setLoading(false)
  }

  const poll = async () => {
    if (!isPolling) return
    try {
      const [statusRes, msgRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/messages?limit=50'),
      ])
      updateStatus(await statusRes.json())
      const msgData = await msgRes.json()
      const messages = msgData.messages || []
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
      updateLoadingVisibilityState(messageState, loading.isLoading())
    } catch (error) {
      console.warn('[webui] poll failed', error)
      setDisconnected()
    }
    if (isPolling) pollTimer = window.setTimeout(poll, 2000)
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
    poll()
  }
  const stop = () => {
    isPolling = false
    unbindNotificationPrompt()
    unbindNotificationPrompt = () => {}
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
  }
  const isFullyIdle = () =>
    lastStatus &&
    lastStatus.agentStatus === 'idle' &&
    !(lastStatus.activeTasks ?? 0) &&
    !(lastStatus.pendingTasks ?? 0)

  return { start, stop, sendMessage, isFullyIdle }
}

