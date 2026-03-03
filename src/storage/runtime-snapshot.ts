import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'
import { ensureFile } from '../fs/paths.js'
import { logSafeError } from '../log/safe.js'
import { readErrorCode } from '../shared/error-code.js'
import { toPrettyJsonText } from '../shared/json.js'

import { parseRuntimeSnapshot } from './runtime-snapshot-parse.js'

import type { RuntimeSnapshot } from './runtime-snapshot-schema.js'
import type { Task } from '../types/index.js'

const runtimePath = (stateDir: string): string =>
  join(stateDir, 'runtime-snapshot.json')
const runtimeBackupPath = (stateDir: string): string =>
  `${runtimePath(stateDir)}.bak`

const initialRuntimeSnapshot = (): RuntimeSnapshot => ({
  tasks: [],
  taskPlans: [],
  managerTurn: 0,
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

const migrationErrorMessage = (path: string, error: unknown): string => {
  const detail = error instanceof Error ? error.message : String(error)
  return [
    'runtime_snapshot_migration_failed:',
    `failed to persist migrated trigger_mode in ${path}.`,
    'Replace every plan trigger mode "on_worker_slot_available" with "on_worker_slot_freed" and retry.',
    `cause=${detail}`,
  ].join(' ')
}

const parseAndMigrateRuntimeSnapshot = async (
  value: unknown,
  path: string,
): Promise<RuntimeSnapshot> => {
  const parsed = parseRuntimeSnapshot(value)
  if (!parsed.migratedLegacyPlanTriggerMode) return parsed.snapshot
  try {
    await writeJson(path, parsed.snapshot)
  } catch (error) {
    throw new Error(migrationErrorMessage(path, error))
  }
  return parsed.snapshot
}

export const loadRuntimeSnapshot = async (
  stateDir: string,
): Promise<RuntimeSnapshot> => {
  const path = runtimePath(stateDir)
  const backupPath = runtimeBackupPath(stateDir)
  const initial = initialRuntimeSnapshot()
  await ensureFile(path, toPrettyJsonText(initial))
  const fallback = Symbol('runtime-snapshot-read-fallback')
  const primary = await readJson<unknown | typeof fallback>(path, fallback)
  if (primary !== fallback) return parseAndMigrateRuntimeSnapshot(primary, path)
  const backup = await readJson<unknown | typeof fallback>(backupPath, fallback)
  if (backup !== fallback) return parseAndMigrateRuntimeSnapshot(backup, path)
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
