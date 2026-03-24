import { join } from 'node:path'

import { z } from 'zod'

import { nowIso } from '../../foundation/shared/utils.js'
import { ensureDir } from '../fs/paths.js'

import { dateStamp } from './archive-format.js'
import { appendJsonl } from './jsonl.js'

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

const TASK_PROGRESS_DIR = 'task-progress'

const taskProgressDateDir = (stateDir: string, timestamp: string): string =>
  join(stateDir, TASK_PROGRESS_DIR, dateStamp(timestamp))

export const taskProgressPath = (
  stateDir: string,
  taskId: string,
  timestamp: string,
): string => join(taskProgressDateDir(stateDir, timestamp), `${taskId}.jsonl`)

export const appendTaskProgress = async (params: {
  stateDir: string
  taskId: string
  type: string
  payload?: JsonObject
}): Promise<string> => {
  const createdAt = nowIso()
  const path = taskProgressPath(params.stateDir, params.taskId, createdAt)
  await ensureDir(taskProgressDateDir(params.stateDir, createdAt))
  const event = taskProgressEventSchema.parse({
    taskId: params.taskId,
    type: params.type,
    createdAt,
    payload: params.payload ?? {},
  })
  await appendJsonl(path, [event])
  return path
}
