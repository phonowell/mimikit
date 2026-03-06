export { GLOBAL_FOCUS_ID } from './constants.js'

export { assignFocusByTargetId, resolveFocusByQuote } from './assign.js'
export { collectPreferredFocusIds } from './batch.js'

export {
  buildFocusPromptPayload,
  type FocusListEntry,
  type FocusPromptContextEntry,
} from './prompt.js'

export { enforceFocusCapacity, selectWorkingFocusIds } from './capacity.js'

export {
  ensureFocus,
  ensureGlobalFocus,
  resolveDefaultFocusId,
  touchFocus,
  updateFocus,
} from './state.js'
