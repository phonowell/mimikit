import { appendLog } from '../../persistence/log/append.js'
import {
  enforceActiveFocusLimit,
  pruneArchivedFocuses,
} from '../../work/focus/capacity.js'
import { ensureFocus, resolveDefaultFocusId } from '../../work/focus/state.js'

import { isActionApplyFeedbackError } from './action-apply-feedback-error.js'
import { managerActionCliLogger } from './action-cli-log.js'
import { applyRegisteredManagerAction } from './action-registry-definitions.js'
import {
  type ApplyContext,
  type ApplyTaskActionsOptions,
} from './action-registry-shared.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const applyTaskActions = async (
  runtime: ManagerRuntime,
  items: Parsed[],
  options?: ApplyTaskActionsOptions,
): Promise<void> => {
  const context: ApplyContext = {
    seen: new Set<string>(),
    ...(options !== undefined ? { options } : {}),
  }
  const total = items.length
  const lifecycleMeta = {
    ...(options?.batchId ? { batchId: options.batchId } : {}),
    ...(options?.roundId ? { roundId: options.roundId } : {}),
    ...(runtime.process.manager.threadId
      ? { traceId: runtime.process.manager.threadId }
      : {}),
  }
  for (const [index, item] of items.entries()) {
    const order = index + 1
    const startedAt = Date.now()
    const lifecycleBase = {
      item,
      index: order,
      total,
      ...lifecycleMeta,
    }
    await managerActionCliLogger.logLifecycle({
      stage: 'dispatch',
      ...lifecycleBase,
    })
    await managerActionCliLogger.logLifecycle({
      stage: 'running',
      ...lifecycleBase,
    })
    let result
    try {
      result = await applyRegisteredManagerAction(runtime, item, context)
    } catch (error) {
      await managerActionCliLogger.logLifecycle({
        stage: 'failed',
        ...lifecycleBase,
        error,
        elapsedMs: Math.max(0, Date.now() - startedAt),
      })
      if (isActionApplyFeedbackError(error)) {
        await appendLog(runtime.paths.log, {
          event: 'manager_action_apply_feedback',
          action: error.feedback.action,
          error: error.feedback.error,
          hint: error.feedback.hint,
          ...lifecycleMeta,
        })
        continue
      }
      throw error
    }
    await managerActionCliLogger.logLifecycle({
      stage: result === 'stop' ? 'stopped' : 'applied',
      ...lifecycleBase,
      result,
      elapsedMs: Math.max(0, Date.now() - startedAt),
    })
    if (result === 'stop') return
  }
  ensureFocus(runtime, resolveDefaultFocusId(runtime))
  await enforceActiveFocusLimit(runtime)
  await pruneArchivedFocuses(runtime)
}
