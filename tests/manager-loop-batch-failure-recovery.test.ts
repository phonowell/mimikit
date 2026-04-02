import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test, vi } from 'vitest'

import { ProviderError } from '../src/execution/providers/provider-error.js'
import {
  consumeWorkerResults,
  publishUserInput,
  publishWorkerResult,
} from '../src/kernel/streams/queues.js'
import { readHistory } from '../src/persistence/history/store.js'
import { recoverManagerBatchFailure } from '../src/policy/manager/loop-batch-flow.js'
import { createTask } from '../src/work/orchestrator/task-lifecycle.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { TaskResult, UserInput } from '../src/foundation/types/index.js'
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
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-manager-failure-recover-'))
  tempDirs.push(dir)
  return dir
}

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir,
    runtimeId: 'runtime-manager-failure-recover-test',
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
test('recoverManagerBatchFailure keeps task results pending for replay after manager fetch failure', async () => {
  const runtime = await createRuntime()
  const task = createTask(
    runtime.config.workDir,
    'fix manager issue',
    'Fix manager issue',
    runtime.config.workDir,
    'worker',
    'codex',
    'focus-main',
  )
  task.status = 'succeeded'
  task.completedAt = '2026-03-08T06:19:38.113Z'
  task.durationMs = 42
  runtime.domain.tasks.push(task)

  const input: UserInput = {
    id: 'input-1',
    role: 'user',
    text: '网络波动了？',
    createdAt: '2026-03-08T06:18:36.155Z',
    focusId: 'focus-main',
    source: 'webui',
    platform: 'webui',
  }
  const result: TaskResult = {
    taskId: task.id,
    status: 'succeeded',
    ok: true,
    output: '已完成',
    durationMs: 42,
    completedAt: '2026-03-08T06:19:38.113Z',
    profile: 'worker',
    provider: 'codex',
  }
  runtime.process.session.inflightInputs = [input]
  await publishUserInput({ paths: runtime.paths, payload: input })
  await publishWorkerResult({ paths: runtime.paths, payload: result })

  await recoverManagerBatchFailure({
    runtime,
    error: new ProviderError({
      code: 'provider_transient_network',
      message: '[provider:openai-responses] sdk run failed: fetch failed',
      retryable: true,
    }),
    inputs: [input],
    results: [result],
    nextInputsCursor: 1,
    nextResultsCursor: 1,
    agentInputsCount: 1,
    agentAppended: false,
    startedAt: Date.now() - 20,
  })

  expect(runtime.domain.queues.inputsCursor).toBe(1)
  expect(runtime.domain.queues.resultsCursor).toBe(0)
  expect(runtime.process.session.inflightInputs).toHaveLength(0)
  expect(runtime.domain.tasks[0]?.result).toBeUndefined()
  expect(runtime.process.manager.resultReplayFailureCount).toBe(1)
  expect(runtime.process.manager.resultReplayReadyAtMs).toBeGreaterThan(
    Date.now(),
  )
  const pendingResults = await consumeWorkerResults({
    paths: runtime.paths,
    fromCursor: runtime.domain.queues.resultsCursor,
  })
  expect(pendingResults).toHaveLength(1)
  expect(pendingResults[0]?.payload.taskId).toBe(task.id)

  const history = await readHistory(runtime.paths.history)
  expect(history.some((item) => item.id === input.id)).toBe(true)
  const fallbackMessage = history.find((item) => {
    if (item.role !== 'system') return false
    return item.systemEventName === 'manager_fallback_reply'
  })
  expect(fallbackMessage).toBeDefined()
  expect(fallbackMessage?.systemEventPayload?.source_input_id).toBe(input.id)
  expect(fallbackMessage?.systemEventPayload?.input_retained).toBe(true)
  expect(fallbackMessage?.systemEventPayload?.pending_result_count).toBe(1)
  expect(fallbackMessage?.text).toContain('已保留你刚才的输入')
  expect(fallbackMessage?.text).toContain('1 条任务结果')

  const managerErrorMessage = history.find((item) => {
    if (item.role !== 'system') return false
    return item.systemEventName === 'manager_error'
  })
  expect(managerErrorMessage).toBeDefined()
})
