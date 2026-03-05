import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const MAX_LIVE_OUTPUT_CHARS = 800
const taskLiveOutputStore = new WeakMap<RuntimeState, Map<string, string>>()

const normalizeLiveOutput = (value: string): string => {
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return ''
  if (normalized.length <= MAX_LIVE_OUTPUT_CHARS) return normalized
  const clipped = normalized.slice(-MAX_LIVE_OUTPUT_CHARS).trimStart()
  return `...${clipped}`
}

const ensureOutputMap = (runtime: RuntimeState): Map<string, string> => {
  const existing = taskLiveOutputStore.get(runtime)
  if (existing) return existing
  const created = new Map<string, string>()
  taskLiveOutputStore.set(runtime, created)
  return created
}

export const getTaskLiveOutputById = (
  runtime: RuntimeState,
): ReadonlyMap<string, string> | undefined => taskLiveOutputStore.get(runtime)

export const setTaskLiveOutput = (
  runtime: RuntimeState,
  taskId: string,
  output: string,
): boolean => {
  const id = taskId.trim()
  if (!id) return false
  const next = normalizeLiveOutput(output)
  const map = taskLiveOutputStore.get(runtime)
  if (!next) {
    if (!map || !map.has(id)) return false
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
  runtime: RuntimeState,
  taskId: string,
): boolean => {
  const id = taskId.trim()
  if (!id) return false
  const map = taskLiveOutputStore.get(runtime)
  if (!map || !map.has(id)) return false
  map.delete(id)
  if (map.size === 0) taskLiveOutputStore.delete(runtime)
  return true
}
