import { cancelTask } from '../../execution/worker/cancel-task.js'
import { enqueueWorkerTask } from '../../execution/worker/dispatch.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { notifyWorkerLoop } from '../../kernel/orchestrator/signals.js'
import { buildTaskFingerprint } from '../../work/orchestrator/task-state.js'

import { linkTriggeredPlanToTask } from './plan-progress.js'

import type {
  Task,
  TaskContract,
  WorkerProfile,
  WorkerProvider,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const handleActiveSemanticTask = async (params: {
  runtime: ManagerRuntime
  activeTask: Task
  nextTask: {
    prompt: string
    title: string
    cwd: string
    profile: WorkerProfile
    provider: WorkerProvider
    focusId: string
    repoKey?: string
    branch?: string
    contract: TaskContract
  }
  triggeredPlanIds: ReadonlySet<string> | undefined
  onReusePending: (taskId: string) => Promise<void>
}): Promise<boolean> => {
  const linked = linkTriggeredPlanToTask({
    runtime: params.runtime,
    task: params.activeTask,
    triggeredPlanIds: params.triggeredPlanIds,
  })
  const activeFingerprint = buildTaskFingerprint({
    prompt: params.activeTask.prompt,
    title: params.activeTask.title,
    cwd: params.activeTask.cwd,
    profile: params.activeTask.profile,
    provider: params.activeTask.provider,
    focusId: params.activeTask.focusId,
    ...(params.activeTask.repoKey
      ? { repoKey: params.activeTask.repoKey }
      : {}),
    ...(params.activeTask.branch ? { branch: params.activeTask.branch } : {}),
    ...(params.activeTask.contract
      ? { contract: params.activeTask.contract }
      : {}),
  })
  const nextFingerprint = buildTaskFingerprint({
    prompt: params.nextTask.prompt,
    title: params.nextTask.title,
    cwd: params.nextTask.cwd,
    profile: params.nextTask.profile,
    provider: params.nextTask.provider,
    focusId: params.nextTask.focusId,
    ...(params.nextTask.repoKey ? { repoKey: params.nextTask.repoKey } : {}),
    ...(params.nextTask.branch ? { branch: params.nextTask.branch } : {}),
    contract: params.nextTask.contract,
  })
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
