export { GLOBAL_FOCUS_ID } from './constants.js'

export { assignFocusByTargetId, resolveFocusByQuote } from './assign.js'

export {
  buildFocusPromptPayload,
  type FocusListEntry,
  type WorkingFocusEntry,
} from './prompt.js'

export { enforceActiveFocusLimit, pruneArchivedFocuses } from './capacity.js'

export {
  ensureFocus,
  ensureGlobalFocus,
  normalizeFocusSummary,
  resolveDefaultFocusId,
  touchFocus,
  updateFocus,
} from './state.js'
