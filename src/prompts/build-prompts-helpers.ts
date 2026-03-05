import { parse as parseYaml } from 'yaml'

import { readTextFileIfExists } from '../fs/read-text.js'
import { readErrorCode } from '../shared/error-code.js'
import { compareIsoDesc } from '../shared/time.js'

import { escapeCdata, stringifyPromptYaml } from './format-base.js'

import type { Task, TaskResult } from '../types/index.js'

const clipUtf8ByBytes = (value: string, maxBytes: number): string => {
  if (maxBytes <= 0) return ''
  const buffer = Buffer.from(value, 'utf8')
  if (buffer.byteLength <= maxBytes) return value
  return buffer.subarray(0, maxBytes).toString('utf8').trimEnd()
}

const parseYamlListSection = (
  value: string,
): { key: string; entries: unknown[] } | undefined => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  let parsed: unknown
  try {
    parsed = parseYaml(trimmed)
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return undefined
  const keys = Object.keys(parsed as Record<string, unknown>)
  if (keys.length !== 1) return undefined
  const key = keys[0]
  if (!key) return undefined
  const entries = (parsed as Record<string, unknown>)[key]
  if (!Array.isArray(entries)) return undefined
  return { key, entries }
}

export const encodePromptTextSection = (
  value: string,
  maxBytes: number,
): string => escapeCdata(clipUtf8ByBytes(value, maxBytes))

export const encodePromptYamlSection = (
  value: string,
  maxBytes: number,
): string => {
  if (maxBytes <= 0) return ''
  const parsed = parseYamlListSection(value)
  if (!parsed) return ''
  const selected = [...parsed.entries]
  while (selected.length > 0) {
    const yaml = stringifyPromptYaml({
      [parsed.key]: selected,
    })
    if (Buffer.byteLength(yaml, 'utf8') <= maxBytes) return escapeCdata(yaml)
    selected.pop()
  }
  return ''
}

export const mergeTaskResults = (
  primary: TaskResult[],
  secondary: TaskResult[],
): TaskResult[] => {
  const merged = new Map<string, TaskResult>()
  for (const result of secondary) merged.set(result.taskId, result)
  for (const result of primary) merged.set(result.taskId, result)
  const values = Array.from(merged.values())
  values.sort((a, b) => compareIsoDesc(a.completedAt, b.completedAt))
  return values
}

export const collectTaskResults = (tasks: Task[]): TaskResult[] =>
  tasks
    .filter((task): task is Task & { result: TaskResult } =>
      Boolean(task.result),
    )
    .map((task) => task.result)

export const collectResultTaskIds = (tasks: Task[]): string[] =>
  tasks
    .filter((task) => task.status !== 'pending' && task.status !== 'running')
    .map((task) => task.id)

export const buildTaskResultDateHints = (
  tasks: Task[],
): Record<string, string> =>
  Object.fromEntries(
    tasks
      .filter(
        (task): task is Task & { completedAt: string } =>
          typeof task.completedAt === 'string' && task.completedAt.length > 0,
      )
      .map((task) => [task.id, task.completedAt.slice(0, 10)]),
  )

export const readOptionalMarkdown = async (path: string): Promise<string> => {
  try {
    return await readTextFileIfExists(path)
  } catch (error) {
    if (readErrorCode(error) === 'ENOENT') return ''
    throw error
  }
}
