import { vi } from 'vitest'

import { persistTaskExecutionSpec } from '../../src/work/spec/store.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'

import type { Task } from '../../src/foundation/types/index.js'
import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

export const resumeInstruction = '继续原任务，但先核对工作区已有产物。'

const {
  runTaskWithRetryMock,
  buildResultMock,
  finalizeResultMock,
  appendLogMock,
} = vi.hoisted(() => ({
  runTaskWithRetryMock: vi.fn(),
  buildResultMock: vi.fn(),
  finalizeResultMock: vi.fn(() => Promise.resolve(undefined)),
  appendLogMock: vi.fn(() => Promise.resolve(undefined)),
}))

vi.mock('../../src/execution/worker/run-retry.js', () => ({
  runTaskWithRetry: runTaskWithRetryMock,
}))

vi.mock('../../src/execution/worker/result-build.js', () => ({
  buildResult: buildResultMock,
}))

vi.mock('../../src/execution/worker/result-finalize.js', () => ({
  finalizeResult: finalizeResultMock,
}))

vi.mock('../../src/persistence/log/append.js', () => ({
  appendLog: appendLogMock,
}))

const runTaskModule = await import('../../src/execution/worker/run-task.js')
export const { runTask } = runTaskModule

export const createTask = (
  id: string,
  overrides: Partial<Task> = {},
): Task => ({
  id,
  fingerprint: `fp-${id}`,
  semanticKey: `sk-${id}`,
  executionSpecId: `spec-${id}`,
  title: 'run task',
  cwd: '/tmp/run-task',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-03-06T00:00:00.000Z',
  ...overrides,
})

export const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({
    runtimeId: 'runtime-run-task-resume-instruction-test',
    withGlobalFocus: false,
  })
  runtime.process.worker.queue = {
    add: vi.fn(),
    clear: vi.fn(),
    pause: vi.fn(),
    sizeBy: vi.fn().mockReturnValue(0),
  } as unknown as RuntimeState['process']['worker']['queue']
  return runtime
}

export const createResumeTask = (
  runtime: RuntimeState,
  id: string,
  overrides: Partial<Task> = {},
): Promise<Task> =>
  prepareTask(
    runtime,
    createTask(id, {
      resumeInstruction,
      ...overrides,
    }),
  )

export const prepareTask = async (
  runtime: RuntimeState,
  task: Task,
  prompt = 'run task',
): Promise<Task> => {
  await persistTaskExecutionSpec({
    stateDir: runtime.config.workDir,
    prompt,
    specId: task.executionSpecId,
  })
  return task
}

export const resetRunTaskMocks = (): void => {
  runTaskWithRetryMock.mockReset()
  buildResultMock.mockReset()
  finalizeResultMock.mockClear()
  appendLogMock.mockClear()
}

export const setBuildResultOk = (ok: boolean): void => {
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
      ok,
      output,
      durationMs,
      completedAt: '2026-03-06T00:00:10.000Z',
      ...(usage ? { usage } : {}),
    }),
  )
}

export {
  appendLogMock,
  buildResultMock,
  finalizeResultMock,
  runTaskWithRetryMock,
}
