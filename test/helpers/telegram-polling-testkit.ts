import { defaultConfig } from '../../src/config.js'
import {
  startTelegramPolling,
  stopTelegramPolling,
} from '../../src/channels/telegram/polling.js'

type ChatType = 'private' | 'group' | 'supergroup' | 'channel'
export type TextContext = {
  message: {
    text: string
    message_id: number
    date: number
  }
  chat: {
    id: number
    type: ChatType
  }
  update: {
    update_id: number
  }
  botInfo: {
    username: string
  }
  reply: (text: string) => Promise<void>
}

export class MockTelegraf {
  static instances: MockTelegraf[] = []

  static reset() {
    MockTelegraf.instances = []
  }

  private textHandler:
    | ((ctx: TextContext) => Promise<void> | void)
    | undefined = undefined

  constructor(_token: string, _options: unknown) {
    MockTelegraf.instances.push(this)
  }

  catch(_handler: (error: unknown) => Promise<void> | void): this {
    return this
  }

  on(
    event: string,
    handler: (ctx: TextContext) => Promise<void> | void,
  ): this {
    if (event === 'text') this.textHandler = handler
    return this
  }

  async launch(_options: unknown): Promise<void> {}

  stop(_reason: string): void {}

  async emitText(ctx: TextContext): Promise<void> {
    await this.textHandler?.(ctx)
  }
}

let workDirCounter = 0
const startedWorkDirs = new Set<string>()

export const buildTextContext = (params: {
  text: string
  chatType?: ChatType
  reply?: (text: string) => Promise<void>
  botUsername?: string
}): TextContext => ({
  message: {
    text: params.text,
    message_id: 11,
    date: 1_700_000_000,
  },
  chat: {
    id: 1001,
    type: params.chatType ?? 'private',
  },
  update: {
    update_id: 22,
  },
  botInfo: {
    username: params.botUsername ?? 'mimikit_bot',
  },
  reply: params.reply ?? (async () => undefined),
})

export const startPolling = async (params?: {
  addUserInput?: (text: string, meta?: object, quote?: string) => Promise<string>
  requestRestart?: (
    reason: string,
  ) => 'scheduled' | 'busy' | 'already_scheduled' | Promise<'scheduled' | 'busy' | 'already_scheduled'>
}) => {
  const config = defaultConfig({ workDir: `.mimikit-test-${workDirCounter}` })
  workDirCounter += 1
  config.telegram.enabled = true
  config.telegram.botToken = 'token-test'
  config.telegram.chatId = '1001'

  await startTelegramPolling({
    config,
    logPath: '/tmp/telegram-polling-test.log',
    workDir: config.workDir,
    addUserInput: params?.addUserInput ?? (async () => 'input-1'),
    ...(params?.requestRestart
      ? { requestRestart: params.requestRestart }
      : {}),
  })
  startedWorkDirs.add(config.workDir)
  const bot = MockTelegraf.instances[MockTelegraf.instances.length - 1]
  if (!bot) throw new Error('expected telegraf instance')
  return { bot }
}

export const stopAllPollers = async (): Promise<void> => {
  const workDirs = [...startedWorkDirs]
  startedWorkDirs.clear()
  MockTelegraf.reset()
  await Promise.all(
    workDirs.map((workDir) =>
      stopTelegramPolling({
        workDir,
        logPath: '/tmp/telegram-polling-test.log',
      }),
    ),
  )
}
