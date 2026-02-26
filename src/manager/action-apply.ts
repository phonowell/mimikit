import {
  enforceFocusCapacity,
  ensureFocus,
  resolveDefaultFocusId,
} from '../focus/index.js'

import {
  applyRunTask,
  applyScheduleTask,
  type ApplyTaskActionsOptions,
} from './action-apply-create.js'
import {
  applyAssignFocusAction,
  applyCreateFocusAction,
  applyUpdateFocusAction,
} from './action-apply-focus.js'
import {
  applyCreateIntent,
  applyDeleteIntent,
  applyUpdateIntent,
} from './action-apply-intent.js'
import {
  collectTaskResultSummaries,
} from './action-apply-schema.js'
import {
  applyCancelTaskAction,
  applyCompressContextAction,
  applyRestartRuntimeAction,
} from './action-apply-runtime.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export { collectTaskResultSummaries }

type ApplyContext = {
  seen: Set<string>
  options?: ApplyTaskActionsOptions
}

type ApplyResult = 'continue' | 'stop'

type ApplyHandler = (
  runtime: RuntimeState,
  item: Parsed,
  context: ApplyContext,
) => Promise<ApplyResult>

const ACTION_HANDLERS: Record<string, ApplyHandler> = {
  create_intent: async (runtime, item) => {
    await applyCreateIntent(runtime, item)
    return 'continue'
  },
  update_intent: async (runtime, item) => {
    await applyUpdateIntent(runtime, item)
    return 'continue'
  },
  delete_intent: async (runtime, item) => {
    await applyDeleteIntent(runtime, item)
    return 'continue'
  },
  run_task: async (runtime, item, context) => {
    await applyRunTask(runtime, item, context.seen, context.options)
    return 'continue'
  },
  schedule_task: async (runtime, item, context) => {
    await applyScheduleTask(runtime, item, context.seen)
    return 'continue'
  },
  cancel_task: async (runtime, item) => {
    await applyCancelTaskAction(runtime, item)
    return 'continue'
  },
  compress_context: async (runtime, item) => {
    await applyCompressContextAction(runtime, item)
    return 'continue'
  },
  create_focus: async (runtime, item) => {
    await applyCreateFocusAction(runtime, item)
    return 'continue'
  },
  update_focus: async (runtime, item) => {
    await applyUpdateFocusAction(runtime, item)
    return 'continue'
  },
  assign_focus: async (runtime, item) => {
    await applyAssignFocusAction(runtime, item)
    return 'continue'
  },
  restart_runtime: async (runtime, item) => {
    const shouldStop = await applyRestartRuntimeAction(runtime, item)
    return shouldStop ? 'stop' : 'continue'
  },
}

export const applyTaskActions = async (
  runtime: RuntimeState,
  items: Parsed[],
  options?: ApplyTaskActionsOptions,
): Promise<void> => {
  const context: ApplyContext = {
    seen: new Set<string>(),
    ...(options !== undefined ? { options } : {}),
  }
  for (const item of items) {
    const handler = ACTION_HANDLERS[item.name]
    if (!handler) continue
    const result = await handler(runtime, item, context)
    if (result === 'stop') return
  }
  ensureFocus(runtime, resolveDefaultFocusId(runtime))
  enforceFocusCapacity(runtime)
}
