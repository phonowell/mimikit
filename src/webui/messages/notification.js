import { isAgentMessage } from './render-shared.js'

const MAX_NOTIFICATION_BODY_LENGTH = 160

const truncateBody = (text) => {
  const normalized = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : ''
  if (!normalized) return 'You have a new reply.'
  if (normalized.length <= MAX_NOTIFICATION_BODY_LENGTH) return normalized
  return `${normalized.slice(0, MAX_NOTIFICATION_BODY_LENGTH - 1)}…`
}

const createNoopController = () => ({
  bindPermissionPrompt: () => () => {},
  primePermission: () => {},
  notifyMessages: () => {},
})

export const buildNotificationPayload = ({
  messages,
  newMessageIds,
  pageActive,
  lastNotifiedAgentMessageId,
}) => {
  if (pageActive) return null
  if (!newMessageIds || newMessageIds.size === 0) return null
  if (!Array.isArray(messages) || messages.length === 0) return null

  let latestAgentMessage = null
  let newAgentCount = 0
  for (const message of messages) {
    const messageId = message?.id != null ? String(message.id) : null
    if (!messageId) continue
    if (!newMessageIds.has(message.id) && !newMessageIds.has(messageId)) continue
    if (!isAgentMessage(message)) continue
    if (messageId === lastNotifiedAgentMessageId) continue
    latestAgentMessage = message
    newAgentCount += 1
  }
  if (!latestAgentMessage) return null

  return {
    messageId: String(latestAgentMessage.id),
    title: newAgentCount > 1 ? `Mimikit · ${newAgentCount} new replies` : 'Mimikit · New reply',
    body: truncateBody(latestAgentMessage.text),
  }
}

export const createBrowserNotificationController = ({
  windowRef = typeof window !== 'undefined' ? window : null,
  documentRef = typeof document !== 'undefined' ? document : null,
  NotificationRef = typeof Notification !== 'undefined' ? Notification : null,
} = {}) => {
  if (!windowRef || !documentRef || !NotificationRef) return createNoopController()

  let lastNotifiedAgentMessageId = null

  const requestPermission = () => {
    if (NotificationRef.permission !== 'default') return
    Promise.resolve(NotificationRef.requestPermission()).catch((error) => {
      console.warn('[webui] request notification permission failed', error)
    })
  }

  const bindPermissionPrompt = () => {
    if (NotificationRef.permission !== 'default') return () => {}
    const onUserGesture = () => {
      documentRef.removeEventListener('pointerdown', onUserGesture, listenerOptions)
      documentRef.removeEventListener('keydown', onUserGesture, listenerOptions)
      requestPermission()
    }
    const listenerOptions = { capture: true }
    documentRef.addEventListener('pointerdown', onUserGesture, listenerOptions)
    documentRef.addEventListener('keydown', onUserGesture, listenerOptions)
    return () => {
      documentRef.removeEventListener('pointerdown', onUserGesture, listenerOptions)
      documentRef.removeEventListener('keydown', onUserGesture, listenerOptions)
    }
  }

  const notifyMessages = (messages, newMessageIds) => {
    if (NotificationRef.permission !== 'granted') return
    const pageActive =
      documentRef.visibilityState === 'visible' &&
      (typeof documentRef.hasFocus !== 'function' || documentRef.hasFocus())
    const payload = buildNotificationPayload({
      messages,
      newMessageIds,
      pageActive,
      lastNotifiedAgentMessageId,
    })
    if (!payload) return

    try {
      const notification = new NotificationRef(payload.title, {
        body: payload.body,
        tag: 'mimikit-agent-reply',
      })
      notification.onclick = () => {
        windowRef.focus()
        notification.close()
      }
      lastNotifiedAgentMessageId = payload.messageId
    } catch (error) {
      console.warn('[webui] show notification failed', error)
    }
  }

  return {
    bindPermissionPrompt,
    primePermission: requestPermission,
    notifyMessages,
  }
}
