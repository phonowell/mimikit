import { join } from 'node:path'

import mkdir from 'fire-keeper/mkdir'
import read from 'fire-keeper/read'
import write from 'fire-keeper/write'
import { z } from 'zod'

import { nowIso } from '../shared/utils.js'

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
  await mkdir(join(params.stateDir, TASK_PROGRESS_DIR))
  const event = taskProgressEventSchema.parse({
    taskId: params.taskId,
    type: params.type,
    createdAt: nowIso(),
    payload: params.payload ?? {},
  })
  await write(path, `${JSON.stringify(event)}\n`, {
    flag: 'a',
    encoding: 'utf8',
  })
  return path
}

const parseLine = (line: string): TaskProgressEvent | null => {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    const validated = taskProgressEventSchema.safeParse(parsed)
    if (!validated.success) return null
    return validated.data
  } catch {
    return null
  }
}

export const readTaskProgress = async (
  stateDir: string,
  taskId: string,
): Promise<TaskProgressEvent[]> => {
  const path = taskProgressPath(stateDir, taskId)
  const raw = await read(path, { raw: true })
  if (!raw) return []
  const text =
    typeof raw === 'string'
      ? raw
      : Buffer.isBuffer(raw)
        ? raw.toString('utf8')
        : ''
  if (!text.trim()) return []
  const entries = text
    .split(/\r?\n/)
    .map((line) => parseLine(line))
    .filter((item): item is TaskProgressEvent => Boolean(item))
  return entries
}
