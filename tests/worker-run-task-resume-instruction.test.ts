import { expect, test, vi, beforeEach } from 'vitest'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'
import type { Task } from '../src/foundation/types/index.js'

const {
  runTaskWithRetryMock,
  buildResultMock,
  finalizeResultMock,
  appendLogMock,
} = vi.hoisted(() => ({
  runTaskWithRetryMock: vi.fn(),
  buildResultMock: vi.fn(),
  finalizeResultMock: vi.fn(async () => undefined),
  appendLogMock: vi.fn(async () => undefined),
}))

vi.mock('../src/execution/worker/run-retry.js', () => ({
  runTaskWithRetry: runTaskWithRetryMock,
}))

vi.mock('../src/execution/worker/result-build.js', () => ({
  buildResult: buildResultMock,
}))

vi.mock('../src/execution/worker/result-finalize.js', () => ({
  finalizeResult: finalizeResultMock,
}))

vi.mock('../src/persistence/log/append.js', () => ({
  appendLog: appendLogMock,
}))

const { runTask } = await import('../src/execution/worker/run-task.js')

const createTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  fingerprint: `fp-${id}`,
  prompt: 'run task',
  title: 'run task',
  cwd: '/tmp/run-task',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-03-06T00:00:00.000Z',
  ...overrides,
})

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({
    runtimeId: 'runtime-run-task-resume-instruction-test',
    withGlobalFocus: false,
  })
  runtime.worker.queue = {
    add: vi.fn(),
    clear: vi.fn(),
    pause: vi.fn(),
    sizeBy: vi.fn().mockReturnValue(0),
  } as unknown as RuntimeState['worker']['queue']
  return runtime
}

beforeEach(() => {
  runTaskWithRetryMock.mockReset()
  buildResultMock.mockReset()
  finalizeResultMock.mockClear()
  appendLogMock.mockClear()
})

test('runTask consumes pending resume instruction after starting the resumed run', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-run-task-resume-instruction', {
    resumeInstruction: '继续原任务，但先核对工作区和 partial 结果。',
  })

  buildResultMock.mockImplementation(
    (
      currentTask: Task,
      status: string,
      output: string,
      durationMs: number,
      usage?: unknown,
    ) => ({
      taskId: currentTask.id,
      status,
      ok: true,
      output,
      durationMs,
      completedAt: '2026-03-06T00:00:10.000Z',
      ...(usage ? { usage } : {}),
    }),
  )
  runTaskWithRetryMock.mockResolvedValue({
    output: 'done',
    elapsedMs: 1,
  })

  await runTask(runtime, task, new AbortController())

  expect(runTaskWithRetryMock).toHaveBeenCalledTimes(1)
  expect(task.resumeInstruction).toBeUndefined()
  expect(finalizeResultMock).toHaveBeenCalledTimes(1)
})

test('runTask keeps pending resume instruction when the resumed run fails before execution starts', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-run-task-resume-instruction-failure', {
    resumeInstruction: '继续原任务，但先核对工作区和 partial 结果。',
  })

  buildResultMock.mockImplementation(
    (
      currentTask: Task,
      status: string,
      output: string,
      durationMs: number,
      usage?: unknown,
    ) => ({
      taskId: currentTask.id,
      status,
      ok: false,
      output,
      durationMs,
      completedAt: '2026-03-06T00:00:10.000Z',
      ...(usage ? { usage } : {}),
    }),
  )
  runTaskWithRetryMock.mockRejectedValue(new Error('codex provider disabled'))

  await runTask(runtime, task, new AbortController())

  expect(runTaskWithRetryMock).toHaveBeenCalledTimes(1)
  expect(task.resumeInstruction).toBe(
    '继续原任务，但先核对工作区和 partial 结果。',
  )
  expect(finalizeResultMock).toHaveBeenCalledTimes(1)
})

test('runTask clears pending resume instruction after the resumed turn has started and then fails', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-run-task-resume-instruction-started-failure', {
    resumeInstruction: '继续原任务，但先核对工作区和 partial 结果。',
  })

  buildResultMock.mockImplementation(
    (
      currentTask: Task,
      status: string,
      output: string,
      durationMs: number,
      usage?: unknown,
    ) => ({
      taskId: currentTask.id,
      status,
      ok: false,
      output,
      durationMs,
      completedAt: '2026-03-06T00:00:10.000Z',
      ...(usage ? { usage } : {}),
    }),
  )
  runTaskWithRetryMock.mockImplementationOnce(
    async ({ onTurnStarted }: { onTurnStarted?: () => void }) => {
      onTurnStarted?.()
      throw new Error('codex stream interrupted')
    },
  )

  await runTask(runtime, task, new AbortController())

  expect(runTaskWithRetryMock).toHaveBeenCalledTimes(1)
  expect(task.resumeInstruction).toBeUndefined()
  expect(finalizeResultMock).toHaveBeenCalledTimes(1)
})

test('runTask clears pending resume instruction when the resumed turn has started before a pause', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-run-task-resume-instruction-paused', {
    resumeInstruction: '继续原任务，但先核对工作区和 partial 结果。',
  })

  runTaskWithRetryMock.mockImplementationOnce(
    async ({ onTurnStarted }: { onTurnStarted?: () => void }) => {
      onTurnStarted?.()
      task.status = 'paused'
      throw new Error('Task paused')
    },
  )

  await runTask(runtime, task, new AbortController())

  expect(runTaskWithRetryMock).toHaveBeenCalledTimes(1)
  expect(task.resumeInstruction).toBeUndefined()
  expect(finalizeResultMock).not.toHaveBeenCalled()
})
