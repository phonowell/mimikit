import { parseIsoToMsOrZero } from '../../foundation/shared/time.js'

import type { TaskResult, UserInput } from '../../foundation/types/index.js'

export const sortInputsNewestFirst = (inputs: UserInput[]): UserInput[] =>
  [...inputs].sort((a, b) => {
    const diff =
      parseIsoToMsOrZero(b.createdAt) - parseIsoToMsOrZero(a.createdAt)
    if (diff !== 0) return diff
    return b.id.localeCompare(a.id)
  })

export const sortResultsNewestFirst = (results: TaskResult[]): TaskResult[] =>
  [...results].sort((a, b) => {
    const diff =
      parseIsoToMsOrZero(b.completedAt) - parseIsoToMsOrZero(a.completedAt)
    if (diff !== 0) return diff
    return b.taskId.localeCompare(a.taskId)
  })
