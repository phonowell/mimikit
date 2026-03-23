import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export const markCreateAttempt = (
  runtime: RuntimeState,
  semanticKey: string,
): { debounced: boolean; waitMs: number } => {
  const now = Date.now()
  const debounceMs = Math.max(0, runtime.config.manager.taskCreate.debounceMs)
  const debounceMap = runtime.worker.createTaskDebounce
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
