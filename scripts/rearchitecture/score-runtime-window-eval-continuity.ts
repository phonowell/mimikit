import { ratio } from './score-runtime-window-model.js'

import type { ScoreValue, TaskResultPacket } from './score-runtime-window-model.js'

export const evaluateContinuityRate = (
  results: TaskResultPacket[],
): ScoreValue => {
  const continuityByGoal = new Map<string, TaskResultPacket[]>()
  for (const item of results) {
    const goal = item.evidence?.contractGoal?.trim()
    if (!goal) continue
    const bucket = continuityByGoal.get(goal)
    if (bucket) bucket.push(item)
    else continuityByGoal.set(goal, [item])
  }
  let continuityTotal = 0
  let continuityMatched = 0
  for (const bucket of continuityByGoal.values()) {
    if (bucket.length < 2) continue
    const sorted = [...bucket].sort((a, b) => a.completedAt.localeCompare(b.completedAt))
    for (let index = 1; index < sorted.length; index += 1) {
      const prev = sorted[index - 1]
      const next = sorted[index]
      if (!prev || !next) continue
      continuityTotal += 1
      const prevChecks = prev.evidence?.acceptanceChecks ?? []
      const nextChecks = next.evidence?.acceptanceChecks ?? []
      if (prevChecks.length === nextChecks.length && nextChecks.length > 0)
        continuityMatched += 1
    }
  }
  return ratio(continuityMatched, continuityTotal)
}
