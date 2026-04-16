import { appendManagerReply } from './loop-batch-flow.js'
import { buildFallbackReply } from './loop-helpers.js'
import { normalizeManagerReplyText } from './reply-normalize.js'

import type {
  TaskResult,
  TokenUsage,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const shouldSuppressEmptyTriggerWakeReply = (params: {
  agentInputs: UserInput[]
  results: TaskResult[]
  normalizedReplyText: string
}): boolean => {
  if (params.normalizedReplyText) return false
  if (params.results.length > 0) return false
  if (params.agentInputs.length === 0) return false
  return params.agentInputs.every(
    (input) =>
      input.role === 'system' &&
      (input.systemEventName === 'worker_slot_freed' ||
        input.systemEventName === 'trigger_fire'),
  )
}

export const appendManagerBatchReply = async (params: {
  runtime: ManagerRuntime
  agentInputs: UserInput[]
  results: TaskResult[]
  normalizedReplyText: string
  nextInputsCursor: number
  usage?: TokenUsage
  elapsedMs?: number
}): Promise<boolean> => {
  if (
    shouldSuppressEmptyTriggerWakeReply({
      agentInputs: params.agentInputs,
      results: params.results,
      normalizedReplyText: params.normalizedReplyText,
    })
  )
    return false

  const fallback = params.normalizedReplyText
    ? undefined
    : await buildFallbackReply({
        results: params.results,
        tasks: params.runtime.domain.tasks,
        workDir: params.runtime.config.workDir,
      })
  const responseText =
    params.normalizedReplyText ||
    normalizeManagerReplyText(fallback?.text ?? '')
  await appendManagerReply({
    runtime: params.runtime,
    text: responseText,
    nextInputsCursor: params.nextInputsCursor,
    ...(fallback?.artifacts ? { artifacts: fallback.artifacts } : {}),
    ...(params.usage ? { usage: params.usage } : {}),
    ...(params.elapsedMs !== undefined && params.elapsedMs >= 0
      ? { elapsedMs: params.elapsedMs }
      : {}),
  })
  return true
}
