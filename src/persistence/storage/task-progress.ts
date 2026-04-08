import { join } from 'node:path'

import { z } from 'zod'

import { truncateText } from '../../foundation/shared/text.js'
import { nowIso } from '../../foundation/shared/utils.js'
import { ensureDir, listFiles } from '../fs/paths.js'

import { dateStamp } from './archive-format.js'
import { appendJsonl, readJsonl } from './jsonl.js'
import { runSerialized } from './serialized-lock.js'

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
export const TASK_PROGRESS_WORKER_LIVE_OUTPUT_TYPE = 'worker_live_output'
const MAX_TASK_PROGRESS_TEXT_CHARS = 16_000

export type TaskProgressEvent = z.infer<typeof taskProgressEventSchema>

const sanitizeTaskProgressPayload = (
  payload: JsonObject | undefined,
): JsonObject => {
  const next = { ...(payload ?? {}) }
  const { text } = next
  if (typeof text !== 'string') return next
  const clipped = truncateText(text, MAX_TASK_PROGRESS_TEXT_CHARS, {
    suffix: '…[truncated]',
  })
  if (clipped === text) return next
  return {
    ...next,
    text: clipped,
    truncated: true,
  }
}

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
    payload: sanitizeTaskProgressPayload(params.payload),
  })
  await runSerialized(path, async () => {
    await appendJsonl(path, [event])
  })
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

export const readLatestTaskLiveOutput = async (
  stateDir: string,
  taskId: string,
  options?: { since?: string },
): Promise<string | undefined> => {
  const entries = await readTaskProgress(stateDir, taskId)
  const since = options?.since?.trim()
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const event = entries[index]
    if (!event) continue
    if (since && event.createdAt < since) break
    if (event.type !== TASK_PROGRESS_WORKER_LIVE_OUTPUT_TYPE) continue
    const { text } = event.payload
    if (typeof text !== 'string') continue
    const normalized = text.trim()
    if (normalized) return normalized
  }
  return undefined
}
