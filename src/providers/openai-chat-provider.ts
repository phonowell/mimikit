import { runChatCompletion } from './openai-chat-client.js'
import {
  HARDCODED_MODEL_REASONING_EFFORT,
  loadCodexSettings,
  resolveOpenAiModel,
} from './openai-settings.js'

import type {
  OpenAiChatProviderRequest,
  Provider,
  ProviderResult,
} from './types.js'

const OPENAI_BASE_URL = 'https://api.openai.com'

const runOpenAiChat = async (
  request: OpenAiChatProviderRequest,
): Promise<ProviderResult> => {
  const settings = await loadCodexSettings()
  const model = await resolveOpenAiModel(request.model, settings)
  const baseUrl = settings.baseUrl ?? OPENAI_BASE_URL
  const apiKey = settings.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey && settings.requiresOpenAiAuth !== false) {
    throw new Error(
      '[provider:openai-chat] OPENAI_API_KEY is missing. Set env or add ~/.codex/auth.json.',
    )
  }
  const modelReasoningEffort =
    request.modelReasoningEffort ?? HARDCODED_MODEL_REASONING_EFFORT
  const result = await runChatCompletion({
    prompt: request.prompt,
    model,
    baseUrl,
    timeoutMs: request.timeoutMs,
    errorPrefix: '[provider:openai-chat] OpenAI request',
    ...(apiKey ? { apiKey } : {}),
    modelReasoningEffort,
    ...(request.seed !== undefined ? { seed: request.seed } : {}),
    ...(request.temperature !== undefined
      ? { temperature: request.temperature }
      : {}),
    ...(request.onTextDelta ? { onTextDelta: request.onTextDelta } : {}),
  })
  return {
    output: result.output,
    elapsedMs: result.elapsedMs,
    ...(result.usage ? { usage: result.usage } : {}),
  }
}

export const openAiChatProvider: Provider<OpenAiChatProviderRequest> = {
  id: 'openai-chat',
  run: runOpenAiChat,
}
