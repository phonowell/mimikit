import { join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'

import { parseRuntimeSnapshot } from './runtime-state-schema.js'

import type { RuntimeSnapshot } from './runtime-state-schema.js'
import type { Task } from '../types/index.js'

const runtimePath = (stateDir: string): string =>
  join(stateDir, 'runtime-state.json')

const initialRuntimeSnapshot = (): RuntimeSnapshot => ({
  tasks: [],
  queues: {
    inputsCursor: 0,
    resultsCursor: 0,
  },
})

export const loadRuntimeSnapshot = async (
  stateDir: string,
): Promise<RuntimeSnapshot> => {
  const raw = await readJson<unknown>(
    runtimePath(stateDir),
    initialRuntimeSnapshot(),
    {
      ensureFile: true,
    },
  )
  return parseRuntimeSnapshot(raw)
}

export const saveRuntimeSnapshot = async (
  stateDir: string,
  snapshot: RuntimeSnapshot,
): Promise<void> => {
  await writeJson(runtimePath(stateDir), snapshot)
}

const toRecoveredPendingTask = (task: Task): Task => {
  const {
    startedAt: _startedAt,
    completedAt: _completedAt,
    durationMs: _durationMs,
    result: _result,
    ...rest
  } = task
  return {
    ...rest,
    status: 'pending',
  }
}

export const selectPersistedTasks = (tasks: Task[]): Task[] =>
  tasks.map((task) => {
    if (task.status === 'running') return toRecoveredPendingTask(task)
    return { ...task }
  })
