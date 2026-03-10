export { GLOBAL_FOCUS_ID } from './constants.js'

export { assignFocusByTargetId, resolveFocusByQuote } from './assign.js'

export {
  buildFocusPromptPayload,
  type FocusListEntry,
  type FocusPromptDigestEntry,
} from './prompt.js'

export { enforceActiveFocusLimit, pruneArchivedFocuses } from './capacity.js'

export {
  ensureFocus,
  ensureGlobalFocus,
  resolveDefaultFocusId,
  touchFocus,
  updateFocus,
} from './state.js'
