import { renderMarkdown } from '../markdown.js'
import { formatTime } from '../time.js'

import { formatElapsedLabel, formatUsage } from './format.js'
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
    formatElapsedLabel,
    loadingTimeThreshold: 3000,
  })

  const syncLoadingState = () => {
    const pendingInputs = lastStatus?.pendingInputs ?? 0
    const shouldWait =
      awaitingReply || (pendingInputs > 0 && lastMessageRole === 'user')
    if (shouldWait) {
      if (!loading.isLoading()) loading.setLoading(true)
      return
    }
    if (loading.isLoading()) loading.setLoading(false)
  }

  const applyRenderedState = (rendered) => {
    if (rendered?.latestAgentId) {
      if (rendered.latestAgentId !== lastAgentMessageId) {
        lastAgentMessageId = rendered.latestAgentId
        awaitingReply = false
        loading.setLoading(false)
      }
    }
    if (rendered?.lastRole !== null && rendered?.lastRole !== undefined) {
      lastMessageRole = rendered.lastRole
    }
    if (rendered?.lastIsAgent) awaitingReply = false
    syncLoadingState()
  }

  const updateStatus = (status) => {
    lastStatus = status
    if (!statusText || !statusDot) {
      syncLoadingState()
      return
    }
    statusDot.dataset.state = status.agentStatus
    const parts = [status.agentStatus]
    if (status.activeTasks > 0) parts.push(`${status.activeTasks} tasks`)
    if (status.pendingTasks > 0) parts.push(`${status.pendingTasks} pending`)
    statusText.textContent = parts.join(' · ')
    syncLoadingState()
  }

  const setDisconnected = () => {
    if (statusText) statusText.textContent = 'disconnected'
    if (statusDot) statusDot.dataset.state = ''
    lastStatus = null
    lastMessageRole = null
    awaitingReply = false
    loading.setLoading(false)
  }

  const poll = async () => {
    if (!isPolling) return
    try {
      const [statusRes, msgRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/messages?limit=50'),
      ])

      const status = await statusRes.json()
      const msgData = await msgRes.json()
      updateStatus(status)

      const messages = msgData.messages || []
      const newestMessageId =
        messages.length > 0 ? messages[messages.length - 1].id : null
      if (
        messages.length !== lastMessageCount ||
        newestMessageId !== lastMessageId
      ) {
        if (messages.length > 0) {
          const rendered = renderMessages({
            messages,
            messagesEl,
            renderMarkdown,
            formatTime,
            formatUsage,
            formatElapsedLabel,
            removeEmpty,
            isNearBottom: scroll.isNearBottom,
            scrollToBottom: scroll.scrollToBottom,
            updateScrollButton: scroll.updateScrollButton,
            loading,
          })
          applyRenderedState(rendered)
        }
        lastMessageCount = messages.length
        lastMessageId = newestMessageId
      } else {
        syncLoadingState()
      }
    } catch {
      setDisconnected()
    }

    if (!isPolling) return
    pollTimer = window.setTimeout(poll, 2000)
  }

  const sendMessage = async (text) => {
    if (!text) return
    if (sendBtn) sendBtn.disabled = true
    if (input) input.disabled = true
    awaitingReply = true
    lastMessageRole = 'user'
    loading.setLoading(true)

    try {
      const res = await fetch('/api/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
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

      if (input) input.value = ''

      const msgRes = await fetch('/api/messages?limit=50')
      const msgData = await msgRes.json()
      const messages = msgData.messages || []
      const newestMessageId =
        messages.length > 0 ? messages[messages.length - 1].id : null
      const rendered = renderMessages({
        messages,
        messagesEl,
        renderMarkdown,
        formatTime,
        formatUsage,
        formatElapsedLabel,
        removeEmpty,
        isNearBottom: scroll.isNearBottom,
        scrollToBottom: scroll.scrollToBottom,
        updateScrollButton: scroll.updateScrollButton,
        loading,
      })
      applyRenderedState(rendered)
      lastMessageCount = messages.length
      lastMessageId = newestMessageId
    } catch (error) {
      renderError(
        { messagesEl, removeEmpty, updateScrollButton: scroll.updateScrollButton },
        error,
      )
      awaitingReply = false
      lastMessageRole = 'system'
      loading.setLoading(false)
    } finally {
      if (sendBtn) sendBtn.disabled = false
      if (input) {
        input.disabled = false
        input.focus()
      }
    }
  }

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

  const isFullyIdle = () => {
    if (!lastStatus) return false
    return (
      lastStatus.agentStatus === 'idle' &&
      (lastStatus.activeTasks ?? 0) === 0 &&
      (lastStatus.pendingTasks ?? 0) === 0
    )
  }

  return { start, stop, sendMessage, isFullyIdle }
}

export function bindComposer({ form, input, messages }) {
  if (!form || !input || !messages) return

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (text) messages.sendMessage(text)
  })

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
}
