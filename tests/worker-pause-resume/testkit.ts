import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, vi } from 'vitest'

import { createTestRuntimeState } from '../helpers/runtime-state.js'

import type { Task } from '../../src/foundation/types/index.js'
import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-pause-resume-'))
  tempDirs.push(dir)
  return dir
}

export const createRuntime = async (params?: {
  queue?: Partial<RuntimeState['worker']['queue']>
}): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir,
    runtimeId: 'runtime-pause-resume-test',
    withGlobalFocus: false,
  })
  runtime.worker.queue = {
    add: async () => undefined,
    clear: () => undefined,
    pause: () => undefined,
    sizeBy: () => 0,
    ...params?.queue,
  } as RuntimeState['worker']['queue']
  return runtime
}

export const createTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  fingerprint: `fp-${id}`,
  prompt: 'run task',
  title: 'Run Task',
  cwd: '/tmp/pause-resume-task',
  focusId: 'focus-global',
  profile: 'worker',
  provider: 'codex',
  status: 'pending',
  createdAt: '2026-03-06T00:00:00.000Z',
  ...overrides,
})

export const createQueueAdd = () => vi.fn(async () => undefined)

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})
