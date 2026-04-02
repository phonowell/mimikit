import { cancelTask } from '../../execution/worker/cancel-task.js'
import { deleteTask } from '../../execution/worker/delete-task.js'
import { pauseTask } from '../../execution/worker/pause-task.js'
import { resumeTask } from '../../execution/worker/resume-task.js'

import type { Task } from '../../foundation/types/index.js'
import type { OrchestratorRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export type TaskMutationAction = 'cancel' | 'delete' | 'pause' | 'resume'
export type TaskMutationMeta = {
  source?: string
  reason?: string
  resumeInstruction?: string
}

export const resolveTaskById = (
  runtime: OrchestratorRuntime,
  taskId: string,
): Task | undefined => {
  const id = taskId.trim()
  if (!id) return undefined
  return runtime.domain.tasks.find((task) => task.id === id)
}

export const mutateTaskByAction = (
  runtime: OrchestratorRuntime,
  action: TaskMutationAction,
  taskId: string,
  meta?: TaskMutationMeta,
) => {
  if (action === 'cancel') return cancelTask(runtime, taskId, meta)
  if (action === 'delete') return deleteTask(runtime, taskId, meta)
  if (action === 'pause') return pauseTask(runtime, taskId, meta)
  return resumeTask(runtime, taskId, meta)
}
