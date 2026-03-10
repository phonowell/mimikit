export type FeishuInboundEvent = {
  event_id?: string
  create_time?: string
  message?: {
    message_id?: string
    create_time?: string
    chat_id?: string
    message_type?: string
    content?: string
    mentions?: Array<{
      key?: string
      id?: {
        open_id?: string
        user_id?: string
        union_id?: string
      }
      name?: string
    }>
  }
}

type FeishuTextContent = { text?: unknown }
type FeishuImageContent = { image_key?: unknown }

const safeJsonParse = <T>(value: string | undefined): T | undefined => {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

export const resolveTextFromMessage = (event: FeishuInboundEvent): string => {
  const content = safeJsonParse<FeishuTextContent>(event.message?.content)
  return typeof content?.text === 'string' ? content.text.trim() : ''
}

export const resolveImageFallbackText = (event: FeishuInboundEvent): string => {
  const imageInfo = safeJsonParse<FeishuImageContent>(event.message?.content)
  return imageInfo?.image_key ? `image_key=${String(imageInfo.image_key)}` : ''
}

export const toIsoFromUnixMillis = (
  value: string | undefined,
): string | undefined => {
  if (!value) return undefined
  const ms = Number(value)
  if (!Number.isFinite(ms)) return undefined
  return new Date(ms).toISOString()
}

export const shouldIgnoreMessage = (event: FeishuInboundEvent): boolean => {
  const messageType = event.message?.message_type?.trim().toLowerCase()
  if (!messageType) return true
  return messageType !== 'text' && messageType !== 'image'
}

export const resolveReplyTargetChatId = (
  configuredChatId: string,
  event: FeishuInboundEvent,
): string => {
  const configured = configuredChatId.trim()
  if (configured) return configured
  return event.message?.chat_id?.trim() ?? ''
}
