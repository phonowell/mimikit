import {
  resolveTaskExecutionTarget,
  type TaskExecutionTarget,
} from '../shared/task-execution-target.js'
import { materializeTaskWorktreeCwd } from '../shared/task-worktree-materialize.js'

import { ActionApplyFeedbackError } from './action-apply-feedback-error.js'
import { formatEnqueueTaskWorktreePrepareFailedHint } from './action-feedback-hints.js'

export const resolveRunTaskTarget = async (params: {
  actionName: string
  cwd: string
  branch?: string
}): Promise<TaskExecutionTarget> => {
  const effectiveCwd = params.branch
    ? await materializeTaskWorktreeCwd(params.cwd, params.branch)
    : { ok: true as const, cwd: params.cwd }
  if (!effectiveCwd.ok) {
    throw new ActionApplyFeedbackError({
      action: params.actionName,
      error: 'action_execution_rejected',
      hint: formatEnqueueTaskWorktreePrepareFailedHint(
        params.branch ?? '',
        effectiveCwd.detail,
      ),
    })
  }
  return resolveTaskExecutionTarget(effectiveCwd.cwd)
}
