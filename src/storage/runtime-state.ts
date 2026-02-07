import { join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'

import type { Task, TokenBudgetState } from '../types/index.js'

type RuntimeSnapshot = {
  tasks: Task[]
  tokenBudget?: TokenBudgetState
  postRestartHealthGate?: {
    required: boolean
    promptPath?: string
    promptBackup?: string
    suitePath?: string
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

const isTaskKind = (value: unknown): value is NonNullable<Task['kind']> =>
  value === 'system_evolve'

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
    ...(isTaskKind(record.kind) ? { kind: record.kind } : {}),
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

const asTokenBudgetState = (value: unknown): TokenBudgetState | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Partial<TokenBudgetState>
  if (typeof record.date !== 'string') return undefined
  if (typeof record.spent !== 'number' || !Number.isFinite(record.spent))
    return undefined
  return {
    date: record.date,
    spent: Math.max(0, record.spent),
  }
}

const normalizeSnapshot = (value: unknown): RuntimeSnapshot => {
  if (!value || typeof value !== 'object') return { tasks: [] }
  const record = value as {
    tasks?: unknown
    tokenBudget?: unknown
    postRestartHealthGate?: unknown
  }
  const tasks = Array.isArray(record.tasks)
    ? record.tasks
        .map((item) => asTask(item))
        .filter((item): item is Task => Boolean(item))
    : []
  const tokenBudget = asTokenBudgetState(record.tokenBudget)
  const gate =
    record.postRestartHealthGate &&
    typeof record.postRestartHealthGate === 'object'
      ? (record.postRestartHealthGate as RuntimeSnapshot['postRestartHealthGate'])
      : undefined
  const base = tokenBudget ? { tasks, tokenBudget } : { tasks }
  return gate ? { ...base, postRestartHealthGate: gate } : base
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
          ...(task.kind ? { kind: task.kind } : {}),
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
