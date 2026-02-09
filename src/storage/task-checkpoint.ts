import { join } from 'node:path'

import { z } from 'zod'

import { readJson, writeJson } from '../fs/json.js'
import { ensureDir } from '../fs/paths.js'

const jsonObjectSchema = z.object({}).catchall(z.unknown())

const taskCheckpointSchema = z
  .object({
    taskId: z.string().trim().min(1),
    stage: z.string().trim().min(1),
    updatedAt: z.string().trim().min(1),
    state: jsonObjectSchema,
  })
  .strict()

export type TaskCheckpoint = z.infer<typeof taskCheckpointSchema>

const TASK_CHECKPOINT_DIR = 'task-checkpoints'

const checkpointPath = (stateDir: string, taskId: string): string =>
  join(stateDir, TASK_CHECKPOINT_DIR, `${taskId}.json`)

export const saveTaskCheckpoint = async (params: {
  stateDir: string
  checkpoint: TaskCheckpoint
}): Promise<string> => {
  const checkpoint = taskCheckpointSchema.parse(params.checkpoint)
  const path = checkpointPath(params.stateDir, checkpoint.taskId)
  await ensureDir(join(params.stateDir, TASK_CHECKPOINT_DIR))
  await writeJson(path, checkpoint, { backup: false })
  return path
}

export const loadTaskCheckpoint = async (
  stateDir: string,
  taskId: string,
): Promise<TaskCheckpoint | null> => {
  const path = checkpointPath(stateDir, taskId)
  const raw = await readJson<unknown>(path, null, { useBackup: false })
  const parsed = taskCheckpointSchema.safeParse(raw)
  if (!parsed.success) return null
  return parsed.data
}
