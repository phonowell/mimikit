import { cancelTask } from '../../execution/worker/cancel-task.js'
import { enqueueWorkerTask } from '../../execution/worker/dispatch.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { notifyWorkerLoop } from '../../kernel/orchestrator/signals.js'

import { linkTriggeredPlanToTask } from './plan-progress.js'

import type {
  Task,
  WorkerProfile,
  WorkerProvider,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const handleActiveSemanticTask = async (params: {
  runtime: ManagerRuntime
  activeTask: Task
  nextTask: {
    fingerprint: string
    title: string
    cwd: string
    profile: WorkerProfile
    provider: WorkerProvider
    focusId: string
    repoKey?: string
    branch?: string
  }
  triggeredPlanIds: ReadonlySet<string> | undefined
  onReusePending: (taskId: string) => Promise<void>
}): Promise<boolean> => {
  const linked = linkTriggeredPlanToTask({
    runtime: params.runtime,
    task: params.activeTask,
    triggeredPlanIds: params.triggeredPlanIds,
  })
  const activeFingerprint = params.activeTask.fingerprint
  const nextFingerprint = params.nextTask.fingerprint
  if (activeFingerprint !== nextFingerprint) {
    await cancelTask(params.runtime, params.activeTask.id, {
      source: 'deferred',
      reason: 'superseded_by_newer_semantic_task',
    })
    return false
  }
  if (params.activeTask.status !== 'pending') {
    if (linked) await persistRuntimeState(params.runtime)
    return true
  }
  if (linked) await persistRuntimeState(params.runtime)
  await params.onReusePending(params.activeTask.id)
  enqueueWorkerTask(params.runtime, params.activeTask)
  notifyWorkerLoop(params.runtime)
  return true
}
