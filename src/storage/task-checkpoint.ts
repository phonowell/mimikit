import { join } from 'node:path'

import mkdir from 'fire-keeper/mkdir'
import read from 'fire-keeper/read'
import write from 'fire-keeper/write'

type JsonObject = Record<string, unknown>

export type TaskCheckpoint = {
  taskId: string
  stage: string
  updatedAt: string
  state: JsonObject
}

const TASK_CHECKPOINT_DIR = 'task-checkpoints'

const checkpointPath = (stateDir: string, taskId: string): string =>
  join(stateDir, TASK_CHECKPOINT_DIR, `${taskId}.json`)

const isCheckpoint = (value: unknown): value is TaskCheckpoint => {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<TaskCheckpoint>
  if (typeof record.taskId !== 'string') return false
  if (typeof record.stage !== 'string') return false
  if (typeof record.updatedAt !== 'string') return false
  if (!record.state || typeof record.state !== 'object') return false
  return true
}

export const saveTaskCheckpoint = async (params: {
  stateDir: string
  checkpoint: TaskCheckpoint
}): Promise<string> => {
  const path = checkpointPath(params.stateDir, params.checkpoint.taskId)
  await mkdir(join(params.stateDir, TASK_CHECKPOINT_DIR))
  await write(path, `${JSON.stringify(params.checkpoint, null, 2)}\n`, {
    encoding: 'utf8',
  })
  return path
}

export const loadTaskCheckpoint = async (
  stateDir: string,
  taskId: string,
): Promise<TaskCheckpoint | null> => {
  const path = checkpointPath(stateDir, taskId)
  const raw = await read<unknown>(path)
  if (!isCheckpoint(raw)) return null
  return raw
}
