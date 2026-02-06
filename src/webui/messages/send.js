import { renderError } from './render.js'

export function createSendHandler({
  sendBtn,
  input,
  messageState,
  loading,
  quote,
  fetchAndRenderMessages,
  scroll,
  messagesEl,
  removeEmpty,
}) {
  return async (text) => {
    if (!text) return
    const trimmed = text.trim()
    if (!trimmed) return
    if (sendBtn) sendBtn.disabled = true
    if (input) input.disabled = true
    messageState.awaitingReply = true
    messageState.lastMessageRole = 'user'
    try {
      const payload = {
        text: trimmed,
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
}
