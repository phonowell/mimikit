import { renderError } from './render.js'
import { fetchWithTimeout } from '../fetch-with-timeout.js'
import { UI_TEXT } from '../system-text.js'

const SEND_REQUEST_TIMEOUT_MS = 45000

export function createSendHandler({
  sendBtn,
  input,
  messageState,
  loading,
  quote,
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
      const res = await fetchWithTimeout(
        '/api/input',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        SEND_REQUEST_TIMEOUT_MS,
      )
      if (!res.ok) {
        let data = null
        try {
          data = await res.json()
        } catch {
          data = null
        }
        throw new Error(data?.error || UI_TEXT.sendFailed)
      }
      if (input) {
        input.value = ''
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      quote.clear()
      loading.setLoading(true)
    } catch (error) {
      const isAbortError = error instanceof DOMException && error.name === 'AbortError'
      const renderTargetError = isAbortError
        ? new Error('Send timeout')
        : error
      renderError(
        { messagesEl, removeEmpty, updateScrollButton: scroll.updateScrollButton },
        renderTargetError,
      )
      messageState.awaitingReply = false
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
