import { normalizeChatUsage } from '../shared/utils.js'

import {
  type ChatUsage,
  extractChatText,
  formatLlmError,
  normalizeBaseUrl,
  requestJson,
} from './http-client.js'
import { loadCodexSettings, resolveOpenAiModel } from './openai.js'
import { HARDCODED_MODEL_REASONING_EFFORT } from './reasoning-effort.js'

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
  const baseUrl =
    settings.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com'
  const apiKey = settings.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey && settings.requiresOpenAiAuth !== false) {
    throw new Error(
      '[llm] OPENAI_API_KEY is missing. Set env or add ~/.codex/auth.json.',
    )
  }

  const controller = params.timeoutMs > 0 ? new AbortController() : null
  const timer =
    controller && params.timeoutMs > 0
      ? setTimeout(() => controller.abort(), params.timeoutMs)
      : null
  const startedAt = Date.now()
  const apiBase = normalizeBaseUrl(baseUrl)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const modelReasoningEffort =
    params.modelReasoningEffort ?? HARDCODED_MODEL_REASONING_EFFORT

  try {
    const response = await requestJson(
      `${apiBase}/chat/completions`,
      {
        model,
        model_reasoning_effort: modelReasoningEffort,
        ...(params.seed !== undefined ? { seed: params.seed } : {}),
        ...(params.temperature !== undefined
          ? { temperature: params.temperature }
          : {}),
        messages: [{ role: 'user', content: params.prompt }],
      },
      headers,
      controller,
    )
    const output = extractChatText(response)
    const usage = normalizeChatUsage((response as { usage?: ChatUsage }).usage)
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    return { output, elapsedMs, ...(usage ? { usage } : {}) }
  } catch (err) {
    throw new Error(formatLlmError('[llm] OpenAI request', err), { cause: err })
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const runManagerApi = runApiRunner
