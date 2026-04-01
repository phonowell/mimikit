import { nowIso } from '../../foundation/shared/utils.js'

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
  handoff?: TaskResult['handoff'],
  diagnostics?: {
    providerCallId?: string
    attempt?: number
  },
): TaskResult => {
  const nextHandoff = buildTaskResultHandoff(task, { status, output }, handoff)
  const state = buildDefaultTaskResultState(status)
  return {
    taskId: task.id,
    status,
    ok: status === 'succeeded',
    output,
    durationMs,
    completedAt: nowIso(),
    ...state,
    ...(usage ? { usage } : {}),
    ...(traceRef ? { traceRef } : {}),
    ...(diagnostics?.providerCallId
      ? { providerCallId: diagnostics.providerCallId }
      : {}),
    ...(typeof diagnostics?.attempt === 'number'
      ? { attempt: diagnostics.attempt }
      : {}),
    ...(task.title ? { title: task.title } : {}),
    profile: task.profile,
    provider: task.provider,
    ...(status === 'canceled'
      ? { cancel: task.cancel ?? { source: 'system' } }
      : {}),
    ...(nextHandoff ? { handoff: nextHandoff } : {}),
  }
}
