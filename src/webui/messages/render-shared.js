export const isAgentMessage = (msg) => msg?.role === 'assistant'

export const collectAckedUserMessageIds = (messages, loadingActive = false) => {
  const acked = new Set()
  let hasAgentAfter = false
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (isAgentMessage(msg)) {
      hasAgentAfter = true
      continue
    }
    if (msg?.role !== 'user' || msg?.id == null) continue
    if (hasAgentAfter) acked.add(String(msg.id))
  }
  if (!loadingActive) return acked
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg?.role !== 'user' || msg?.id == null) continue
    acked.add(String(msg.id))
    break
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

const normalizeRole = (role) => {
  if (role === 'assistant') return 'agent'
  if (role === 'user') return 'user'
  if (role === 'system') return 'system'
  return 'unknown'
}

const formatRoleLabel = (role) => {
  const normalized = normalizeRole(role)
  if (normalized === 'user') return 'You'
  if (normalized === 'agent') return 'Agent'
  if (normalized === 'system') return 'System'
  return 'Quoted message'
}

const cleanText = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()

const formatQuotePreview = (text) => {
  const cleaned = cleanText(text)
  if (!cleaned) return ''
  const max = 140
  return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned
}

const escapeSelectorValue = (value) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
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
  const label = quoteMessage ? formatRoleLabel(quoteMessage.role) : 'Quoted message'
  const preview = quoteMessage
    ? formatQuotePreview(quoteMessage.text) || 'Message'
    : 'Message unavailable'
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
  } else {
    quoteEl.disabled = true
  }
  const author = document.createElement('span')
  author.className = 'message-quote-author'
  author.textContent = label
  const text = document.createElement('span')
  text.className = 'message-quote-text'
  text.textContent = preview
  quoteEl.append(author, text)
  return quoteEl
}

