import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { afterEach, expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { dispatchTelegramPassiveReply } from '../src/channels/telegram/passive-reply.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const mockedSendTelegramTextMessage = vi.fn(async () => ({ messageId: 'msg-1' }))

vi.mock('../src/channels/telegram/client.js', () => ({
  sendTelegramTextMessage: (...args: unknown[]) =>
    mockedSendTelegramTextMessage(...args),
}))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-telegram-passive-'))
  const config = defaultConfig({ workDir })
  config.telegram.enabled = true
  config.telegram.botToken = 'bot-token'
  config.telegram.chatId = 'fallback-chat-id'
  config.telegram.apiRoot = 'https://api.telegram.org'
  const queue = new PQueue({ concurrency: 1 })

  return {
    runtimeId: 'runtime-test',
    config,
    paths: buildPaths(workDir),
    stopped: false,
    managerRunning: false,
    managerSignalController: new AbortController(),
    managerWakePending: false,
    lastManagerActivityAtMs: Date.now(),
    lastWorkerActivityAtMs: Date.now(),
    inflightInputs: [],
    queues: { inputsCursor: 0, resultsCursor: 0 },
    tasks: [],
    taskPlans: [],
    focuses: [],
    focusContexts: [],
    activeFocusIds: [],
    managerTurn: 0,
    memoryRefresh: {
      lastCompletedTurn: 0,
      lastProcessedInputsCursor: 0,
      lastProcessedResultsCursor: 0,
      running: false,
      pending: false,
    },
    managerFocusCompressedContexts: [],
    runningControllers: new Map(),
    createTaskDebounce: new Map(),
    workerQueue: queue,
    workerSignalController: new AbortController(),
    uiWakeVersion: 0,
    uiWakeEvents: new Map(),
    uiSignalControllers: new Set(),
    pendingUserChoice: null,
  }
}

afterEach(() => {
  mockedSendTelegramTextMessage.mockClear()
})

test('dispatchTelegramPassiveReply falls back to configured chat id when input chat id is missing', async () => {
  const runtime = await createRuntime()
  await dispatchTelegramPassiveReply({
    runtime,
    inputs: [
      {
        id: 'input-telegram-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-03-07T00:00:00.000Z',
        focusId: 'focus-global',
        source: 'telegram',
      },
    ],
    replyText: 'reply text',
  })

  expect(mockedSendTelegramTextMessage).toHaveBeenCalledWith({
    botToken: 'bot-token',
    apiRoot: 'https://api.telegram.org',
    proxy: '',
    chatId: 'fallback-chat-id',
    text: 'reply text',
  })
})
