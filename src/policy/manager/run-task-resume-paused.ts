import { resumeTask } from '../../execution/worker/resume-task.js'

import { logRunTaskDispatch } from './action-apply-create-shared.js'
import { linkTriggeredPlanToTask } from './plan-progress.js'

import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const findPausedFingerprintTask = (
  runtime: ManagerRuntime,
  fingerprint: string,
) =>
  runtime.domain.tasks.find(
    (task) => task.status === 'paused' && task.fingerprint === fingerprint,
  )

export const resumePausedFingerprintTask = async (params: {
  runtime: ManagerRuntime
  fingerprint: string
  triggeredPlanIds: ReadonlySet<string> | undefined
}): Promise<boolean> => {
  const pausedTask = findPausedFingerprintTask(
    params.runtime,
    params.fingerprint,
  )
  if (!pausedTask) return false
  linkTriggeredPlanToTask({
    runtime: params.runtime,
    task: pausedTask,
    triggeredPlanIds: params.triggeredPlanIds,
  })
  const resumed = await resumeTask(params.runtime, pausedTask.id, {
    source: 'deferred',
  })
  if (!resumed.ok) return false
  await logRunTaskDispatch(params.runtime, {
    taskId: pausedTask.id,
    mode: 'resume_paused',
  })
  return true
}
