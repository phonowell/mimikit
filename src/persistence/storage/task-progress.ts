import { join } from 'node:path'

import { z } from 'zod'

import { nowIso } from '../../foundation/shared/utils.js'
import { ensureDir, listFiles } from '../fs/paths.js'

import { dateStamp } from './archive-format.js'
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

const TASK_PROGRESS_DIR = 'task-progress'

export type TaskProgressEvent = z.infer<typeof taskProgressEventSchema>

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

const sortTaskProgress = (
  left: TaskProgressEvent,
  right: TaskProgressEvent,
): number => {
  const timeDiff = left.createdAt.localeCompare(right.createdAt)
  if (timeDiff !== 0) return timeDiff
  return left.type.localeCompare(right.type)
}

export const readTaskProgress = async (
  stateDir: string,
  taskId: string,
): Promise<TaskProgressEvent[]> => {
  const entries = await listFiles(join(stateDir, TASK_PROGRESS_DIR))
  const dateDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  if (dateDirs.length === 0) return []
  const chunks = await Promise.all(
    dateDirs.map((dateDir) =>
      readJsonl<TaskProgressEvent>(
        join(stateDir, TASK_PROGRESS_DIR, dateDir, `${taskId}.jsonl`),
        {
          validate: (value) => {
            const parsed = taskProgressEventSchema.safeParse(value)
            return parsed.success ? parsed.data : undefined
          },
        },
      ),
    ),
  )
  return chunks.flat().sort(sortTaskProgress)
}
