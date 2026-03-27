import { nowIso } from '../../foundation/shared/utils.js'

import { stripWorkerProtocolTags } from './profiled-runner-prompt.js'
import { buildTaskResultHandoff } from './result-handoff.js'
import { buildDefaultTaskResultState } from './result-state.js'

import type {
  Task,
  TaskResult,
  TokenUsage,
} from '../../foundation/types/index.js'

export const buildResult = (
  task: Task,
  status: TaskResult['status'],
  output: string,
  durationMs: number,
  usage?: TokenUsage,
  traceRef?: string,
): TaskResult => {
  const cleanedOutput = stripWorkerProtocolTags(output)
  const handoff = buildTaskResultHandoff(task, { status, output })
  const state = buildDefaultTaskResultState(status)
  return {
    taskId: task.id,
    status,
    ok: status === 'succeeded',
    output: cleanedOutput,
    durationMs,
    completedAt: nowIso(),
    ...state,
    ...(usage ? { usage } : {}),
    ...(traceRef ? { traceRef } : {}),
    ...(task.title ? { title: task.title } : {}),
    profile: task.profile,
    provider: task.provider,
    ...(status === 'canceled'
      ? { cancel: task.cancel ?? { source: 'system' } }
      : {}),
    ...(handoff ? { handoff } : {}),
  }
}
