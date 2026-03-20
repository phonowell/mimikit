import { appendTaskSystemMessage } from '../history/task-events.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { resolveTaskExecutionTarget } from '../shared/task-execution-target.js'
import { resolveSlotStatus } from '../worker/task-state-shared.js'

import { applyAskUserChoiceAction } from './action-apply-choice.js'
import { markCreateAttempt } from './action-apply-guards.js'
import { runTaskSchema } from './action-apply-schema.js'
import { resolveActionFocusId } from './action-focus-id.js'
import {
  buildRunTaskConfirmationQuestion,
  collectConfirmedRunTaskChoiceIds,
  resolveRunTaskConfirmationRequirement,
  RUN_TASK_CANCEL_OPTION_ID,
  RUN_TASK_CONFIRM_OPTION_ID,
} from './run-task-confirmation.js'
import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
  cancelTask,
  enqueueTask,
  enqueueWorkerTask,
  findActiveTaskBySemanticKey,
  notifyWorkerLoop,
  persistRuntimeState,
  type RuntimeState,
} from './runtime-adapter.js'
import {
  buildTaskContractFromAttrs,
  resolveWorkerPromptFromAttrs,
} from './task-contract.js'
import {
  resolveFocusAffinitizedWorkerProvider,
  resolvePreferredWorkerProvider,
} from './worker-provider-selection.js'

import type { Parsed } from '../actions/model/spec.js'
import type { WorkerProfile, WorkerProvider } from '../types/index.js'

export type ApplyTaskActionsOptions = {
  suppressRunTask?: boolean
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
  const affinityProvider = parsed.data.provider
    ? undefined
    : resolveFocusAffinitizedWorkerProvider({
        config: runtime.config,
        tasks: runtime.tasks,
        focusId,
      })
  const provider: WorkerProvider =
    parsed.data.provider ??
    affinityProvider ??
    resolvePreferredWorkerProvider(runtime.config) ??
    'codex'
  const contract = buildTaskContractFromAttrs(parsed.data)
  if (!contract) return 'continue'
  const workerPrompt = resolveWorkerPromptFromAttrs(parsed.data)
  if (!workerPrompt) return 'continue'
  const target = await resolveTaskExecutionTarget(
    parsed.data.cwd,
    parsed.data.branch,
  )
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
    const question = buildRunTaskConfirmationQuestion({
      title: parsed.data.title,
      estimatedChars: confirmation.estimatedChars,
    })
    await applyAskUserChoiceAction(runtime, {
      name: 'ask_user_choice',
      attrs: {
        id: confirmation.choiceId,
        question,
        option_1_id: RUN_TASK_CONFIRM_OPTION_ID,
        option_1_label: 'Continue',
        option_1_reason: 'Run current scope now',
        option_2_id: RUN_TASK_CANCEL_OPTION_ID,
        option_2_label: 'Cancel and narrow',
        option_2_reason: 'Reduce scope before execution',
        default_option_id: RUN_TASK_CANCEL_OPTION_ID,
      },
    })
    await bestEffort('appendLog: run_task_confirmation_required', () =>
      appendLog(runtime.paths.log, {
        event: 'run_task_confirmation_required',
        choiceId: confirmation.choiceId,
        estimatedChars: confirmation.estimatedChars,
        taskTitle: parsed.data.title,
        focusId,
      }),
    )
    return 'stop'
  }
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
    const activeFingerprint = buildTaskFingerprint({
      prompt: activeSemanticTask.prompt,
      title: activeSemanticTask.title,
      cwd: activeSemanticTask.cwd,
      profile: activeSemanticTask.profile,
      provider: activeSemanticTask.provider,
      focusId: activeSemanticTask.focusId,
      ...(activeSemanticTask.repoKey
        ? { repoKey: activeSemanticTask.repoKey }
        : {}),
      ...(activeSemanticTask.branch
        ? { branch: activeSemanticTask.branch }
        : {}),
      ...(activeSemanticTask.contract
        ? { contract: activeSemanticTask.contract }
        : {}),
    })
    const nextFingerprint = buildTaskFingerprint({
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
    if (activeFingerprint !== nextFingerprint) {
      await cancelTask(runtime, activeSemanticTask.id, {
        source: 'deferred',
        reason: 'superseded_by_newer_semantic_task',
      })
    } else if (activeSemanticTask.status === 'pending') {
      await logRunTaskDispatch({
        taskId: activeSemanticTask.id,
        mode: 'reuse_pending',
      })
      enqueueWorkerTask(runtime, activeSemanticTask)
      notifyWorkerLoop(runtime)
      return 'continue'
    } else return 'continue'
  }

  const { task, created } = enqueueTask(
    runtime.tasks,
    workerPrompt,
    parsed.data.title,
    target.cwd,
    profile,
    provider,
    undefined,
    focusId,
    target.repoKey,
    target.branch,
    contract,
  )
  if (!created) {
    if (task.status !== 'pending') return 'continue'
    await logRunTaskDispatch({ taskId: task.id, mode: 'reuse_pending' })
    enqueueWorkerTask(runtime, task)
    notifyWorkerLoop(runtime)
    return 'continue'
  }
  const slotStatus = resolveSlotStatus(runtime)
  await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
    createdAt: task.createdAt,
    slotStatus,
  })
  if (!parsed.data.provider && affinityProvider) {
    await bestEffort('appendLog: run_task_provider_affinity', () =>
      appendLog(runtime.paths.log, {
        event: 'run_task_provider_affinity',
        taskId: task.id,
        focusId,
        provider,
        source: 'focus_recent_task',
      }),
    )
  }
  await logRunTaskDispatch({ taskId: task.id, mode: 'created' })
  await persistRuntimeState(runtime)
  enqueueWorkerTask(runtime, task)
  notifyWorkerLoop(runtime)
  return 'continue'
}
