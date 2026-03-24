import {
  ensureFocus,
  resolveDefaultFocusId,
  touchFocus,
} from '../../work/focus/index.js'

import type { FocusId } from '../../foundation/types/index.js'
import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'

export const resolveActionFocusId = (
  runtime: RuntimeState,
  actionFocusId?: string,
): FocusId => {
  const trimmed = actionFocusId?.trim()
  const focusId =
    trimmed && trimmed.length > 0 ? trimmed : resolveDefaultFocusId(runtime)
  ensureFocus(runtime, focusId)
  touchFocus(runtime, focusId)
  return focusId
}
