type ChannelSendResult = {
  messageId?: string
}

type TelegramSendParams = {
  botToken: string
  chatId: string
  text: string
  apiRoot: string
  proxy: string
}

type FeishuSendParams = {
  appId: string
  appSecret: string
  chatId: string
  text: string
}

const importModule = <T>(relativePath: string): Promise<T> => {
  const { href } = new URL(relativePath, import.meta.url)
  return import(href) as Promise<T>
}

export const sendTelegramChannelText = async (
  params: TelegramSendParams,
): Promise<ChannelSendResult> => {
  const module = await importModule<{
    sendTelegramTextMessage: (
      value: TelegramSendParams,
    ) => Promise<ChannelSendResult>
  }>('../../../channels/src/surface/channels/telegram/client.js')
  return module.sendTelegramTextMessage(params)
}

export const sendFeishuChannelText = async (
  params: FeishuSendParams,
): Promise<ChannelSendResult> => {
  const module = await importModule<{
    sendFeishuTextMessage: (
      value: FeishuSendParams,
    ) => Promise<ChannelSendResult>
  }>('../../../channels/src/surface/channels/feishu/client.js')
  return module.sendFeishuTextMessage(params)
}
