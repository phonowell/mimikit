import { truncateText } from '../../foundation/shared/text.js'
import { resolveTaskResultSummary } from '../../work/shared/task-state.js'

import type { FocusId, Task, TaskResult } from '../../foundation/types/index.js'

export const PREVIEW_MAX_CHARS = 140

export const summarizeLatestResult = (
  tasks: Task[],
  results: TaskResult[],
):
  | {
      taskId: string
      status: TaskResult['status']
      focusId?: FocusId
      summary?: string
      stopReason?: string
      archivePath?: string
    }
  | undefined => {
  const latest = results[0]
  if (!latest) return undefined
  const task = tasks.find((item) => item.id === latest.taskId)
  const summarySource = resolveTaskResultSummary({
    result: latest,
    ...(task ? { task } : {}),
    maxChars: PREVIEW_MAX_CHARS,
  })
  return {
    taskId: latest.taskId,
    status: latest.status,
    ...(task?.focusId ? { focusId: task.focusId } : {}),
    ...(summarySource
      ? {
          summary: truncateText(summarySource, PREVIEW_MAX_CHARS, {
            normalizeWhitespace: true,
            suffix: '…',
          }),
        }
      : {}),
    ...(latest.stopReason ? { stopReason: latest.stopReason } : {}),
    ...(latest.archivePath ? { archivePath: latest.archivePath } : {}),
  }
}
