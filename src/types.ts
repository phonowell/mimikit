type UserInputBase = {
  id: string
  createdAt: string
  focusId?: string
  visibility?: string
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

type UserInputSystem = UserInputBase & {
  role: 'system'
  text: string
}

export type UserInput = UserInputUser | UserInputAssistant | UserInputSystem

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
  workDir: string
  telegram: TelegramConfig
  feishu: FeishuConfig
}

export type RuntimeState = {
  config: AppConfig
  paths: {
    log: string
  }
  [key: string]: unknown
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
