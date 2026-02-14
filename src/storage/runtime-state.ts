import { join } from 'node:path'

import backup from 'fire-keeper/backup'

import { readJson, writeJson } from '../fs/json.js'
import { ensureFile } from '../fs/paths.js'
import { logSafeError } from '../log/safe.js'

import { parseRuntimeSnapshot } from './runtime-state-schema.js'

import type { RuntimeSnapshot } from './runtime-state-schema.js'
import type { Task } from '../types/index.js'

const runtimePath = (stateDir: string): string =>
  join(stateDir, 'runtime-state.json')
const runtimeBackupPath = (stateDir: string): string =>
  `${runtimePath(stateDir)}.bak`

const initialRuntimeSnapshot = (): RuntimeSnapshot => ({
  tasks: [],
  cronJobs: [],
  queues: {
    inputsCursor: 0,
    resultsCursor: 0,
    wakesCursor: 0,
  },
})

const toJsonText = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`

const readErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined
  const { code } = error as { code?: unknown }
  if (typeof code === 'string' && code) return code
  if (typeof code === 'number') return String(code)
  return undefined
}

const inspectBackupError = (
  error: unknown,
): { ignorable: boolean; codes: string[] } => {
  if (error instanceof AggregateError) {
    const nested = error.errors.map((item) => inspectBackupError(item))
    if (nested.length === 0) return { ignorable: false, codes: [] }
    return {
      ignorable: nested.every((item) => item.ignorable),
      codes: nested.flatMap((item) => item.codes),
    }
  }
  const code = readErrorCode(error)
  if (!code) return { ignorable: false, codes: [] }
  return { ignorable: code === 'ENOENT', codes: [code] }
}

const backupRuntimeState = async (path: string): Promise<void> => {
  try {
    await backup(path, { echo: false })
  } catch (error) {
    const inspected = inspectBackupError(error)
    if (inspected.ignorable) return
    await logSafeError('saveRuntimeSnapshot: backup', error, {
      meta:
        inspected.codes.length > 0
          ? { path, codes: inspected.codes }
          : { path },
    })
    throw error
  }
}

export const loadRuntimeSnapshot = async (
  stateDir: string,
): Promise<RuntimeSnapshot> => {
  const path = runtimePath(stateDir)
  const backupPath = runtimeBackupPath(stateDir)
  const initial = initialRuntimeSnapshot()
  await ensureFile(path, toJsonText(initial))
  const fallback = Symbol('runtime-snapshot-read-fallback')
  const primary = await readJson<unknown | typeof fallback>(path, fallback)
  if (primary !== fallback) return parseRuntimeSnapshot(primary)
  const backup = await readJson<unknown | typeof fallback>(backupPath, fallback)
  if (backup !== fallback) return parseRuntimeSnapshot(backup)
  return initial
}

export const saveRuntimeSnapshot = async (
  stateDir: string,
  snapshot: RuntimeSnapshot,
): Promise<void> => {
  const path = runtimePath(stateDir)
  await backupRuntimeState(path)
  await writeJson(path, snapshot)
}

const toRecoveredPendingTask = (task: Task): Task => {
  const {
    startedAt: _startedAt,
    completedAt: _completedAt,
    durationMs: _durationMs,
    result: _result,
    usage: _usage,
    attempts: _attempts,
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
