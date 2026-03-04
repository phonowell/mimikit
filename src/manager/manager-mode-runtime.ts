import { nowIso } from '../shared/utils.js'

import type { ManagerLlmMode } from '../config.js'
import type { RuntimeState } from './runtime-adapter.js'

const buildDefaultAutoModeState = () => ({
  firstUserInputPending: true,
})

export const ensureRuntimeManagerAutoModeState = (
  runtime: RuntimeState,
): {
  firstUserInputPending: boolean
  lockedMode?: 'responses'
  firstUserChatFailure?: { at: string; error: string }
} => {
  if (runtime.managerAutoModeState) return runtime.managerAutoModeState
  runtime.managerAutoModeState = buildDefaultAutoModeState()
  return runtime.managerAutoModeState
}

export const resolveRuntimeManagerMode = (
  runtime: RuntimeState,
): ManagerLlmMode => {
  const configured = runtime.config.manager.mode
  if (configured !== 'auto') return configured
  const autoState = ensureRuntimeManagerAutoModeState(runtime)
  if (autoState.lockedMode === 'responses') return 'responses'
  return 'auto'
}

export const markRuntimeManagerFirstUserChatFailure = (
  runtime: RuntimeState,
  message: string,
): void => {
  const autoState = ensureRuntimeManagerAutoModeState(runtime)
  autoState.firstUserChatFailure = {
    at: nowIso(),
    error: message,
  }
}

export const lockRuntimeManagerToResponses = (runtime: RuntimeState): void => {
  const autoState = ensureRuntimeManagerAutoModeState(runtime)
  autoState.lockedMode = 'responses'
}
