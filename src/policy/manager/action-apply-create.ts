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
import { runTaskSchema } from './action-apply-schema.js'
import { resolveActionFocusId } from './action-focus-id.js'
import { linkTriggeredPlanToTask } from './plan-progress.js'
import { handleActiveSemanticTask } from './run-task-existing.js'
import { resolveRunTaskTarget } from './run-task-target.js'
import {
  buildTaskContractFromAttrs,
  resolveWorkerPromptFromAttrs,
} from './task-contract.js'

import type { WorkerProfile } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Parsed } from '../actions/model/spec.js'

export type ApplyTaskActionsOptions = {
  suppressRunTask?: boolean
  triggeredPlanIds: ReadonlySet<string> | undefined
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
  const parsed = runTaskSchema.safeParse(item.attrs)
  if (!parsed.success) return 'continue'
  const focusId = resolveActionFocusId(runtime, parsed.data.focus_id)
  const contract = buildTaskContractFromAttrs(parsed.data)
  if (!contract) return 'continue'
  const workerPrompt = resolveWorkerPromptFromAttrs(parsed.data)
  if (!workerPrompt) return 'continue'
  const target = await resolveRunTaskTarget({
    actionName: item.name,
    cwd: parsed.data.cwd,
    resourceMode: parsed.data.resource_mode,
    prompt: workerPrompt,
    title: parsed.data.title,
    focusId,
    contract,
    ...(parsed.data.branch ? { branch: parsed.data.branch } : {}),
  })
  const semanticKey = buildTaskSemanticKey({
    prompt: workerPrompt,
    title: parsed.data.title,
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
    title: parsed.data.title,
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
    title: parsed.data.title,
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

  const activeSemanticTask = findActiveTaskBySemanticKey(
    runtime.tasks,
    semanticKey,
  )
  if (activeSemanticTask) {
    const handled = await handleActiveSemanticTask({
      runtime,
      activeTask: activeSemanticTask,
      nextTask: {
        fingerprint,
        title: parsed.data.title,
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
    runtime.tasks,
    workerPrompt,
    parsed.data.title,
    target.cwd,
    RUN_TASK_PROFILE,
    RUN_TASK_PROVIDER,
    focusId,
    target.repoKey,
    target.branch,
    target.resourceMode,
    contract,
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
