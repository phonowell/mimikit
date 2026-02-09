import { runChatCompletion } from './chat-completion.js'
import {
  HARDCODED_MODEL_REASONING_EFFORT,
  loadCodexSettings,
  resolveOpenAiModel,
} from './openai.js'

import type { TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type RunResult = {
  output: string
  usage?: TokenUsage
  elapsedMs: number
}

export const runApiRunner = async (params: {
  prompt: string
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  seed?: number
  temperature?: number
  timeoutMs: number
}): Promise<RunResult> => {
  const settings = await loadCodexSettings()
  const model = await resolveOpenAiModel(params.model)
  const baseUrl = settings.baseUrl ?? 'https://api.openai.com'
  const apiKey = settings.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey && settings.requiresOpenAiAuth !== false) {
    throw new Error(
      '[llm] OPENAI_API_KEY is missing. Set env or add ~/.codex/auth.json.',
    )
  }
  const modelReasoningEffort =
    params.modelReasoningEffort ?? HARDCODED_MODEL_REASONING_EFFORT
  return runChatCompletion({
    prompt: params.prompt,
    model,
    baseUrl,
    timeoutMs: params.timeoutMs,
    errorPrefix: '[llm] OpenAI request',
    ...(apiKey ? { apiKey } : {}),
    modelReasoningEffort,
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
    ...(params.temperature !== undefined
      ? { temperature: params.temperature }
      : {}),
  })
}
