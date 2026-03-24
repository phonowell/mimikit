import { AppType, Client } from '@larksuiteoapi/node-sdk'

type FeishuClientConfig = {
  appId: string
  appSecret: string
}

const feishuClientCache = new Map<string, Client>()

const resolveClient = (config: FeishuClientConfig): Client => {
  const key = `${config.appId}\n${config.appSecret}`
  const cached = feishuClientCache.get(key)
  if (cached) return cached

  const client = new Client({
    appId: config.appId,
    appSecret: config.appSecret,
    appType: AppType.SelfBuild,
  })
  feishuClientCache.set(key, client)
  return client
}

type FeishuReceiveIdType =
  | 'chat_id'
  | 'open_id'
  | 'union_id'
  | 'user_id'
  | 'email'

export const sendFeishuTextMessage = async (params: {
  appId: string
  appSecret: string
  chatId: string
  text: string
  receiveIdType?: FeishuReceiveIdType
}): Promise<{ messageId?: string }> => {
  const appId = params.appId.trim()
  const appSecret = params.appSecret.trim()
  const chatId = params.chatId.trim()
  const text = params.text.trim()
  const receiveIdType = params.receiveIdType ?? 'chat_id'

  if (!appId) throw new Error('feishu_send_invalid_config:missing_app_id')
  if (!appSecret)
    throw new Error('feishu_send_invalid_config:missing_app_secret')
  if (!chatId) throw new Error('feishu_send_invalid_config:missing_chat_id')
  if (!text) throw new Error('feishu_send_invalid_payload:empty_text')

  const client = resolveClient({ appId, appSecret })
  try {
    const sent = await client.im.v1.message.create({
      params: { receive_id_type: receiveIdType },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    })
    return sent.data?.message_id ? { messageId: sent.data.message_id } : {}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`feishu_send_failed:${message}`)
  }
}
