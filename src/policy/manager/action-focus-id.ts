import {
  ensureFocus,
  resolveDefaultFocusId,
  touchFocus,
} from '../../work/focus/state.js'

import type { FocusId } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const resolveActionFocusId = (
  runtime: ManagerRuntime,
  actionFocusId?: string,
): FocusId => {
  const trimmed = actionFocusId?.trim()
  const focusId =
    trimmed && trimmed.length > 0 ? trimmed : resolveDefaultFocusId(runtime)
  ensureFocus(runtime, focusId)
  touchFocus(runtime, focusId)
  return focusId
}
