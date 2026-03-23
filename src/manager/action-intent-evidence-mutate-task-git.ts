import { formatMutateTaskIntentEvidenceHint } from './action-evidence-hints.js'
import { isSupportedByInputs } from './action-intent-evidence-match.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence.js'
import type { Task } from '../types/index.js'

type MutateTaskGitOp = 'review_passed' | 'merged' | 'cleaned'

const formatEvidenceSources = (
  sources: Set<SupplementalEvidenceSource> | undefined,
): string => {
  const labels = [...(sources ?? [])]
  return labels.length > 0 ? labels.join(' / ') : '当前输入'
}

const resolveTaskRef = (task: Task | undefined, taskId: string): string => {
  const title = task?.title.trim()
  if (title) return `${taskId} / ${title}`
  return taskId
}

const resolveGitOpLabel = (op: MutateTaskGitOp): string => {
  if (op === 'review_passed') return 'review passed'
  if (op === 'merged') return 'merged'
  return 'cleaned'
}

export const isMutateTaskGitOp = (op: string): op is MutateTaskGitOp =>
  op === 'review_passed' || op === 'merged' || op === 'cleaned'

export const validateMutateTaskGitIntentEvidence = (params: {
  op: MutateTaskGitOp
  reason?: string | undefined
  task: Task | undefined
  taskId: string
  inputTexts: string[]
  supplementalEvidenceSources?: Set<SupplementalEvidenceSource>
}): string | undefined => {
  const reason = params.reason?.trim()
  if (!reason) {
    return formatMutateTaskIntentEvidenceHint({
      evidenceSources: formatEvidenceSources(
        params.supplementalEvidenceSources,
      ),
      taskRef: resolveTaskRef(params.task, params.taskId),
      requiredAction: resolveGitOpLabel(params.op),
    })
  }
  if (
    isSupportedByInputs({
      candidates: [reason],
      combinedCandidate: reason,
      inputs: params.inputTexts,
    })
  )
    return undefined
  return formatMutateTaskIntentEvidenceHint({
    evidenceSources: formatEvidenceSources(params.supplementalEvidenceSources),
    taskRef: resolveTaskRef(params.task, params.taskId),
    requiredAction: resolveGitOpLabel(params.op),
  })
}
