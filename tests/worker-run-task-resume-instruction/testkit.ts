import { vi } from 'vitest'

import { createTestRuntimeState } from '../helpers/runtime-state.js'
import { persistTaskExecutionSpec } from '../../src/work/spec/store.js'

import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'
import type { Task } from '../../src/foundation/types/index.js'

export const createTask = (id: string, overrides: Partial<Task> = {}): Task => ({
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
  runtime.worker.queue = {
    add: vi.fn(),
    clear: vi.fn(),
    pause: vi.fn(),
    sizeBy: vi.fn().mockReturnValue(0),
  } as unknown as RuntimeState['worker']['queue']
  return runtime
}

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
