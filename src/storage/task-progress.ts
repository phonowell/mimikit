import { join } from 'node:path'

import mkdir from 'fire-keeper/mkdir'
import read from 'fire-keeper/read'
import write from 'fire-keeper/write'

import { nowIso } from '../shared/utils.js'

type JsonObject = Record<string, unknown>

export type TaskProgressEvent = {
  taskId: string
  type: string
  createdAt: string
  payload: JsonObject
}

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
  const event: TaskProgressEvent = {
    taskId: params.taskId,
    type: params.type,
    createdAt: nowIso(),
    payload: params.payload ?? {},
  }
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
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Partial<TaskProgressEvent>
    if (typeof record.taskId !== 'string') return null
    if (typeof record.type !== 'string') return null
    if (typeof record.createdAt !== 'string') return null
    if (!record.payload || typeof record.payload !== 'object') return null
    return record as TaskProgressEvent
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
