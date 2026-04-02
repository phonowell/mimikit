import { supportsExplicitEnqueueContinuationAnchor } from './action-continuation-anchor.js'
import { supportsEnqueueContinuationIntentEvidence } from './action-intent-evidence-enqueue-continuation.js'
import {
  buildMissingIntentEvidenceHint,
  isSupportedByInputs,
} from './action-intent-evidence-match.js'
import {
  buildTaskContractFromDraft,
  resolveWorkerPromptFromDraft,
} from './task-contract.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence-source.js'
import type { Task, TaskPlan } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

export const validateEnqueueTaskIntentEvidence = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  inputTexts: string[]
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const contract = buildTaskContractFromDraft(params.item.task)
  const workerPrompt = resolveWorkerPromptFromDraft(params.item.task)
  if (!contract || !workerPrompt) return undefined

  const explicitContinuationSupport = supportsExplicitEnqueueContinuationAnchor(
    params.item,
    {
      ...(params.taskById ? { taskById: params.taskById } : {}),
      ...(params.planById ? { planById: params.planById } : {}),
      ...(params.resultTaskIds ? { resultTaskIds: params.resultTaskIds } : {}),
      ...(params.defaultFocusId
        ? { defaultFocusId: params.defaultFocusId }
        : {}),
    },
  )
  if (explicitContinuationSupport !== undefined) {
    if (explicitContinuationSupport) return undefined
    return buildMissingIntentEvidenceHint({
      actionName: params.item.type,
      evidenceSources: params.supplementalEvidenceSources,
    })
  }

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

  if (
    supportsEnqueueContinuationIntentEvidence({
      item: params.item,
      ...(params.taskById ? { taskById: params.taskById } : {}),
      ...(params.planById ? { planById: params.planById } : {}),
      ...(params.resultTaskIds ? { resultTaskIds: params.resultTaskIds } : {}),
      ...(params.defaultFocusId
        ? { defaultFocusId: params.defaultFocusId }
        : {}),
    })
  )
    return undefined

  return buildMissingIntentEvidenceHint({
    actionName: params.item.type,
    evidenceSources: params.supplementalEvidenceSources,
  })
}
