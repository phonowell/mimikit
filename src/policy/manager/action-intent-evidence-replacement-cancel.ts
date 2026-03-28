import { scoreTextOverlap } from '../../foundation/shared/text-search.js'
import {
  buildTaskFingerprint,
  isActiveTask,
} from '../../work/orchestrator/task-state.js'

import { isSupportedByInputs } from './action-intent-evidence-match.js'
import {
  buildTaskContractFromDraft,
  resolveWorkerPromptFromDraft,
} from './task-contract.js'

import type { Task } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const resolveReplacementEnqueueAction = (params: {
  item: Extract<Parsed, { type: 'task_control' }>
  actions: Parsed[]
}): Extract<Parsed, { type: 'enqueue_task' }> | undefined => {
  let cancelCount = 0
  let currentIsOnlyCancel = false
  let enqueueAction: Extract<Parsed, { type: 'enqueue_task' }> | undefined

  for (const action of params.actions) {
    if (action.type === 'task_control') {
      if (action.action === 'cancel') {
        cancelCount += 1
        if (action === params.item) currentIsOnlyCancel = true
      }
      continue
    }
    if (action.type !== 'enqueue_task') continue
    if (enqueueAction) return undefined
    enqueueAction = action
  }

  if (!currentIsOnlyCancel || cancelCount !== 1) return undefined
  return enqueueAction
}

const supportsReplacementTask = (params: {
  enqueueAction: Extract<Parsed, { type: 'enqueue_task' }>
  inputTexts: string[]
  stateDir?: string
}): boolean => {
  const contract = buildTaskContractFromDraft(params.enqueueAction.task)
  const workerPrompt = resolveWorkerPromptFromDraft(params.enqueueAction.task, {
    ...(params.stateDir ? { stateDir: params.stateDir } : {}),
  })
  if (!contract || !workerPrompt) return false
  return isSupportedByInputs({
    candidates: [
      params.enqueueAction.task.title,
      contract.goal,
      contract.scope,
      ...params.enqueueAction.task.in_scope,
    ],
    combinedCandidate: [
      params.enqueueAction.task.title,
      contract.goal,
      contract.scope,
      ...contract.acceptance,
      ...(contract.outOfScope ? [contract.outOfScope] : []),
    ].join('\n'),
    inputs: params.inputTexts,
  })
}

const matchesReplacementTask = (params: {
  task: Task
  enqueueAction: Extract<Parsed, { type: 'enqueue_task' }>
}): boolean => {
  const contract = buildTaskContractFromDraft(params.enqueueAction.task)
  if (!contract) return false
  const taskSemanticText =
    typeof (params.task as { semanticKey?: unknown }).semanticKey === 'string'
      ? params.task.semanticKey
      : params.task.title
  const currentTaskText = [params.task.title, taskSemanticText]
    .filter((item) => item.trim().length > 0)
    .join('\n')
  const replacementText = [
    params.enqueueAction.task.title,
    contract.goal,
    contract.scope,
    ...contract.acceptance,
    ...(contract.outOfScope ? [contract.outOfScope] : []),
  ].join('\n')
  return scoreTextOverlap(currentTaskText, replacementText) >= 0.35
}

export const supportsReplacementCancelIntentEvidence = (params: {
  item: Extract<Parsed, { type: 'task_control' }>
  actions: Parsed[] | undefined
  task: Task | undefined
  tasks: Iterable<Task>
  inputTexts: string[]
  stateDir?: string
  defaultFocusId: string | undefined
}): boolean => {
  if (
    params.item.action !== 'cancel' ||
    !params.task ||
    !params.actions ||
    params.inputTexts.length === 0
  )
    return false

  const enqueueAction = resolveReplacementEnqueueAction({
    item: params.item,
    actions: params.actions,
  })
  if (!enqueueAction) return false
  if (
    !supportsReplacementTask({
      enqueueAction,
      inputTexts: params.inputTexts,
      ...(params.stateDir ? { stateDir: params.stateDir } : {}),
    })
  )
    return false
  if (!matchesReplacementTask({ task: params.task, enqueueAction }))
    return false

  const replacementFocusId = params.defaultFocusId?.trim() ?? ''
  if (!replacementFocusId) return false
  if (params.task.focusId.trim() !== replacementFocusId) return false
  if (params.task.cwd.trim() !== enqueueAction.task.cwd.trim()) return false

  const activeTasks = [...params.tasks].filter(
    (task) =>
      isActiveTask(task) &&
      task.focusId.trim() === replacementFocusId &&
      task.cwd.trim() === enqueueAction.task.cwd.trim(),
  )
  if (activeTasks.length !== 1 || activeTasks[0]?.id !== params.task.id)
    return false

  const contract = buildTaskContractFromDraft(enqueueAction.task)
  const workerPrompt = resolveWorkerPromptFromDraft(enqueueAction.task, {
    ...(params.stateDir ? { stateDir: params.stateDir } : {}),
  })
  if (!contract || !workerPrompt) return false
  const replacementFingerprint = buildTaskFingerprint({
    prompt: workerPrompt,
    title: enqueueAction.task.title,
    cwd: enqueueAction.task.cwd,
    profile: params.task.profile,
    provider: params.task.provider,
    focusId: replacementFocusId,
    ...(params.task.repoKey ? { repoKey: params.task.repoKey } : {}),
    contract,
  })
  if (replacementFingerprint === params.task.fingerprint) return false

  return true
}
