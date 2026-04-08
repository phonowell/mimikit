import { basename } from 'node:path'

import {
  buildMissingIntentEvidenceHint,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'
import { supportsReplacementCancelIntentEvidence } from './action-intent-evidence-replacement-cancel.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence-source.js'
import type { Task } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const resolveTaskRef = (task: Task | undefined, taskId: string): string =>
  task?.title.trim() ? `${taskId} / ${task.title.trim()}` : taskId

const supportsUniquePausedResumeTarget = (params: {
  item: Extract<Parsed, { type: 'task_control' }>
  task: Task | undefined
  taskById?: Map<string, Task>
  defaultFocusId?: string
}): boolean => {
  if (params.item.action !== 'resume') return false
  if (!params.task || !params.taskById) return false
  if (params.task.status !== 'paused') return false
  const focusId = params.defaultFocusId?.trim()
  if (!focusId || params.task.focusId.trim() !== focusId) return false
  const pausedTasksInFocus = [...params.taskById.values()].filter(
    (candidate) =>
      candidate.status === 'paused' && candidate.focusId.trim() === focusId,
  )
  return (
    pausedTasksInFocus.length === 1 &&
    pausedTasksInFocus[0]?.id === params.task.id
  )
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
    supportsUniquePausedResumeTarget({
      item: params.item,
      task,
      ...(params.taskById ? { taskById: params.taskById } : {}),
      ...(params.defaultFocusId
        ? { defaultFocusId: params.defaultFocusId }
        : {}),
    })
  )
    return undefined

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
