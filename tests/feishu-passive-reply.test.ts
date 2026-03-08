import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { afterEach, expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { dispatchFeishuPassiveReply } from '../src/channels/feishu/passive-reply.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const mockedSendFeishuTextMessage = vi.fn(async () => ({ messageId: 'msg-1' }))

vi.mock('../src/channels/feishu/client.js', () => ({
  sendFeishuTextMessage: (...args: unknown[]) =>
    mockedSendFeishuTextMessage(...args),
}))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-feishu-passive-'))
  const config = defaultConfig({ workDir })
  config.feishu.enabled = true
  config.feishu.appId = 'app-id'
  config.feishu.appSecret = 'app-secret'
  config.feishu.chatId = 'oc_fallback_chat'
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
  mockedSendFeishuTextMessage.mockClear()
})

test('dispatchFeishuPassiveReply sends reply to chat from latest feishu input', async () => {
  const runtime = await createRuntime()
  await dispatchFeishuPassiveReply({
    runtime,
    inputs: [
      {
        id: 'input-feishu-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-03-07T00:00:00.000Z',
        focusId: 'focus-global',
        source: 'feishu',
        feishuChatId: 'oc_from_input',
      },
    ],
    replyText: 'reply text',
  })

  expect(mockedSendFeishuTextMessage).toHaveBeenCalledWith({
    appId: 'app-id',
    appSecret: 'app-secret',
    chatId: 'oc_from_input',
    text: 'reply text',
  })
})

test('dispatchFeishuPassiveReply falls back to configured chat id when input chat id is missing', async () => {
  const runtime = await createRuntime()
  await dispatchFeishuPassiveReply({
    runtime,
    inputs: [
      {
        id: 'input-feishu-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-03-07T00:00:00.000Z',
        focusId: 'focus-global',
        source: 'feishu',
      },
    ],
    replyText: 'reply text',
  })

  expect(mockedSendFeishuTextMessage).toHaveBeenCalledWith({
    appId: 'app-id',
    appSecret: 'app-secret',
    chatId: 'oc_fallback_chat',
    text: 'reply text',
  })
})
