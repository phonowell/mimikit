import { createLoadingController } from './loading.js'
import { createControllerCursors } from './controller-cursors.js'
import { createMessagesLifecycle, runPollLoop } from './lifecycle.js'
import { createControllerPolling } from './controller-polling.js'
import {
  createDisconnectHandler,
  isStatusFullyIdle,
  updateControllerStatus,
} from './controller-status.js'
import { createPollingDelayController } from './polling-delay.js'
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
  const HIDDEN_POLL_MS = 30000
  const RETRY_BASE_MS = 1000
  const RETRY_MAX_MS = 30000
  const MESSAGE_LIMIT = 50

  let pollTimer = null, consecutiveFailures = 0
  let lastStatus = null, lastMessageCursor = null
  let lastStatusEtag = null, lastMessagesEtag = null
  const runtime = { isPolling: false, isPageHidden: false }
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
    const managerRunning = Boolean(lastStatus?.managerRunning)
    const shouldWait = messageState.awaitingReply && managerRunning
    if (shouldWait && !loading.isLoading()) loading.setLoading(true)
    else if (!shouldWait && loading.isLoading()) loading.setLoading(false)
  }

  const delay = createPollingDelayController({
    isPolling: () => runtime.isPolling,
    isHidden: () => runtime.isPageHidden,
    schedule: (pollFn, delayMs) => {
      pollTimer = window.setTimeout(pollFn, delayMs)
    },
    clear: () => {
      if (!pollTimer) return
      clearTimeout(pollTimer)
      pollTimer = null
    },
    isFullyIdle: () => isFullyIdle(),
    activePollMs: ACTIVE_POLL_MS,
    idlePollMs: IDLE_POLL_MS,
    hiddenPollMs: HIDDEN_POLL_MS,
    retryBaseMs: RETRY_BASE_MS,
    retryMaxMs: RETRY_MAX_MS,
    getConsecutiveFailures: () => consecutiveFailures,
  })

  const cursors = createControllerCursors({
    getLastMessageCursor: () => lastMessageCursor,
    setLastMessageCursor: (value) => {
      lastMessageCursor = value
    },
    getLastStatusEtag: () => lastStatusEtag,
    setLastStatusEtag: (value) => {
      lastStatusEtag = value
    },
    getLastMessagesEtag: () => lastMessagesEtag,
    setLastMessagesEtag: (value) => {
      lastMessagesEtag = value
    },
  })

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
    setLastStatus: (value) => { lastStatus = value },
    cursors,
  })

  const { fetchAndRenderMessages, pollOnce } = createControllerPolling({
    messageState,
    loading,
    doRender,
    updateStatus,
    syncLoadingState,
    setDisconnected,
    cursors,
    collectNewMessageIds,
    hasMessageChange,
    hasLoadingVisibilityChange,
    updateMessageState,
    updateLoadingVisibilityState,
    applyRenderedState,
    messageLimit: MESSAGE_LIMIT,
  })

  const poll = async () =>
    runPollLoop({
      runtime,
      pollOnce,
      delay,
      onDisconnected: setDisconnected,
      consecutiveFailures,
      setConsecutiveFailures: (value) => { consecutiveFailures = value },
      poll,
    })

  const sendMessage = createSendHandler({
    sendBtn,
    input,
    messageState,
    loading,
    quote,
    fetchAndRenderMessages,
    scroll,
    messagesEl,
    removeEmpty,
  })

  if (quoteClearBtn) quoteClearBtn.addEventListener('click', quote.clear)
  if (quotePreview) quotePreview.addEventListener('dblclick', quote.clear)

  const lifecycle = createMessagesLifecycle({
    runtime,
    scroll,
    poll,
    clearDelay: delay.clear,
    scheduleNextPoll: () => delay.scheduleNext(poll),
  })
  lifecycle.bindVisibility()
  const isFullyIdle = () => isStatusFullyIdle(lastStatus)

  return {
    start: lifecycle.start,
    stop: lifecycle.stop,
    clearStatusEtag: () => { lastStatusEtag = null },
    sendMessage,
    isFullyIdle,
  }
}
