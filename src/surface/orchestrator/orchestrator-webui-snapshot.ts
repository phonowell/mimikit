import { getTaskLiveOutputById } from '../../execution/worker/live-output.js'
import { clonePendingUserChoices } from '../../work/orchestrator/user-choice-state.js'
import { buildFocusViews } from '../read-model/focus-view.js'
import { sortTaskPlansForView } from '../read-model/plan-select.js'
import { buildTaskViews } from '../read-model/task-view.js'

import { getChatMessagesSnapshot } from './orchestrator-chat-history.js'

import type { OrchestratorStatus } from '../../kernel/orchestrator/orchestrator-helpers.js'
import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'

export const buildOrchestratorTaskViews = (
  runtime: RuntimeState,
  limit = 200,
) => {
  const liveOutputByTaskId = getTaskLiveOutputById(runtime)
  return buildTaskViews(runtime.tasks, limit, {
    maxConcurrentWorkers: runtime.config.worker.maxConcurrent,
    runningTaskCount: runtime.worker.runningControllers.size,
    ...(liveOutputByTaskId ? { liveOutputByTaskId } : {}),
  })
}

export const buildOrchestratorPlanViews = (
  runtime: RuntimeState,
  limit = 200,
) => {
  const items = sortTaskPlansForView(runtime.taskPlans)
    .slice(0, Math.max(0, limit))
    .map((item) => ({ ...item }))
  return { items }
}

export const buildOrchestratorFocusViews = (
  runtime: RuntimeState,
  limit = 200,
) => buildFocusViews(runtime.focuses, limit, runtime.tasks)

export const buildOrchestratorWebUiSnapshot = async (params: {
  runtime: RuntimeState
  status: OrchestratorStatus
  messageLimit: number
  taskLimit: number
}) => ({
  status: params.status,
  messages: await getChatMessagesSnapshot(params.runtime, params.messageLimit),
  tasks: buildOrchestratorTaskViews(params.runtime, params.taskLimit),
  plans: buildOrchestratorPlanViews(params.runtime, params.taskLimit),
  focuses: buildOrchestratorFocusViews(params.runtime, params.taskLimit),
  choices: clonePendingUserChoices(params.runtime.ui.pendingUserChoices),
})

export const buildOrchestratorWebUiDeltaSnapshot = async (params: {
  runtime: RuntimeState
  status: OrchestratorStatus
  messageLimit: number
  afterId?: string
}) => ({
  status: params.status,
  messages: await getChatMessagesSnapshot(
    params.runtime,
    params.messageLimit,
    params.afterId,
  ),
  tasks: buildOrchestratorTaskViews(params.runtime),
  plans: buildOrchestratorPlanViews(params.runtime),
  focuses: buildOrchestratorFocusViews(params.runtime),
  choices: clonePendingUserChoices(params.runtime.ui.pendingUserChoices),
})
