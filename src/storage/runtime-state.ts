import { join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'

import { parseRuntimeSnapshot } from './runtime-state-schema.js'

import type { RuntimeSnapshot } from './runtime-state-schema.js'
import type { Task } from '../types/index.js'

const runtimePath = (stateDir: string): string =>
  join(stateDir, 'runtime-state.json')

export const loadRuntimeSnapshot = async (
  stateDir: string,
): Promise<RuntimeSnapshot> => {
  const raw = await readJson<unknown>(runtimePath(stateDir), { tasks: [] })
  return parseRuntimeSnapshot(raw)
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
