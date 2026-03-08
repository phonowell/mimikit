import { isEvidenceValid } from './score-runtime-window-data.js'

import type { TaskResultPacket } from './score-runtime-window-model.js'

export const evaluateEvidenceScore = (params: {
  results: TaskResultPacket[]
  mismatchTaskIds: Set<string>
}): { evidenceTaskIds: Set<string>; evidencePassed: number } => {
  const evidenceResults = params.results.filter((item) => Boolean(item.evidence))
  const evidenceTaskIds = new Set(evidenceResults.map((item) => item.taskId))
  const evidencePassed = evidenceResults.filter(
    (item) => isEvidenceValid(item) && !params.mismatchTaskIds.has(item.taskId),
  ).length
  return { evidenceTaskIds, evidencePassed }
}
