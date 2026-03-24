import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readJsonl } from '../../src/persistence/storage/jsonl.js'

import type { Task } from '../../src/foundation/types/index.js'
import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

export const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-finalize-result-'))

export const mergeTaskPatch = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): void => {
  if (!patch) return
  const task = tasks.find((item) => item.id === taskId)
  if (!task) return
  Object.assign(task, patch)
}

export const readWorkerEndLog = async (
  runtime: RuntimeState,
  taskId: string,
): Promise<Record<string, unknown> | undefined> => {
  const logs = await readJsonl<Record<string, unknown>>(runtime.paths.log, {
    ensureFile: true,
  })
  return logs.find((item) => item.event === 'worker_end' && item.taskId === taskId)
}
