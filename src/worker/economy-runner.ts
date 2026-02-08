import { runApiRunner } from '../llm/api-runner.js'

import type { TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export const runEconomyWorker = async (params: {
  prompt: string
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
}): Promise<{ output: string; elapsedMs: number; usage?: TokenUsage }> => {
  const response = await runApiRunner({
    prompt: params.prompt,
    timeoutMs: params.timeoutMs,
    ...(params.model ? { model: params.model } : {}),
    ...(params.modelReasoningEffort
      ? { modelReasoningEffort: params.modelReasoningEffort }
      : {}),
  })
  return {
    output: response.output,
    elapsedMs: response.elapsedMs,
    ...(response.usage ? { usage: response.usage } : {}),
  }
}
