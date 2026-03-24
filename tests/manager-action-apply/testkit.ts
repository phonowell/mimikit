import { createTestRuntimeState } from '../helpers/runtime-state.js'

import type { RuntimeState } from '../../src/kernel/orchestrator/runtime-state.js'

export const CONTRACT_ATTRS = {
  goal: 'Deliver requested outcome',
  in_scope: 'Single runnable worker task',
  done_when_1: 'Return concrete output',
}

export const TASK_CWD = '/tmp/manager-action-apply-task'

export const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  return runtime
}
