import { enqueueWorkerTask } from '../../execution/worker/dispatch.js'
import { resolveSlotStatus } from '../../execution/worker/task-state-shared.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { notifyWorkerLoop } from '../../kernel/orchestrator/signals.js'
import { appendTaskSystemMessage } from '../../persistence/history/task-events.js'
import { enqueueTask } from '../../work/orchestrator/task-lifecycle.js'
import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
  findActiveTaskBySemanticKey,
} from '../../work/orchestrator/task-state.js'

import {
  buildRunTaskBatchKey,
  logRunTaskDispatch,
} from './action-apply-create-shared.js'
import { markCreateAttempt } from './action-apply-guards.js'
import { resolveActionFocusId } from './action-focus-id.js'
import { linkTriggeredPlanToTask } from './plan-progress.js'
import { handleActiveSemanticTask } from './run-task-existing.js'
import { resumePausedFingerprintTask } from './run-task-resume-paused.js'
import { resolveRunTaskTarget } from './run-task-target.js'
import {
  buildTaskContractFromDraft,
  resolveWorkerPromptFromDraft,
} from './task-contract.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type { WorkerProfile } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export type ApplyTaskActionsOptions = {
  suppressRunTask?: boolean
  triggeredPlanIds: ReadonlySet<string> | undefined
  batchId?: string
  roundId?: string
}

const RUN_TASK_PROFILE: WorkerProfile = 'worker'
const RUN_TASK_PROVIDER = 'codex' as const

export const applyRunTask = async (
  runtime: ManagerRuntime,
  item: Parsed,
  seen: Set<string>,
  options?: ApplyTaskActionsOptions,
): Promise<'continue' | 'stop'> => {
  if (options?.suppressRunTask) return 'continue'
  if (item.type !== 'enqueue_task') return 'continue'
  const focusId = resolveActionFocusId(runtime)
  const contract = buildTaskContractFromDraft(item.task)
  if (!contract) return 'continue'
  const workerPrompt = resolveWorkerPromptFromDraft(item.task, {
    stateDir: runtime.config.workDir,
  })
  if (!workerPrompt) return 'continue'
  const target = await resolveRunTaskTarget({
    actionName: item.type,
    cwd: item.task.cwd,
    resourceMode: item.task.mode,
    useWorktree: item.task.use_worktree,
    prompt: workerPrompt,
    title: item.task.title,
    focusId,
    contract,
  })
  const semanticKey = buildTaskSemanticKey({
    prompt: workerPrompt,
    title: item.task.title,
    cwd: target.cwd,
    profile: RUN_TASK_PROFILE,
    provider: RUN_TASK_PROVIDER,
    focusId,
    ...(target.repoKey ? { repoKey: target.repoKey } : {}),
    ...(target.branch ? { branch: target.branch } : {}),
    contract,
  })
  const fingerprint = buildTaskFingerprint({
    prompt: workerPrompt,
    title: item.task.title,
    cwd: target.cwd,
    profile: RUN_TASK_PROFILE,
    provider: RUN_TASK_PROVIDER,
    focusId,
    ...(target.repoKey ? { repoKey: target.repoKey } : {}),
    ...(target.branch ? { branch: target.branch } : {}),
    contract,
  })
  const debounce = markCreateAttempt(runtime, semanticKey)
  if (debounce.debounced) return 'continue'
  const dedupeKeyWithContract = buildRunTaskBatchKey({
    prompt: workerPrompt,
    title: item.task.title,
    cwd: target.cwd,
    profile: RUN_TASK_PROFILE,
    provider: RUN_TASK_PROVIDER,
    focusId,
    ...(target.repoKey ? { repoKey: target.repoKey } : {}),
    ...(target.branch ? { branch: target.branch } : {}),
    contract,
  })
  if (seen.has(dedupeKeyWithContract)) return 'continue'
  seen.add(dedupeKeyWithContract)

  if (
    await resumePausedFingerprintTask({
      runtime,
      fingerprint,
      triggeredPlanIds: options?.triggeredPlanIds,
    })
  )
    return 'continue'
  const activeSemanticTask = findActiveTaskBySemanticKey(
    runtime.domain.tasks,
    semanticKey,
  )
  if (activeSemanticTask) {
    const handled = await handleActiveSemanticTask({
      runtime,
      activeTask: activeSemanticTask,
      nextTask: {
        fingerprint,
        title: item.task.title,
        cwd: target.cwd,
        profile: RUN_TASK_PROFILE,
        provider: RUN_TASK_PROVIDER,
        focusId,
        ...(target.repoKey ? { repoKey: target.repoKey } : {}),
        ...(target.branch ? { branch: target.branch } : {}),
      },
      triggeredPlanIds: options?.triggeredPlanIds,
      onReusePending: (taskId) =>
        logRunTaskDispatch(runtime, { taskId, mode: 'reuse_pending' }),
    })
    if (handled) return 'continue'
  }

  const { task, created } = await enqueueTask(
    runtime.config.workDir,
    runtime.domain.tasks,
    workerPrompt,
    item.task.title,
    target.cwd,
    RUN_TASK_PROFILE,
    RUN_TASK_PROVIDER,
    focusId,
    target.repoKey,
    target.branch,
    target.resourceMode,
    contract,
    target.useWorktree,
  )
  if (!created) {
    const linked = linkTriggeredPlanToTask({
      runtime,
      task,
      triggeredPlanIds: options?.triggeredPlanIds,
    })
    if (linked) await persistRuntimeState(runtime)
    if (task.status !== 'pending') return 'continue'
    await logRunTaskDispatch(runtime, {
      taskId: task.id,
      mode: 'reuse_pending',
    })
    enqueueWorkerTask(runtime, task)
    notifyWorkerLoop(runtime)
    return 'continue'
  }
  linkTriggeredPlanToTask({
    runtime,
    task,
    triggeredPlanIds: options?.triggeredPlanIds,
  })
  const slotStatus = resolveSlotStatus(runtime)
  await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
    createdAt: task.createdAt,
    slotStatus,
  })
  await logRunTaskDispatch(runtime, { taskId: task.id, mode: 'created' })
  await persistRuntimeState(runtime)
  enqueueWorkerTask(runtime, task)
  notifyWorkerLoop(runtime)
  return 'continue'
}
