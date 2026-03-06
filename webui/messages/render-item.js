import { createQuoteBlock, isAgentMessage } from './render-shared.js'
import {
  formatManagerFallbackRetryHint,
  shouldShowManagerFallbackRetry,
} from './fallback-retry.js'
import { UI_TEXT } from '../system-text.js'
import { createIconElement } from '../icon.js'

export const renderMessage = (params, msg) => {
  const {
    messagesEl,
    renderMarkdown,
    formatDisplayTimeWithFull,
    formatUsage,
    formatElapsedLabel,
    enterMessageIds,
    onQuote,
    onDelete,
    onRetryManagerFallback,
    isRetryPending,
    messageLookup,
    appendTarget,
    isDeleteMode,
  } = params
  if (!messagesEl) return

  const item = document.createElement('li')
  const roleClass = msg.role === 'agent' ? 'agent' : msg.role
  const isSystemMessage = msg?.role === 'system'
  const isEntering = enterMessageIds?.has(msg?.id)
  item.className = `message ${roleClass}${isEntering ? ' message--enter' : ''}`
  if (msg?.id) item.dataset.messageId = String(msg.id)

  const quoteModeEnabled = !isDeleteMode
  const canQuote = Boolean(
    quoteModeEnabled && onQuote && msg?.id && !isSystemMessage,
  )
  const canDelete = Boolean(
    isDeleteMode && onDelete && msg?.id && !isSystemMessage,
  )
  const canRetryManagerFallback = Boolean(
    !isDeleteMode &&
      onRetryManagerFallback &&
      shouldShowManagerFallbackRetry(msg),
  )
  if (canQuote) {
    item.classList.add('message--quoteable')
    item.tabIndex = 0
  }

  const article = document.createElement('article')
  if (canQuote) {
    article.addEventListener('dblclick', () => {
      if (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 640px)').matches
      ) 
        return
      
      onQuote(msg)
    })
  }

  const content = document.createElement('div')
  content.className = 'content'
  const text = msg?.text ?? ''
  if (msg?.quote && messageLookup) {
    const quoteMessage = messageLookup.get(String(msg.quote))
    const quoteBlock = createQuoteBlock({ quoteId: msg.quote, quoteMessage, messagesEl })
    if (quoteBlock) article.appendChild(quoteBlock)
  }
  if (isAgentMessage(msg)) {
    content.classList.add('markdown')
    content.appendChild(renderMarkdown(text))
  } else content.textContent = text

  article.appendChild(content)
  const retryHint = canRetryManagerFallback
    ? formatManagerFallbackRetryHint(msg)
    : ''
  if (retryHint) {
    const hint = document.createElement('small')
    hint.className = 'message-retry-hint'
    hint.textContent = retryHint
    article.appendChild(hint)
  }

  const usageDisplay = isAgentMessage(msg) ? formatUsage(msg.usage) : null
  const usageText = usageDisplay?.text ?? ''
  const elapsedText = isAgentMessage(msg) ? formatElapsedLabel(msg.elapsedMs) : ''
  const meta = document.createElement('small')
  meta.className = 'meta'
  if (usageText) {
    const usage = document.createElement('span')
    usage.className = 'usage'
    usage.textContent = usageText
    if (usageDisplay?.title) usage.title = usageDisplay.title
    meta.appendChild(usage)
  }
  if (elapsedText) {
    const elapsed = document.createElement('span')
    elapsed.className = 'elapsed'
    elapsed.textContent = usageText ? `· ${elapsedText}` : elapsedText
    meta.appendChild(elapsed)
  }

  let quoteBtn = null
  if (canQuote) {
    quoteBtn = document.createElement('button')
    quoteBtn.type = 'button'
    quoteBtn.className = 'btn btn--xs btn--icon message-quote-btn'
    quoteBtn.appendChild(
      createIconElement(msg.role === 'user' ? 'corner-up-right' : 'corner-up-left'),
    )
    quoteBtn.title = UI_TEXT.quote
    quoteBtn.setAttribute('aria-label', UI_TEXT.quote)
    quoteBtn.addEventListener('click', () => onQuote(msg))
  }

  let deleteBtn = null
  if (canDelete) {
    deleteBtn = document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.className = 'btn btn--xs btn--icon message-delete-btn'
    deleteBtn.appendChild(createIconElement('x'))
    deleteBtn.title = UI_TEXT.delete
    deleteBtn.setAttribute('aria-label', UI_TEXT.delete)
    deleteBtn.addEventListener('click', () => onDelete(msg))
  }

  let retryBtn = null
  if (canRetryManagerFallback) {
    retryBtn = document.createElement('button')
    retryBtn.type = 'button'
    retryBtn.className = 'btn btn--xs btn--icon message-retry-btn'
    retryBtn.appendChild(createIconElement('rotate-ccw'))
    retryBtn.title = UI_TEXT.retryRequestAria
    retryBtn.setAttribute('aria-label', UI_TEXT.retryRequestAria)
    if (typeof isRetryPending === 'function')
      retryBtn.disabled = Boolean(isRetryPending(msg))

    retryBtn.addEventListener('click', async () => {
      if (retryBtn?.disabled) return
      retryBtn.disabled = true
      try {
        await onRetryManagerFallback(msg)
      } finally {
        if (typeof isRetryPending === 'function')
          retryBtn.disabled = Boolean(isRetryPending(msg))
      }
    })
  }

  if (!isSystemMessage) {
    const timeDisplay = formatDisplayTimeWithFull(msg.createdAt)
    if (timeDisplay.displayText) {
      const time = document.createElement('span')
      time.className = 'time'
      time.textContent = timeDisplay.displayText
      time.title =
        timeDisplay.fullText ||
        (typeof msg.createdAt === 'string' ? msg.createdAt : '')
      meta.appendChild(time)
    }
  }
  if (meta.childElementCount > 0) article.appendChild(meta)

  item.appendChild(article)
  if (retryBtn) item.appendChild(retryBtn)
  if (quoteBtn) item.appendChild(quoteBtn)
  if (deleteBtn) item.appendChild(deleteBtn)
  const target = appendTarget ?? messagesEl
  target.appendChild(item)
  return item
}
