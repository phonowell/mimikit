import { join } from 'node:path'

import mkdir from 'fire-keeper/mkdir'
import { z } from 'zod'

import { nowIso } from '../shared/utils.js'

import { appendJsonl, readJsonl } from './jsonl.js'

type JsonObject = Record<string, unknown>

const jsonObjectSchema = z.object({}).catchall(z.unknown())

const taskProgressEventSchema = z
  .object({
    taskId: z.string().trim().min(1),
    type: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    payload: jsonObjectSchema,
  })
  .strict()

export type TaskProgressEvent = z.infer<typeof taskProgressEventSchema>

const TASK_PROGRESS_DIR = 'task-progress'

export const taskProgressPath = (stateDir: string, taskId: string): string =>
  join(stateDir, TASK_PROGRESS_DIR, `${taskId}.jsonl`)

export const appendTaskProgress = async (params: {
  stateDir: string
  taskId: string
  type: string
  payload?: JsonObject
}): Promise<string> => {
  const path = taskProgressPath(params.stateDir, params.taskId)
  await mkdir(join(params.stateDir, TASK_PROGRESS_DIR), { echo: false })
  const event = taskProgressEventSchema.parse({
    taskId: params.taskId,
    type: params.type,
    createdAt: nowIso(),
    payload: params.payload ?? {},
  })
  await appendJsonl(path, [event])
  return path
}

const asProgressEvent = (value: unknown): TaskProgressEvent | undefined => {
  const validated = taskProgressEventSchema.safeParse(value)
  if (!validated.success) return undefined
  return validated.data
}

export const readTaskProgress = (
  stateDir: string,
  taskId: string,
): Promise<TaskProgressEvent[]> =>
  readJsonl<TaskProgressEvent>(taskProgressPath(stateDir, taskId), {
    validate: asProgressEvent,
  })
