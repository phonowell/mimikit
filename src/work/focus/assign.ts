import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { readHistory, rewriteHistory } from '../../persistence/history/store.js'

import { ensureFocus, touchFocus } from './state.js'

import type { FocusId, HistoryMessage } from '../../foundation/types/index.js'
import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'

export const resolveFocusByQuote = async (
  runtime: RuntimeState,
  quoteId: string,
): Promise<FocusId | undefined> => {
  const history = await readHistory(runtime.paths.history)
  return history.find((item) => item.id === quoteId)?.focusId
}

export const assignFocusByTargetId = async (
  runtime: RuntimeState,
  targetType: 'task' | 'plan' | 'history',
  targetId: string,
  focusId: FocusId,
): Promise<boolean> => {
  ensureFocus(runtime, focusId)

  if (targetType === 'task') {
    const task = runtime.tasks.find((item) => item.id === targetId)
    if (!task) return false
    task.focusId = focusId
    touchFocus(runtime, focusId)
    await persistRuntimeState(runtime)
    return true
  }

  if (targetType === 'plan') {
    const plan = runtime.taskPlans.find((item) => item.id === targetId)
    if (!plan) return false
    plan.focusId = focusId
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
