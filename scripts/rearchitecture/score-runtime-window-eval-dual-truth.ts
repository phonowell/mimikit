import { ratio } from './score-runtime-window-model.js'

import type { ScoreValue, TaskResultPacket } from './score-runtime-window-model.js'

export const evaluateDualTruthRate = (
  rawResults: TaskResultPacket[],
): ScoreValue => {
  const statusByTaskId = new Map<string, Set<TaskResultPacket['status']>>()
  for (const item of rawResults) {
    const set = statusByTaskId.get(item.taskId)
    if (set) {
      set.add(item.status)
      continue
    }
    statusByTaskId.set(item.taskId, new Set([item.status]))
  }
  const dualTruthCases = [...statusByTaskId.values()].filter(
    (set) => set.size > 1,
  ).length
  return ratio(dualTruthCases, statusByTaskId.size)
}
