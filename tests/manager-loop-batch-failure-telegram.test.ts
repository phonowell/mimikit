import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test, vi } from 'vitest'

import { publishUserInput } from '../src/kernel/streams/queues.js'
import { readHistory } from '../src/persistence/history/store.js'
import { recoverManagerBatchFailure } from '../src/policy/manager/loop-batch-flow.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { UserInput } from '../src/foundation/types/index.js'
import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const mockedSendTelegramTextMessage = vi.fn(() =>
  Promise.resolve({ messageId: 'tg-1' }),
)

vi.mock('../src/surface/channels/telegram/client.js', () => ({
  sendTelegramTextMessage: (...args: unknown[]) =>
    mockedSendTelegramTextMessage(...args),
}))

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-manager-failure-tg-'))
  tempDirs.push(dir)
  return dir
}

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir,
    runtimeId: 'runtime-manager-failure-telegram-test',
    pausedQueue: true,
  })
  const now = new Date().toISOString()
  runtime.domain.focuses.push({
    id: 'focus-main',
    title: 'Main',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastActivityAt: now,
  })
  return runtime
}

afterEach(async () => {
  mockedSendTelegramTextMessage.mockClear()
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

test('recoverManagerBatchFailure dispatches fallback reply to telegram source input', async () => {
  const runtime = await createRuntime()
  runtime.config.telegram.enabled = true
  runtime.config.telegram.botToken = 'bot-token'
  runtime.config.telegram.chatId = 'telegram-fallback-chat'
  runtime.config.telegram.apiRoot = 'https://api.telegram.org'
  runtime.config.telegram.proxy = ''
  const input: UserInput = {
    id: 'input-telegram-1',
    role: 'user',
    text: '现在怎么样了？',
    createdAt: '2026-03-08T06:18:36.155Z',
    focusId: 'focus-main',
    source: 'telegram',
    platform: 'telegram',
    telegramChatId: 'telegram-from-input',
    telegramMessageId: '42',
  }
  runtime.process.session.inflightInputs = [input]
  await publishUserInput({ paths: runtime.paths, payload: input })

  await recoverManagerBatchFailure({
    runtime,
    error: new Error(
      '[provider:openai-responses] sdk run failed: fetch failed',
    ),
    inputs: [input],
    results: [],
    nextInputsCursor: 1,
    nextResultsCursor: 0,
    agentInputsCount: 1,
    agentAppended: false,
    startedAt: Date.now() - 20,
  })

  const history = await readHistory(runtime.paths.history)
  const fallbackMessage = history.find((item) => {
    if (item.role !== 'system') return false
    return item.systemEventName === 'manager_fallback_reply'
  })
  const fallbackReply = fallbackMessage?.systemEventPayload?.reply
  expect(fallbackMessage?.systemEventPayload?.input_retained).toBe(true)
  expect(fallbackMessage?.text).toContain('已保留你刚才的输入')
  expect(fallbackReply).toBeTypeOf('string')
  expect(mockedSendTelegramTextMessage).toHaveBeenCalledWith({
    botToken: 'bot-token',
    apiRoot: 'https://api.telegram.org',
    proxy: '',
    chatId: 'telegram-from-input',
    text: fallbackReply,
  })
  expect(runtime.process.manager.resultReplayFailureCount).toBe(0)
  expect(runtime.process.manager.resultReplayReadyAtMs).toBe(0)
})
