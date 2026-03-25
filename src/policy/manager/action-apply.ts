import { appendLog } from '../../persistence/log/append.js'
import {
  enforceActiveFocusLimit,
  ensureFocus,
  pruneArchivedFocuses,
  resolveDefaultFocusId,
} from '../../work/focus/index.js'

import { isActionApplyFeedbackError } from './action-apply-feedback-error.js'
import { managerActionCliLogger } from './action-cli-log.js'
import { applyRegisteredManagerAction } from './action-registry-definitions.js'
import {
  type ApplyContext,
  type ApplyTaskActionsOptions,
} from './action-registry-shared.js'
import { collectTaskResultSummaries } from './action-task-result-summary.js'

import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Parsed } from '../actions/model/spec.js'

export { collectTaskResultSummaries }

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
  for (const [index, item] of items.entries()) {
    const order = index + 1
    const startedAt = Date.now()
    await managerActionCliLogger.logLifecycle({
      stage: 'dispatch',
      item,
      index: order,
      total,
      ...(runtime.manager.threadId
        ? { traceId: runtime.manager.threadId }
        : {}),
    })
    await managerActionCliLogger.logLifecycle({
      stage: 'running',
      item,
      index: order,
      total,
      ...(runtime.manager.threadId
        ? { traceId: runtime.manager.threadId }
        : {}),
    })
    let result
    try {
      result = await applyRegisteredManagerAction(runtime, item, context)
    } catch (error) {
      await managerActionCliLogger.logLifecycle({
        stage: 'failed',
        item,
        index: order,
        total,
        error,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        ...(runtime.manager.threadId
          ? { traceId: runtime.manager.threadId }
          : {}),
      })
      if (isActionApplyFeedbackError(error)) {
        await appendLog(runtime.paths.log, {
          event: 'manager_action_apply_feedback',
          action: error.feedback.action,
          error: error.feedback.error,
          hint: error.feedback.hint,
        })
        continue
      }
      throw error
    }
    await managerActionCliLogger.logLifecycle({
      stage: result === 'stop' ? 'stopped' : 'applied',
      item,
      index: order,
      total,
      result,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      ...(runtime.manager.threadId
        ? { traceId: runtime.manager.threadId }
        : {}),
    })
    if (result === 'stop') return
  }
  ensureFocus(runtime, resolveDefaultFocusId(runtime))
  await enforceActiveFocusLimit(runtime)
  await pruneArchivedFocuses(runtime)
}
