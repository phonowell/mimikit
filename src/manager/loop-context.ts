import { selectRecentHistory } from '../orchestrator/read-model/history-select.js'
import { selectRecentTasks } from '../orchestrator/read-model/task-select.js'
import { readHistory } from '../storage/jsonl.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export const buildManagerContext = async (runtime: RuntimeState) => {
  const history = await readHistory(runtime.paths.history)
  const { selected: recentHistory } = selectRecentHistory(history, {
    minCount: runtime.config.manager.historyMinCount,
    maxCount: runtime.config.manager.historyMaxCount,
    maxBytes: runtime.config.manager.historyMaxBytes,
  })
  const recentTasks = selectRecentTasks(runtime.tasks, {
    minCount: runtime.config.manager.tasksMinCount,
    maxCount: runtime.config.manager.tasksMaxCount,
    maxBytes: runtime.config.manager.tasksMaxBytes,
  })

  return { recentHistory, recentTasks }
}
