import { renderMarkdown } from '../markdown.js'
import { applyStatus, clearStatus } from '../status.js'

import { formatElapsedLabel, formatTime, formatUsage } from './format.js'
import { createLoadingController } from './loading.js'
import { createQuoteController } from './quote.js'
import { renderError, renderMessages } from './render.js'
import { createScrollController } from './scroll.js'
import {
  applyRenderedState,
  clearMessageState,
  collectNewMessageIds,
  createMessageState,
  hasMessageChange,
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
  quoteText,
  quoteClearBtn,
}) {
  let pollTimer = null
  let isPolling = false
  let emptyRemoved = false
  let lastStatus = null
  const messageState = createMessageState()

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
  const quote = createQuoteController({ quotePreview, quoteText, input })

  const syncLoadingState = () => {
    const pending = lastStatus?.pendingInputs ?? 0
    const shouldWait =
      messageState.awaitingReply ||
      (pending > 0 && messageState.lastMessageRole === 'user')
    if (shouldWait) {
      if (!loading.isLoading()) loading.setLoading(true)
    } else if (loading.isLoading()) loading.setLoading(false)
  }

  const normalizeCount = (value) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : 0

  const updateWorkerDots = (status) => {
    if (!workerDots) return
    const maxWorkers = normalizeCount(status?.maxWorkers ?? status?.maxConcurrent)
    if (maxWorkers <= 0) {
      workerDots.innerHTML = ''
      return
    }
    if (workerDots.childElementCount !== maxWorkers) {
      workerDots.innerHTML = ''
      for (let i = 0; i < maxWorkers; i += 1) {
        const dot = document.createElement('span')
        dot.className = 'worker-dot'
        workerDots.appendChild(dot)
      }
    }
    const activeWorkers = Math.min(normalizeCount(status?.activeTasks), maxWorkers)
    const dots = workerDots.querySelectorAll('.worker-dot')
    for (let i = 0; i < dots.length; i += 1) {
      const dot = dots[i]
      if (dot instanceof HTMLElement) {
        dot.dataset.active = i < activeWorkers ? 'true' : 'false'
      }
    }
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
    const changed = hasMessageChange(messageState, messages, newestId)
    if (changed) {
      const enterMessageIds = collectNewMessageIds(messageState, messages)
      const rendered = doRender(messages, enterMessageIds)
      if (rendered)
        applyRenderedState(messageState, rendered, { loading, syncLoadingState })
    }
    updateMessageState(messageState, messages, newestId)
    return changed
  }

  const updateStatus = (status) => {
    lastStatus = status
    if (statusText && statusDot)
      applyStatus({ statusDot, statusText }, status.agentStatus)
    updateWorkerDots(status)
    syncLoadingState()
  }

  const setDisconnected = () => {
    clearStatus({ statusDot, statusText }, 'disconnected')
    lastStatus = null
    updateWorkerDots(null)
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
      if (hasMessageChange(messageState, messages, newestId)) {
        const enterMessageIds = collectNewMessageIds(messageState, messages)
        const rendered = doRender(messages, enterMessageIds)
        if (rendered)
          applyRenderedState(messageState, rendered, { loading, syncLoadingState })
      } else {
        syncLoadingState()
      }
      updateMessageState(messageState, messages, newestId)
    } catch (error) {
      console.warn('[webui] poll failed', error)
      setDisconnected()
    }
    if (isPolling) pollTimer = window.setTimeout(poll, 2000)
  }

  const sendMessage = async (text) => {
    if (!text) return
    if (sendBtn) sendBtn.disabled = true
    if (input) input.disabled = true
    messageState.awaitingReply = true
    messageState.lastMessageRole = 'user'
    loading.setLoading(true)
    try {
      const payload = {
        text,
        clientLocale:
          typeof navigator !== 'undefined' ? navigator.language : undefined,
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        clientOffsetMinutes: new Date().getTimezoneOffset(),
        clientNowIso: new Date().toISOString(),
      }
      const activeQuote = quote.getActive()
      if (activeQuote?.id) payload.quote = activeQuote.id
      const res = await fetch('/api/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let data = null
        try {
          data = await res.json()
        } catch {
          data = null
        }
        throw new Error(data?.error || 'Failed to send')
      }
      if (input) {
        input.value = ''
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      quote.clear()
      await fetchAndRenderMessages()
    } catch (error) {
      renderError(
        { messagesEl, removeEmpty, updateScrollButton: scroll.updateScrollButton },
        error,
      )
      messageState.awaitingReply = false
      messageState.lastMessageRole = 'system'
      loading.setLoading(false)
    } finally {
      if (sendBtn) sendBtn.disabled = false
      if (input) {
        input.disabled = false
        input.focus()
      }
    }
  }

  if (quoteClearBtn) quoteClearBtn.addEventListener('click', quote.clear)

  const start = () => {
    if (isPolling) return
    scroll.bindScrollControls()
    isPolling = true
    poll()
  }
  const stop = () => {
    isPolling = false
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
