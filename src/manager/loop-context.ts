import { bestEffort } from '../log/safe.js'
import {
  appendCompactedSummary,
  buildCompactedSummary,
  formatCompactedContext,
  readCompactedSummaries,
} from '../orchestrator/read-model/history-compaction.js'
import { selectRecentHistory } from '../orchestrator/read-model/history-select.js'
import { selectRecentTasks } from '../orchestrator/read-model/task-select.js'
import { readHistory } from '../storage/jsonl.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export const buildManagerContext = async (runtime: RuntimeState) => {
  const history = await readHistory(runtime.paths.history)
  const { selected: recentHistory, truncated: truncatedHistory } =
    selectRecentHistory(history, {
      minCount: runtime.config.manager.historyMinCount,
      maxCount: runtime.config.manager.historyMaxCount,
      maxBytes: runtime.config.manager.historyMaxBytes,
    })

  if (truncatedHistory.length > 0) {
    const compacted = buildCompactedSummary(truncatedHistory)
    if (compacted) {
      await bestEffort('appendCompactedSummary', () =>
        appendCompactedSummary(runtime.paths.historyCompacted, compacted),
      )
    }
  }

  const compactedSummaries = await readCompactedSummaries(
    runtime.paths.historyCompacted,
  )
  const compactedContext = formatCompactedContext(compactedSummaries)
  const recentTasks = selectRecentTasks(runtime.tasks, {
    minCount: runtime.config.manager.tasksMinCount,
    maxCount: runtime.config.manager.tasksMaxCount,
    maxBytes: runtime.config.manager.tasksMaxBytes,
  })

  return { recentHistory, recentTasks, compactedContext }
}
