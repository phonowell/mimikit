import { appendTaskSystemMessage } from '../history/task-events.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyWorkerLoop } from '../orchestrator/core/signals.js'
import { enqueueTask } from '../orchestrator/core/task-lifecycle.js'
import {
  buildTaskSemanticKey,
  findActiveTaskBySemanticKey,
} from '../orchestrator/core/task-state.js'
import { enqueueWorkerTask } from '../worker/dispatch.js'
import { resolveSlotStatus } from '../worker/task-state-shared.js'

import { markCreateAttempt } from './action-apply-guards.js'
import { runTaskSchema } from './action-apply-schema.js'
import { resolveActionFocusId } from './action-focus-id.js'
import { linkTriggeredPlanToTask } from './plan-progress.js'
import { requestRunTaskConfirmation } from './run-task-confirmation-request.js'
import {
  collectConfirmedRunTaskChoiceIds,
  resolveRunTaskConfirmationRequirement,
} from './run-task-confirmation.js'
import { handleActiveSemanticTask } from './run-task-existing.js'
import { resolveRunTaskTarget } from './run-task-target.js'
import {
  buildTaskContractFromAttrs,
  resolveWorkerPromptFromAttrs,
} from './task-contract.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { WorkerProfile } from '../types/index.js'

export type ApplyTaskActionsOptions = {
  suppressRunTask?: boolean
  triggeredPlanIds: ReadonlySet<string> | undefined
}

export const applyRunTask = async (
  runtime: RuntimeState,
  item: Parsed,
  seen: Set<string>,
  options?: ApplyTaskActionsOptions,
): Promise<'continue' | 'stop'> => {
  const logRunTaskDispatch = async (params: {
    taskId: string
    mode: 'reuse_pending' | 'created'
  }): Promise<void> => {
    const slots = resolveSlotStatus(runtime)
    await bestEffort('appendLog: run_task_dispatch', () =>
      appendLog(runtime.paths.log, {
        event: 'run_task_dispatch',
        taskId: params.taskId,
        mode: params.mode,
        availableSlots: slots.available_slots,
        occupiedSlots: slots.occupied_slots,
        maxSlots: slots.max_slots,
      }),
    )
  }

  if (options?.suppressRunTask) return 'continue'
  const parsed = runTaskSchema.safeParse(item.attrs)
  if (!parsed.success) return 'continue'
  const profile: WorkerProfile = 'worker'
  const focusId = resolveActionFocusId(runtime, parsed.data.focus_id)
  const provider = 'codex' as const
  const contract = buildTaskContractFromAttrs(parsed.data)
  if (!contract) return 'continue'
  const workerPrompt = resolveWorkerPromptFromAttrs(parsed.data)
  if (!workerPrompt) return 'continue'
  const confirmation = resolveRunTaskConfirmationRequirement({
    prompt: workerPrompt,
    title: parsed.data.title,
    goal: contract.goal,
    scope: contract.scope,
    acceptance: contract.acceptance,
    ...(contract.outOfScope ? { outOfScope: contract.outOfScope } : {}),
    ...(contract.contextRefs ? { contextRefs: contract.contextRefs } : {}),
  })
  const confirmedRunTaskChoiceIds = collectConfirmedRunTaskChoiceIds(
    runtime.session.inflightInputs,
  )
  if (
    confirmation.required &&
    !confirmedRunTaskChoiceIds.has(confirmation.choiceId)
  ) {
    await requestRunTaskConfirmation({
      runtime,
      choiceId: confirmation.choiceId,
      estimatedChars: confirmation.estimatedChars,
      title: parsed.data.title,
      focusId,
    })
    return 'stop'
  }
  const target = await resolveRunTaskTarget({
    actionName: item.name,
    cwd: parsed.data.cwd,
    ...(parsed.data.branch ? { branch: parsed.data.branch } : {}),
  })
  const semanticKey = buildTaskSemanticKey({
    prompt: workerPrompt,
    title: parsed.data.title,
    cwd: target.cwd,
    profile,
    provider,
    focusId,
    ...(target.repoKey ? { repoKey: target.repoKey } : {}),
    ...(target.branch ? { branch: target.branch } : {}),
    contract,
  })
  const debounce = markCreateAttempt(runtime, semanticKey)
  if (debounce.debounced) return 'continue'
  const dedupeKey = `${workerPrompt}\n${parsed.data.title}\n${target.cwd}\n${profile}\n${provider}\n${focusId}\n${target.repoKey ?? ''}\n${target.branch ?? ''}`
  const dedupeContractSuffix = [
    contract.goal,
    contract.scope,
    ...contract.acceptance,
    contract.outOfScope ?? '',
    ...(contract.contextRefs ?? []),
  ].join('\n')
  const dedupeKeyWithContract = `${dedupeKey}\n${dedupeContractSuffix}`
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
        prompt: workerPrompt,
        title: parsed.data.title,
        cwd: target.cwd,
        profile,
        provider,
        focusId,
        ...(target.repoKey ? { repoKey: target.repoKey } : {}),
        ...(target.branch ? { branch: target.branch } : {}),
        contract,
      },
      triggeredPlanIds: options?.triggeredPlanIds,
      onReusePending: (taskId) =>
        logRunTaskDispatch({
          taskId,
          mode: 'reuse_pending',
        }),
    })
    if (handled) return 'continue'
  }

  const { task, created } = enqueueTask(
    runtime.tasks,
    workerPrompt,
    parsed.data.title,
    target.cwd,
    profile,
    provider,
    focusId,
    target.repoKey,
    target.branch,
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
    await logRunTaskDispatch({ taskId: task.id, mode: 'reuse_pending' })
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
  await logRunTaskDispatch({ taskId: task.id, mode: 'created' })
  await persistRuntimeState(runtime)
  enqueueWorkerTask(runtime, task)
  notifyWorkerLoop(runtime)
  return 'continue'
}
