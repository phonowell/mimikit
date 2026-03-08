import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/test-utils.js'
import { buildPaths } from '../src/test-utils.js'
import { dispatchChannelPassiveReply } from '../src/channels/shared/passive-dispatch.js'

import type { RuntimeState } from '../src/types.js'
import type { UserInput } from '../src/types.js'

type DemoUserInput = Extract<UserInput, { role: 'user' }> & {
  source: 'telegram'
  telegramChatId?: string
  telegramMessageId?: string
}

const appendLogMock = vi.fn(async () => undefined)

vi.mock('../src/log.js', () => ({
  appendLog: (...args: unknown[]) => appendLogMock(...args),
}))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await mkdtemp(join(tmpdir(), 'mimikit-shared-passive-'))
  const config = defaultConfig({ workDir })
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

test('dispatchChannelPassiveReply logs skipped event when target is missing', async () => {
  appendLogMock.mockClear()
  const runtime = await createRuntime()

  await dispatchChannelPassiveReply<DemoUserInput>({
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
    enabled: true,
    sourceLabel: 'telegram',
    missingTargetReason: 'missing_chat_id',
    resolveLatestInput: (inputs) => inputs[inputs.length - 1] as DemoUserInput,
    resolveTargetId: () => '',
    buildMissingTargetLog: (input) => ({
      inputId: input.id,
      messageId: input.telegramMessageId,
    }),
    sendMessage: async () => ({ messageId: 'unused' }),
    buildSentLog: () => ({}),
  })

  expect(appendLogMock).toHaveBeenCalledTimes(1)
  expect(appendLogMock).toHaveBeenCalledWith(
    runtime.paths.log,
    expect.objectContaining({
      event: 'telegram_reply_skipped',
      reason: 'missing_chat_id',
      inputId: 'input-telegram-1',
    }),
  )
})

test('dispatchChannelPassiveReply sends and logs sent event', async () => {
  appendLogMock.mockClear()
  const runtime = await createRuntime()
  const sendMessage = vi.fn(async () => ({ messageId: 'reply-1' }))

  await dispatchChannelPassiveReply<DemoUserInput>({
    runtime,
    inputs: [
      {
        id: 'input-telegram-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-03-07T00:00:00.000Z',
        focusId: 'focus-global',
        source: 'telegram',
        telegramChatId: '1001',
        telegramMessageId: '11',
      },
    ],
    replyText: 'reply text',
    enabled: true,
    sourceLabel: 'telegram',
    resolveLatestInput: (inputs) => inputs[inputs.length - 1] as DemoUserInput,
    resolveTargetId: (input) => input.telegramChatId?.trim() ?? '',
    buildMissingTargetLog: () => ({}),
    sendMessage,
    buildSentLog: ({ input, targetId, sentMessageId }) => ({
      inputId: input.id,
      chatId: targetId,
      messageId: input.telegramMessageId,
      telegramReplyMessageId: sentMessageId,
    }),
  })

  expect(sendMessage).toHaveBeenCalledWith({ targetId: '1001', text: 'reply text' })
  expect(appendLogMock).toHaveBeenCalledTimes(1)
  expect(appendLogMock).toHaveBeenCalledWith(
    runtime.paths.log,
    expect.objectContaining({
      event: 'telegram_reply_sent',
      chatId: '1001',
      telegramReplyMessageId: 'reply-1',
    }),
  )
})
