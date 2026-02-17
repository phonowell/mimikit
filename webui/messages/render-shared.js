import { UI_TEXT } from '../system-text.js'
import { formatQuotePreview, formatRoleLabel, normalizeRole } from './quote-utils.js'

export const isAgentMessage = (msg) => msg?.role === 'assistant'

export const collectAckedUserMessageIds = (messages) => {
  const acked = new Set()
  let hasAgentAfter = false
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (isAgentMessage(msg)) {
      hasAgentAfter = true
      continue
    }
    if (msg?.role !== 'user' || msg?.id === null || msg?.id === undefined) continue
    if (hasAgentAfter) acked.add(String(msg.id))
  }
  return acked
}

export const findLatestAgentMessage = (messages) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (isAgentMessage(msg)) return msg
  }
  return null
}

const escapeSelectorValue = (value) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') 
    return CSS.escape(value)
  
  return value.replace(/"/g, '\\"')
}

const flashMessage = (target) => {
  target.classList.remove('message--flash')
  requestAnimationFrame(() => {
    target.classList.add('message--flash')
  })
  target.addEventListener(
    'animationend',
    () => {
      target.classList.remove('message--flash')
    },
    { once: true },
  )
}

export const createQuoteBlock = ({ quoteId, quoteMessage, messagesEl }) => {
  if (!quoteId) return null
  const quoteRole = normalizeRole(quoteMessage?.role)
  const label = quoteMessage ? formatRoleLabel(quoteMessage.role) : UI_TEXT.quoteUnknown
  const preview = quoteMessage
    ? formatQuotePreview(quoteMessage.text) || UI_TEXT.quoteFallbackMessage
    : UI_TEXT.quoteMissingMessage
  const quoteEl = document.createElement('button')
  quoteEl.type = 'button'
  quoteEl.className = 'message-quote'
  quoteEl.dataset.quoteRole = quoteRole
  quoteEl.dataset.quoteId = String(quoteId)
  if (quoteMessage && messagesEl) {
    quoteEl.addEventListener('click', () => {
      const targetId = quoteMessage.id
      if (!targetId) return
      const selectorId = escapeSelectorValue(String(targetId))
      const target = messagesEl.querySelector(`[data-message-id="${selectorId}"]`)
      if (!target) return
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      flashMessage(target)
    })
  } else 
    quoteEl.disabled = true
  
  const author = document.createElement('span')
  author.className = 'message-quote-author'
  author.textContent = label
  const text = document.createElement('span')
  text.className = 'message-quote-text'
  text.textContent = preview
  quoteEl.append(author, text)
  return quoteEl
}
