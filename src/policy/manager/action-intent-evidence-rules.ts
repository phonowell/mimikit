import { basename } from 'node:path'

import {
  buildMissingIntentEvidenceHint,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'
import { supportsReplacementCancelIntentEvidence } from './action-intent-evidence-replacement-cancel.js'
import {
  buildTaskContractFromDraft,
  resolveWorkerPromptFromDraft,
} from './task-contract.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence.js'
import type { Task } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const resolveTaskRef = (task: Task | undefined, taskId: string): string =>
  task?.title.trim() ? `${taskId} / ${task.title.trim()}` : taskId

export const validateEnqueueTaskIntentEvidence = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  inputTexts: string[]
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const contract = buildTaskContractFromDraft(params.item.task)
  const workerPrompt = resolveWorkerPromptFromDraft(params.item.task)
  if (!contract || !workerPrompt) return undefined

  const candidates = [params.item.task.title, contract.goal, contract.scope]
  const combinedCandidate = [
    params.item.task.title,
    contract.goal,
    contract.scope,
    ...contract.acceptance,
    ...(contract.outOfScope ? [contract.outOfScope] : []),
  ].join('\n')
  if (
    isSupportedByInputs({
      candidates,
      combinedCandidate,
      inputs: params.inputTexts,
    })
  )
    return undefined

  return buildMissingIntentEvidenceHint({
    actionName: params.item.type,
    evidenceSources: params.supplementalEvidenceSources,
  })
}

export const validateTaskControlIntentEvidence = (params: {
  item: Extract<Parsed, { type: 'task_control' }>
  inputTexts: string[]
  stateDir?: string
  taskById?: Map<string, Task>
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
  currentActions?: Parsed[]
  defaultFocusId?: string
}): string | undefined => {
  const task = params.taskById?.get(params.item.task_id)
  const instructions = params.item.instructions ?? []
  const candidates = [params.item.task_id]
  if (task?.title.trim()) candidates.push(task.title)
  if (task?.branch?.trim()) candidates.push(task.branch)
  const cwdBase = task?.cwd.trim() ? basename(task.cwd.trim()) : ''
  if (cwdBase) candidates.push(cwdBase)

  if (
    params.item.action === 'resume' &&
    instructions.length > 0 &&
    !isSupportedByInputs({
      candidates: instructions,
      combinedCandidate: instructions.join('\n'),
      inputs: params.inputTexts,
    })
  ) {
    return buildMissingIntentEvidenceHint({
      actionName: params.item.type,
      evidenceSources: params.supplementalEvidenceSources,
      taskRef: resolveTaskRef(task, params.item.task_id),
    })
  }

  if (isSupportedByInputs({ candidates, inputs: params.inputTexts }))
    return undefined

  if (
    supportsReplacementCancelIntentEvidence({
      item: params.item,
      actions: params.currentActions,
      task,
      tasks: params.taskById?.values() ?? [],
      inputTexts: params.inputTexts,
      ...(params.stateDir ? { stateDir: params.stateDir } : {}),
      defaultFocusId: params.defaultFocusId,
    })
  )
    return undefined

  return buildMissingIntentEvidenceHint({
    actionName: params.item.type,
    evidenceSources: params.supplementalEvidenceSources,
    taskRef: resolveTaskRef(task, params.item.task_id),
  })
}

export const validateSetPlanIntentEvidence = (params: {
  item: Extract<Parsed, { type: 'set_plan' }>
  inputTexts: string[]
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const { task } = params.item.plan
  const candidates = [
    params.item.plan.title,
    task.title,
    task.goal,
    ...task.in_scope,
  ]
  const combinedCandidate = [
    params.item.plan.title,
    task.title,
    task.goal,
    ...task.in_scope,
    ...task.done_when,
  ].join('\n')
  if (
    isSupportedByInputs({
      candidates,
      combinedCandidate,
      inputs: params.inputTexts,
    })
  )
    return undefined
  return buildMissingIntentEvidenceHint({
    actionName: params.item.type,
    evidenceSources: params.supplementalEvidenceSources,
  })
}
