import { join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'

import type { Task } from '../types/index.js'

type RuntimeSnapshot = {
  tasks: Task[]
  evolve?: {
    lastIdleReviewAt?: string
  }
  channels?: {
    teller?: {
      userInputCursor?: number
      workerResultCursor?: number
      thinkerDecisionCursor?: number
    }
    thinker?: {
      tellerDigestCursor?: number
    }
  }
}

type RuntimeSnapshotChannels = NonNullable<RuntimeSnapshot['channels']>

const normalizeCursor = (value: unknown): number =>
  typeof value === 'number' ? Math.max(0, Math.floor(value)) : 0

const normalizeChannels = (
  value: unknown,
): RuntimeSnapshotChannels | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as {
    teller?: unknown
    thinker?: unknown
    tellerUserInputCursor?: unknown
    tellerWorkerResultCursor?: unknown
    tellerThinkerDecisionCursor?: unknown
    thinkerTellerDigestCursor?: unknown
  }
  const tellerRecord =
    record.teller && typeof record.teller === 'object'
      ? (record.teller as {
          userInputCursor?: unknown
          workerResultCursor?: unknown
          thinkerDecisionCursor?: unknown
        })
      : undefined
  const thinkerRecord =
    record.thinker && typeof record.thinker === 'object'
      ? (record.thinker as {
          tellerDigestCursor?: unknown
        })
      : undefined
  return {
    teller: {
      userInputCursor: normalizeCursor(
        tellerRecord?.userInputCursor ?? record.tellerUserInputCursor,
      ),
      workerResultCursor: normalizeCursor(
        tellerRecord?.workerResultCursor ?? record.tellerWorkerResultCursor,
      ),
      thinkerDecisionCursor: normalizeCursor(
        tellerRecord?.thinkerDecisionCursor ??
          record.tellerThinkerDecisionCursor,
      ),
    },
    thinker: {
      tellerDigestCursor: normalizeCursor(
        thinkerRecord?.tellerDigestCursor ?? record.thinkerTellerDigestCursor,
      ),
    },
  }
}

const runtimePath = (stateDir: string): string =>
  join(stateDir, 'runtime-state.json')

const isTaskStatus = (value: unknown): value is Task['status'] =>
  value === 'pending' ||
  value === 'running' ||
  value === 'succeeded' ||
  value === 'failed' ||
  value === 'canceled'

const asTask = (value: unknown): Task | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<Task>
  if (typeof record.id !== 'string' || record.id.trim().length === 0)
    return null
  if (
    typeof record.fingerprint !== 'string' ||
    record.fingerprint.trim().length === 0
  )
    return null
  if (typeof record.prompt !== 'string') return null
  if (typeof record.title !== 'string') return null
  if (!isTaskStatus(record.status)) return null
  if (typeof record.createdAt !== 'string') return null
  const task: Task = {
    id: record.id,
    fingerprint: record.fingerprint,
    prompt: record.prompt,
    title: record.title,
    profile: record.profile === 'expert' ? 'expert' : 'standard',
    status: record.status,
    createdAt: record.createdAt,
    ...(typeof record.startedAt === 'string'
      ? { startedAt: record.startedAt }
      : {}),
    ...(typeof record.completedAt === 'string'
      ? { completedAt: record.completedAt }
      : {}),
    ...(typeof record.durationMs === 'number'
      ? { durationMs: Math.max(0, record.durationMs) }
      : {}),
    ...(typeof record.attempts === 'number'
      ? { attempts: Math.max(0, Math.floor(record.attempts)) }
      : {}),
    ...(record.usage ? { usage: record.usage } : {}),
    ...(typeof record.archivePath === 'string'
      ? { archivePath: record.archivePath }
      : {}),
  }
  return task
}

const normalizeSnapshot = (value: unknown): RuntimeSnapshot => {
  if (!value || typeof value !== 'object') return { tasks: [] }
  const record = value as {
    tasks?: unknown
    evolve?: unknown
    channels?: unknown
  }
  const tasks = Array.isArray(record.tasks)
    ? record.tasks
        .map((item) => asTask(item))
        .filter((item): item is Task => Boolean(item))
    : []
  const evolve =
    record.evolve &&
    typeof record.evolve === 'object' &&
    typeof (record.evolve as { lastIdleReviewAt?: unknown })
      .lastIdleReviewAt === 'string'
      ? {
          lastIdleReviewAt: (record.evolve as { lastIdleReviewAt: string })
            .lastIdleReviewAt,
        }
      : undefined
  const channels = normalizeChannels(record.channels)
  return {
    tasks,
    ...(evolve ? { evolve } : {}),
    ...(channels ? { channels } : {}),
  }
}

export const loadRuntimeSnapshot = async (
  stateDir: string,
): Promise<RuntimeSnapshot> => {
  const raw = await readJson<unknown>(runtimePath(stateDir), { tasks: [] })
  return normalizeSnapshot(raw)
}

export const saveRuntimeSnapshot = async (
  stateDir: string,
  snapshot: RuntimeSnapshot,
): Promise<void> => {
  await writeJson(runtimePath(stateDir), snapshot)
}

export const selectPersistedTasks = (tasks: Task[]): Task[] =>
  tasks
    .filter((task) => task.status === 'pending' || task.status === 'running')
    .map((task) => {
      if (task.status === 'running') {
        const recovered: Task = {
          id: task.id,
          fingerprint: task.fingerprint,
          prompt: task.prompt,
          title: task.title,
          profile: task.profile,
          status: 'pending',
          createdAt: task.createdAt,
          ...(typeof task.attempts === 'number'
            ? { attempts: task.attempts }
            : {}),
          ...(task.usage ? { usage: task.usage } : {}),
        }
        return recovered
      }
      return { ...task }
    })
