import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../src/focus/index.js'
import { readHistory } from '../src/history/store.js'
import { recoverManagerBatchFailure } from '../src/manager/loop-batch-flow.js'
import { createTask } from '../src/orchestrator/core/task-lifecycle.js'
import { parseSystemEventText } from '../src/shared/system-event.js'
import {
  consumeWorkerResults,
  publishUserInput,
  publishWorkerResult,
} from '../src/streams/queues.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { TaskResult, UserInput } from '../src/types/index.js'

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
  runtime.focuses.push({
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
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

test('recoverManagerBatchFailure keeps task results pending for replay after manager fetch failure', async () => {
  const runtime = await createRuntime()
  const task = createTask(
    'fix manager issue',
    'Fix manager issue',
    'worker',
    'codex',
    undefined,
    'focus-main',
  )
  task.status = 'succeeded'
  task.completedAt = '2026-03-08T06:19:38.113Z'
  task.durationMs = 42
  runtime.tasks.push(task)

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

  runtime.session.inflightInputs = [input]
  await publishUserInput({ paths: runtime.paths, payload: input })
  await publishWorkerResult({ paths: runtime.paths, payload: result })

  await recoverManagerBatchFailure({
    runtime,
    error: new Error('[provider:openai-responses] sdk run failed: fetch failed'),
    inputs: [input],
    results: [result],
    nextInputsCursor: 1,
    nextResultsCursor: 1,
    agentInputsCount: 1,
    agentAppended: false,
    startedAt: Date.now() - 20,
  })

  expect(runtime.queues.inputsCursor).toBe(1)
  expect(runtime.queues.resultsCursor).toBe(0)
  expect(runtime.session.inflightInputs).toHaveLength(0)
  expect(runtime.tasks[0]?.result).toBeUndefined()

  const pendingResults = await consumeWorkerResults({
    paths: runtime.paths,
    fromCursor: runtime.queues.resultsCursor,
  })
  expect(pendingResults).toHaveLength(1)
  expect(pendingResults[0]?.payload.taskId).toBe(task.id)

  const history = await readHistory(runtime.paths.history)
  expect(history.some((item) => item.id === input.id)).toBe(true)

  const fallbackMessage = history.find((item) => {
    if (item.role !== 'system') return false
    return parseSystemEventText(item.text).name === 'manager_fallback_reply'
  })
  expect(fallbackMessage).toBeDefined()
  const fallbackEvent = parseSystemEventText(fallbackMessage?.text ?? '')
  expect(fallbackEvent.payload?.source_input_id).toBe(input.id)

  const managerErrorMessage = history.find((item) => {
    if (item.role !== 'system') return false
    return parseSystemEventText(item.text).name === 'manager_error'
  })
  expect(managerErrorMessage).toBeDefined()
})
