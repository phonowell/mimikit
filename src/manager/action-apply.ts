import {
  enforceFocusCapacity,
  ensureFocus,
  resolveDefaultFocusId,
} from '../focus/index.js'

import {
  collectTaskResultSummaries,
} from './action-apply-schema.js'
import {
  applyRegisteredManagerAction,
  type ApplyContext,
  type ApplyTaskActionsOptions,
} from './action-registry.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export { collectTaskResultSummaries }

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
    const result = await applyRegisteredManagerAction(runtime, item, context)
    if (result === 'stop') return
  }
  ensureFocus(runtime, resolveDefaultFocusId(runtime))
  enforceFocusCapacity(runtime)
}
