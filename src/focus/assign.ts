import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { readHistory, rewriteHistory } from '../storage/history-jsonl.js'

import { ensureFocus, touchFocus } from './state.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { FocusId, HistoryMessage } from '../types/index.js'

export const resolveFocusByQuote = async (
  runtime: RuntimeState,
  quoteId: string,
): Promise<FocusId | undefined> => {
  const history = await readHistory(runtime.paths.history)
  return history.find((item) => item.id === quoteId)?.focusId
}

export const assignFocusByTargetId = async (
  runtime: RuntimeState,
  targetId: string,
  focusId: FocusId,
): Promise<boolean> => {
  ensureFocus(runtime, focusId)

  const task = runtime.tasks.find((item) => item.id === targetId)
  if (task) {
    task.focusId = focusId
    touchFocus(runtime, focusId)
    await persistRuntimeState(runtime)
    return true
  }

  const cronJob = runtime.cronJobs.find((item) => item.id === targetId)
  if (cronJob) {
    cronJob.focusId = focusId
    touchFocus(runtime, focusId)
    await persistRuntimeState(runtime)
    return true
  }

  const intent = runtime.idleIntents.find((item) => item.id === targetId)
  if (intent) {
    intent.focusId = focusId
    touchFocus(runtime, focusId)
    await persistRuntimeState(runtime)
    return true
  }

  const archivedIntent = runtime.idleIntentArchive.find(
    (item) => item.id === targetId,
  )
  if (archivedIntent) {
    archivedIntent.focusId = focusId
    touchFocus(runtime, focusId)
    await persistRuntimeState(runtime)
    return true
  }

  const history = await readHistory(runtime.paths.history)
  const index = history.findIndex((item) => item.id === targetId)
  if (index < 0) return false
  const current = history[index]
  if (!current) return false
  const nextMessage: HistoryMessage = { ...current, focusId }
  const next = [...history]
  next[index] = nextMessage
  await rewriteHistory(runtime.paths.history, next)
  touchFocus(runtime, focusId)
  await persistRuntimeState(runtime)
  return true
}
