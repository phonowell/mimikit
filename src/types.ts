type UserInputBase = {
  id: string
  createdAt: string
  focusId?: string
}

type UserInputUser = UserInputBase & {
  role: 'user'
  text: string
  source?: string
  platform?: string
  channel?: string
  telegramChatId?: string
  telegramMessageId?: string
  telegramUpdateId?: string
  telegramTimestamp?: string
  feishuChatId?: string
  feishuMessageId?: string
  feishuEventId?: string
  feishuTimestamp?: string
}

type UserInputAssistant = UserInputBase & {
  role: 'assistant'
  text: string
}

export type UserInput = UserInputUser | UserInputAssistant

export type TelegramConfig = {
  enabled: boolean
  botToken: string
  chatId: string
  apiRoot: string
  proxy: string
}

export type FeishuConfig = {
  enabled: boolean
  appId: string
  appSecret: string
  chatId: string
}

export type AppConfig = {
  telegram: TelegramConfig
  feishu: FeishuConfig
}

export type RuntimeState = {
  config: AppConfig
  paths: {
    log: string
  }
}

export type UserMeta = {
  source?: string
  platform?: string
  channel?: string
  telegramChatId?: string
  telegramMessageId?: string
  telegramUpdateId?: string
  telegramTimestamp?: string
  feishuChatId?: string
  feishuMessageId?: string
  feishuEventId?: string
  feishuTimestamp?: string
}
