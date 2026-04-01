import { clipCompactText } from '../../foundation/shared/text.js'

import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const MAX_LIVE_OUTPUT_CHARS = 800
const taskLiveOutputStore = new WeakMap<WorkerRuntime, Map<string, string>>()

export const summarizeTaskLiveOutput = (value: string): string => {
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return ''
  const [firstLine = ''] = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (!firstLine) return ''
  if (firstLine.startsWith('$ ')) {
    const command = firstLine.slice(2).trim()
    return clipCompactText(
      command ? `running command: ${command}` : 'running command',
      MAX_LIVE_OUTPUT_CHARS,
    )
  }
  return clipCompactText(firstLine, MAX_LIVE_OUTPUT_CHARS)
}

const ensureOutputMap = (runtime: WorkerRuntime): Map<string, string> => {
  const existing = taskLiveOutputStore.get(runtime)
  if (existing) return existing
  const created = new Map<string, string>()
  taskLiveOutputStore.set(runtime, created)
  return created
}

export const getTaskLiveOutputById = (
  runtime: WorkerRuntime,
): ReadonlyMap<string, string> | undefined => taskLiveOutputStore.get(runtime)

export const setTaskLiveOutput = (
  runtime: WorkerRuntime,
  taskId: string,
  output: string,
): boolean => {
  const id = taskId.trim()
  if (!id) return false
  const next = summarizeTaskLiveOutput(output)
  const map = taskLiveOutputStore.get(runtime)
  if (!next) {
    if (!map?.has(id)) return false
    map.delete(id)
    if (map.size === 0) taskLiveOutputStore.delete(runtime)
    return true
  }
  const writableMap = map ?? ensureOutputMap(runtime)
  if (writableMap.get(id) === next) return false
  writableMap.set(id, next)
  return true
}

export const clearTaskLiveOutput = (
  runtime: WorkerRuntime,
  taskId: string,
): boolean => {
  const id = taskId.trim()
  if (!id) return false
  const map = taskLiveOutputStore.get(runtime)
  if (!map?.has(id)) return false
  map.delete(id)
  if (map.size === 0) taskLiveOutputStore.delete(runtime)
  return true
}
