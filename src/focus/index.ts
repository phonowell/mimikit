export {
  GLOBAL_FOCUS_ID,
  MAX_FOCUS_OPEN_ITEMS,
  MAX_FOCUS_RECENT_BYTES,
  MAX_RECENT_HISTORY_BYTES,
  MAX_WORKING_FOCUSES,
  MIN_RECENT_MESSAGES,
} from './constants.js'

export { assignFocusByTargetId, resolveFocusByQuote } from './assign.js'
export { collectPreferredFocusIds } from './batch.js'
export { parseFocusOpenItems } from './parse.js'

export {
  buildFocusPromptPayload,
  type FocusListEntry,
  type FocusPromptContextEntry,
  type FocusPromptPayload,
} from './prompt.js'

export { enforceFocusCapacity, selectWorkingFocusIds } from './capacity.js'

export {
  ensureFocus,
  ensureGlobalFocus,
  findFocus,
  resolveDefaultFocusId,
  setFocusStatus,
  touchFocus,
  updateFocus,
  upsertFocusContext,
} from './state.js'
