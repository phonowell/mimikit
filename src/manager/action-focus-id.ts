import {
  ensureFocus,
  resolveDefaultFocusId,
  touchFocus,
} from '../focus/index.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { FocusId } from '../types/index.js'

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
