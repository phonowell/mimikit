import { buildTaskFingerprint, isActiveTask } from '../../work/orchestrator/task-state.js'

import { mutateTaskSchema, runTaskSchema } from './action-apply-schema.js'
import { isSupportedByInputs } from './action-intent-evidence-match.js'
import { parseActionAttrs } from './action-parse.js'
import {
  buildTaskContractFromAttrs,
  resolveWorkerPromptFromAttrs,
} from './task-contract.js'

import type { Task } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const resolveReplacementEnqueueAction = (params: {
  item: Parsed
  actions: Parsed[]
}): Parsed | undefined => {
  let cancelCount = 0
  let currentIsOnlyCancel = false
  let enqueueAction: Parsed | undefined

  for (const action of params.actions) {
    if (action.name === 'mutate_task') {
      const parsedMutate = parseActionAttrs(action, mutateTaskSchema)
      if (parsedMutate?.op === 'cancel') {
        cancelCount += 1
        if (action === params.item) currentIsOnlyCancel = true
      }
      continue
    }
    if (action.name !== 'enqueue_task') continue
    if (!parseActionAttrs(action, runTaskSchema)) return undefined
    if (enqueueAction) return undefined
    enqueueAction = action
  }

  if (!currentIsOnlyCancel || cancelCount !== 1) return undefined
  return enqueueAction
}

const supportsReplacementTask = (params: {
  enqueueAction: Parsed
  inputTexts: string[]
}): boolean => {
  const parsedRunTask = parseActionAttrs(params.enqueueAction, runTaskSchema)
  if (!parsedRunTask) return false
  const contract = buildTaskContractFromAttrs(parsedRunTask)
  const workerPrompt = resolveWorkerPromptFromAttrs(parsedRunTask)
  if (!contract || !workerPrompt) return false
  return isSupportedByInputs({
    candidates: [parsedRunTask.title, contract.goal, contract.scope],
    combinedCandidate: [
      parsedRunTask.title,
      contract.goal,
      contract.scope,
      ...contract.acceptance,
      ...(contract.outOfScope ? [contract.outOfScope] : []),
    ].join('\n'),
    inputs: params.inputTexts,
  })
}

export const supportsReplacementCancelIntentEvidence = (params: {
  item: Parsed
  actions: Parsed[] | undefined
  task: Task | undefined
  tasks: Iterable<Task>
  inputTexts: string[]
  defaultFocusId?: string
}): boolean => {
  if (!params.task || !params.actions || params.inputTexts.length === 0)
    return false

  const enqueueAction = resolveReplacementEnqueueAction({
    item: params.item,
    actions: params.actions,
  })
  if (!enqueueAction) return false
  if (!supportsReplacementTask({ enqueueAction, inputTexts: params.inputTexts }))
    return false

  const parsedRunTask = parseActionAttrs(enqueueAction, runTaskSchema)
  if (!parsedRunTask) return false
  const replacementFocusId =
    parsedRunTask.focus_id?.trim() || params.defaultFocusId?.trim() || ''
  if (!replacementFocusId) return false
  if (params.task.focusId.trim() !== replacementFocusId) return false
  if (params.task.cwd.trim() !== parsedRunTask.cwd.trim()) return false

  const activeTasks = [...params.tasks].filter(
    (task) =>
      isActiveTask(task) &&
      task.focusId.trim() === replacementFocusId &&
      task.cwd.trim() === parsedRunTask.cwd.trim(),
  )
  if (activeTasks.length !== 1 || activeTasks[0]?.id !== params.task.id)
    return false

  const contract = buildTaskContractFromAttrs(parsedRunTask)
  const workerPrompt = resolveWorkerPromptFromAttrs(parsedRunTask)
  if (!contract || !workerPrompt) return false
  const replacementFingerprint = buildTaskFingerprint({
    prompt: workerPrompt,
    title: parsedRunTask.title,
    cwd: parsedRunTask.cwd,
    profile: params.task.profile,
    provider: params.task.provider,
    focusId: replacementFocusId,
    ...(params.task.repoKey ? { repoKey: params.task.repoKey } : {}),
    ...(parsedRunTask.branch
      ? { branch: parsedRunTask.branch }
      : params.task.branch
        ? { branch: params.task.branch }
        : {}),
    contract,
  })
  if (replacementFingerprint === params.task.fingerprint) return false

  return true
}
