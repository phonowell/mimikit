import { renderMarkdown } from '../markdown.js'
import { formatStatusText } from '../status-text.js'

import { formatElapsedLabel, formatTime, formatUsage } from './format.js'
import { createLoadingController } from './loading.js'
import { renderError, renderMessages } from './render.js'
import { createScrollController } from './scroll.js'

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
  let lastMessageCount = 0
  let lastMessageId = null
  let lastMessageRole = null
  let emptyRemoved = false
  let lastStatus = null
  let lastAgentMessageId = null
  let awaitingReply = false
  let lastMessageIds = new Set()
  let activeQuote = null

  const removeEmpty = () => {
    if (emptyRemoved) return
    const el = document.querySelector('[data-empty]')
    if (el) el.remove()
    emptyRemoved = true
  }

  const scroll = createScrollController({ messagesEl, scrollBottomBtn, scrollBottomMultiplier: 1.5 })
  const loading = createLoadingController({
    messagesEl, isNearBottom: scroll.isNearBottom, scrollToBottom: scroll.scrollToBottom,
    updateScrollButton: scroll.updateScrollButton, removeEmpty,
  })

  const syncLoadingState = () => {
    const pending = lastStatus?.pendingInputs ?? 0
    const shouldWait = awaitingReply || (pending > 0 && lastMessageRole === 'user')
    if (shouldWait) { if (!loading.isLoading()) loading.setLoading(true) }
    else if (loading.isLoading()) loading.setLoading(false)
  }

  const formatQuotePreview = (text) => {
    const cleaned = String(text ?? '').replace(/\s+/g, ' ').trim()
    if (!cleaned) return ''
    const max = 80
    return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned
  }

  const updateQuotePreview = () => {
    if (!quotePreview || !quoteText) return
    if (!activeQuote) {
      quoteText.textContent = ''
      quotePreview.hidden = true
      return
    }
    const preview = formatQuotePreview(activeQuote.text)
    quoteText.textContent = preview
      ? `${activeQuote.id} | ${preview}`
      : activeQuote.id
    quotePreview.hidden = false
  }

  const clearQuote = () => {
    if (!activeQuote) return
    activeQuote = null
    updateQuotePreview()
  }

  const setQuote = (msg) => {
    const id = msg?.id
    if (!id) return
    activeQuote = { id: String(id), text: msg?.text ?? '' }
    updateQuotePreview()
    if (input) input.focus()
  }

  const collectMessageIds = (messages) => {
    const ids = new Set()
    for (const msg of messages) {
      if (msg?.id != null) ids.add(msg.id)
    }
    return ids
  }

  const collectNewMessageIds = (messages) => {
    if (lastMessageIds.size === 0) return new Set()
    const ids = new Set()
    for (const msg of messages) {
      const id = msg?.id
      if (id != null && !lastMessageIds.has(id)) ids.add(id)
    }
    return ids
  }

  const applyRenderedState = (rendered) => {
    if (rendered?.latestAgentId && rendered.latestAgentId !== lastAgentMessageId) {
      lastAgentMessageId = rendered.latestAgentId
      awaitingReply = false
      loading.setLoading(false)
    }
    if (rendered?.lastRole != null) lastMessageRole = rendered.lastRole
    if (rendered?.lastIsAgent) awaitingReply = false
    syncLoadingState()
  }

  const doRender = (messages, enterMessageIds) => {
    if (!messages?.length) return null
    return renderMessages({
      messages, messagesEl, removeEmpty, renderMarkdown, formatTime,
      formatUsage, formatElapsedLabel, isNearBottom: scroll.isNearBottom,
      scrollToBottom: scroll.scrollToBottom, updateScrollButton: scroll.updateScrollButton, loading,
      enterMessageIds,
      onQuote: setQuote,
    })
  }

  const fetchAndRenderMessages = async () => {
    const msgRes = await fetch('/api/messages?limit=50')
    const msgData = await msgRes.json()
    const messages = msgData.messages || []
    const newestId = messages.length > 0 ? messages[messages.length - 1].id : null
    const changed = messages.length !== lastMessageCount || newestId !== lastMessageId
    if (changed) {
      const enterMessageIds = collectNewMessageIds(messages)
      const rendered = doRender(messages, enterMessageIds)
      if (rendered) applyRenderedState(rendered)
      lastMessageIds = collectMessageIds(messages)
    }
    lastMessageCount = messages.length
    lastMessageId = newestId
    return changed
  }

  const normalizeCount = (value) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0

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

  const updateStatus = (status) => {
    lastStatus = status
    if (statusText && statusDot) {
      statusDot.dataset.state = status.agentStatus
      statusText.textContent = formatStatusText(status.agentStatus)
    }
    updateWorkerDots(status)
    syncLoadingState()
  }

  const setDisconnected = () => {
    if (statusText) statusText.textContent = formatStatusText('disconnected')
    if (statusDot) statusDot.dataset.state = ''
    lastStatus = null
    updateWorkerDots(null)
    lastMessageRole = null
    lastMessageIds = new Set()
    awaitingReply = false
    loading.setLoading(false)
  }

  const poll = async () => {
    if (!isPolling) return
    try {
      const [statusRes, msgRes] = await Promise.all([fetch('/api/status'), fetch('/api/messages?limit=50')])
      updateStatus(await statusRes.json())
      const msgData = await msgRes.json()
      const messages = msgData.messages || []
      const newestId = messages.length > 0 ? messages[messages.length - 1].id : null
      if (messages.length !== lastMessageCount || newestId !== lastMessageId) {
        const enterMessageIds = collectNewMessageIds(messages)
        const rendered = doRender(messages, enterMessageIds)
        if (rendered) applyRenderedState(rendered)
        lastMessageCount = messages.length
        lastMessageId = newestId
        lastMessageIds = collectMessageIds(messages)
      } else { syncLoadingState() }
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
    awaitingReply = true
    lastMessageRole = 'user'
    loading.setLoading(true)
    try {
      const payload = {
        text,
        clientLocale: typeof navigator !== 'undefined' ? navigator.language : undefined,
        clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        clientOffsetMinutes: new Date().getTimezoneOffset(),
        clientNowIso: new Date().toISOString(),
      }
      if (activeQuote?.id) payload.quote = activeQuote.id
      const res = await fetch('/api/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let data = null
        try { data = await res.json() } catch { data = null }
        throw new Error(data?.error || 'Failed to send')
      }
      if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })) }
      clearQuote()
      await fetchAndRenderMessages()
    } catch (error) {
      renderError({ messagesEl, removeEmpty, updateScrollButton: scroll.updateScrollButton }, error)
      awaitingReply = false
      lastMessageRole = 'system'
      loading.setLoading(false)
    } finally {
      if (sendBtn) sendBtn.disabled = false
      if (input) { input.disabled = false; input.focus() }
    }
  }

  if (quoteClearBtn) quoteClearBtn.addEventListener('click', clearQuote)
  updateQuotePreview()

  const start = () => { if (isPolling) return; scroll.bindScrollControls(); isPolling = true; poll() }
  const stop = () => { isPolling = false; if (pollTimer) clearTimeout(pollTimer); pollTimer = null }
  const isFullyIdle = () => lastStatus && lastStatus.agentStatus === 'idle' && !(lastStatus.activeTasks ?? 0) && !(lastStatus.pendingTasks ?? 0)

  return { start, stop, sendMessage, isFullyIdle }
}
