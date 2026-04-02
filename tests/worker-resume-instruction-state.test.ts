import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test, vi } from 'vitest'

import { resumeTask } from '../src/execution/worker/resume-task.js'
import { readHistory } from '../src/persistence/history/store.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { Task } from '../src/foundation/types/index.js'
import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-resume-instruction-'))
  tempDirs.push(dir)
  return dir
}

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir,
    runtimeId: 'runtime-resume-instruction-test',
    withGlobalFocus: false,
  })
  const queue: RuntimeState['process']['worker']['queue'] = {
    add: vi.fn(() => Promise.resolve(undefined)),
    clear: vi.fn(),
    pause: vi.fn(),
    sizeBy: vi.fn().mockReturnValue(0),
  }
  runtime.process.worker.queue = queue
  return runtime
}

const createTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  fingerprint: `fp-${id}`,
  prompt: 'run task',
  title: 'Run Task',
  cwd: '/tmp/resume-instruction-task',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'paused',
  createdAt: '2026-03-06T00:00:00.000Z',
  pausedAt: '2026-03-06T00:00:03.000Z',
  archivePath: '/tmp/task-paused.md',
  ...overrides,
})

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

test('resumeTask stores resume instruction and marks resumed history payload', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-resume-instruction')
  runtime.domain.tasks = [task]

  await resumeTask(runtime, task.id, {
    source: 'user',
    resumeInstruction: '继续当前任务，但先核对工作区已有改动。',
  })

  expect(task.resumeInstruction).toBe('继续当前任务，但先核对工作区已有改动。')
  const history = await readHistory(runtime.paths.history)
  const event = history
    .map((item) =>
      item.role === 'system'
        ? {
            name: item.systemEventName,
            payload: item.systemEventPayload,
          }
        : null,
    )
    .find((item) => item?.name === 'task_resumed')
  expect(event?.payload?.task_id).toBe(task.id)
  expect(event?.payload?.resume_instruction_present).toBe(true)
})
