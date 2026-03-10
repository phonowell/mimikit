import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'
import { ensureFile } from '../fs/paths.js'
import { logSafeError } from '../log/safe.js'
import { readErrorCode } from '../shared/error-code.js'
import { toPrettyJsonText } from '../shared/json.js'

import { RUNTIME_SNAPSHOT_SCHEMA_VERSION } from './runtime-schema-version.js'
import { parseRuntimeSnapshot } from './runtime-snapshot-parse.js'

import type { RuntimeSnapshot } from './runtime-snapshot-schema.js'
import type { Task } from '../types/index.js'

type RuntimeSnapshotWritable = Omit<RuntimeSnapshot, 'schemaVersion'> & {
  schemaVersion?: string
}

const runtimePath = (stateDir: string): string =>
  join(stateDir, 'runtime-snapshot.json')
const runtimeBackupPath = (stateDir: string): string =>
  `${runtimePath(stateDir)}.bak`

const initialRuntimeSnapshot = (): RuntimeSnapshot => ({
  schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
  tasks: [],
  taskPlans: [],
  managerTurn: 0,
  managerThreadId: undefined,
  queues: {
    inputsCursor: 0,
    resultsCursor: 0,
  },
  memoryRefresh: {
    lastCompletedTurn: 0,
    lastProcessedInputsCursor: 0,
    lastProcessedResultsCursor: 0,
  },
})

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
    await copyFile(path, `${path}.bak`)
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
  await ensureFile(path, toPrettyJsonText(initial))
  const fallback = Symbol('runtime-snapshot-read-fallback')
  const primary = await readJson<unknown | typeof fallback>(path, fallback, {
    quietParseError: true,
  })
  if (primary !== fallback) return parseRuntimeSnapshot(primary)
  const backup = await readJson<unknown | typeof fallback>(
    backupPath,
    fallback,
    {
      quietParseError: true,
    },
  )
  if (backup !== fallback) return parseRuntimeSnapshot(backup)
  return initial
}

export const saveRuntimeSnapshot = async (
  stateDir: string,
  snapshot: RuntimeSnapshotWritable,
): Promise<void> => {
  const path = runtimePath(stateDir)
  await backupRuntimeState(path)
  await writeJson(path, {
    schemaVersion: snapshot.schemaVersion ?? RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    ...snapshot,
  })
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
