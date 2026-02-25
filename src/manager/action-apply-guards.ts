import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const normalizePromptPath = (value: string): string =>
  value.replace(/\\/g, '/').toLowerCase()

export const hasForbiddenWorkerStatePath = (prompt: string): boolean => {
  const normalized = normalizePromptPath(prompt)
  if (!normalized.includes('.mimikit')) return false
  const directDeny =
    normalized.includes('.mimikit/runtime-snapshot') ||
    normalized.includes('.mimikit/results/') ||
    normalized.includes('.mimikit/inputs/') ||
    normalized.includes('.mimikit/tasks/') ||
    normalized.includes('.mimikit/log.jsonl') ||
    normalized.includes('.mimikit/history/') ||
    normalized.endsWith('.mimikit/history')
  if (directDeny) return true
  const pathRefs = normalized.match(
    /(?:^|[^\p{L}\p{N}_-])(?:\.mimikit\/[^\s"'`)\]]+)/gu,
  )
  if (!pathRefs) return false
  return pathRefs.some((rawRef) => {
    const ref = rawRef.trim().replace(/^[^.]*/, '')
    return ref !== '.mimikit/generated' && !ref.startsWith('.mimikit/generated/')
  })
}

export const markCreateAttempt = (
  runtime: RuntimeState,
  semanticKey: string,
): { debounced: boolean; waitMs: number } => {
  const now = Date.now()
  const debounceMs = Math.max(0, runtime.config.manager.taskCreate.debounceMs)
  const debounceMap = runtime.createTaskDebounce
  const last = debounceMap.get(semanticKey)
  debounceMap.set(semanticKey, now)
  if (debounceMap.size > 1_000) {
    const cutoff = now - debounceMs * 4
    for (const [key, value] of debounceMap) {
      if (value >= cutoff) continue
      debounceMap.delete(key)
    }
  }
  if (last === undefined || debounceMs === 0)
    return { debounced: false, waitMs: 0 }
  const delta = now - last
  if (delta >= debounceMs) return { debounced: false, waitMs: 0 }
  return { debounced: true, waitMs: Math.max(0, debounceMs - delta) }
}
