import { normalizeChatUsage } from '../shared/utils.js'

import { formatLlmError } from './openai-chat-errors.js'

import type { TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type ChatRunResult = {
  output: string
  usage?: TokenUsage
  elapsedMs: number
}

type RunChatCompletionParams = {
  prompt: string
  model: string
  baseUrl: string
  timeoutMs: number
  errorPrefix: string
  apiKey?: string
  modelReasoningEffort?: ModelReasoningEffort
  seed?: number
  temperature?: number
}

const normalizeBaseUrl = (value: string): string => {
  const trimmed = value.replace(/\/+$/, '')
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}

const extractChatText = (response: Record<string, unknown>): string => {
  const { choices } = response
  if (!Array.isArray(choices)) return ''
  const texts: string[] = []
  for (const choice of choices) {
    if (!choice || typeof choice !== 'object') continue
    const { message } = choice as { message?: unknown }
    if (!message || typeof message !== 'object') continue
    const { content } = message as { content?: unknown }
    if (typeof content === 'string') texts.push(content)
  }
  return texts.join('\n').trim()
}

const requestJson = async (
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> => {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {}),
  })
  const body = await response.text()
  if (!response.ok) {
    const snippet = body.length > 500 ? `${body.slice(0, 500)}...` : body
    throw new Error(`HTTP ${response.status}: ${snippet}`)
  }
  if (!body) return {}
  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch {
    throw new Error(`invalid_json: ${body.slice(0, 200)}`)
  }
}

const withTimeout = async <T>(
  timeoutMs: number,
  run: (signal?: AbortSignal) => Promise<T>,
): Promise<T> => {
  if (timeoutMs <= 0) return run()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

export const runChatCompletion = async (
  params: RunChatCompletionParams,
): Promise<ChatRunResult> => {
  const startedAt = Date.now()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (params.apiKey) headers.Authorization = `Bearer ${params.apiKey}`
  try {
    const response = await withTimeout(params.timeoutMs, (signal) =>
      requestJson(
        `${normalizeBaseUrl(params.baseUrl)}/chat/completions`,
        {
          model: params.model,
          ...(params.modelReasoningEffort
            ? { model_reasoning_effort: params.modelReasoningEffort }
            : {}),
          ...(params.seed !== undefined ? { seed: params.seed } : {}),
          ...(params.temperature !== undefined
            ? { temperature: params.temperature }
            : {}),
          messages: [{ role: 'user', content: params.prompt }],
        },
        headers,
        signal,
      ),
    )
    const usage = normalizeChatUsage(
      (response as { usage?: unknown }).usage as {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      },
    )
    return {
      output: extractChatText(response),
      elapsedMs: Math.max(0, Date.now() - startedAt),
      ...(usage ? { usage } : {}),
    }
  } catch (error) {
    throw new Error(formatLlmError(params.errorPrefix, error), { cause: error })
  }
}
