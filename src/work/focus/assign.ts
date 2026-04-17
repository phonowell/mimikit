import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { readHistory, rewriteHistory } from '../../persistence/history/store.js'
import {
  findRuntimePlan,
  updateRuntimePlan,
} from '../orchestrator/plan-state-write.js'
import { patchRuntimeTask } from '../orchestrator/task-state-write.js'

import { ensureFocus, touchFocus } from './state.js'

import type { FocusId, HistoryMessage } from '../../foundation/types/index.js'
import type { FocusRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const assignFocusByTargetId = async (
  runtime: FocusRuntime,
  targetType: 'task' | 'plan' | 'history',
  targetId: string,
  focusId: FocusId,
): Promise<boolean> => {
  ensureFocus(runtime, focusId)

  if (targetType === 'task') {
    const task = patchRuntimeTask({
      runtime,
      taskId: targetId,
      patch: { focusId },
    })
    if (!task) return false
    touchFocus(runtime, focusId)
    await persistRuntimeState(runtime)
    return true
  }

  if (targetType === 'plan') {
    const plan = findRuntimePlan(runtime, targetId)
    if (!plan) return false
    updateRuntimePlan({
      runtime,
      planId: targetId,
      update: (current) => ({ ...current, focusId }),
    })
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
