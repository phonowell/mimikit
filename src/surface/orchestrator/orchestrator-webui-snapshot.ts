import { getTaskLiveOutputById } from '../../execution/worker/live-output.js'
import { buildPlanViews } from '../read-model/plan-view.js'
import { buildTaskViews } from '../read-model/task-view.js'

import { getChatMessagesSnapshot } from './orchestrator-chat-history.js'

import type { OrchestratorStatus } from '../../kernel/orchestrator/orchestrator-helpers.js'
import type { SurfaceRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const buildOrchestratorTaskViews = (
  runtime: SurfaceRuntime,
  limit = 200,
) => {
  const liveOutputByTaskId = getTaskLiveOutputById(runtime)
  return buildTaskViews(runtime.domain.tasks, limit, {
    maxConcurrentWorkers: runtime.config.worker.maxConcurrent,
    runningTaskCount: runtime.process.worker.runningControllers.size,
    ...(liveOutputByTaskId ? { liveOutputByTaskId } : {}),
  })
}

export const buildOrchestratorPlanViews = (
  runtime: SurfaceRuntime,
  limit = 200,
) => buildPlanViews(runtime.domain.taskPlans, limit)

export const buildOrchestratorWebUiSnapshot = async (params: {
  runtime: SurfaceRuntime
  status: OrchestratorStatus
  messageLimit: number
  taskLimit: number
}) => ({
  status: params.status,
  messages: await getChatMessagesSnapshot(params.runtime, params.messageLimit),
  tasks: buildOrchestratorTaskViews(params.runtime, params.taskLimit),
  plans: buildOrchestratorPlanViews(params.runtime, params.taskLimit),
})

export const buildOrchestratorWebUiDeltaSnapshot = async (params: {
  runtime: SurfaceRuntime
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
})
