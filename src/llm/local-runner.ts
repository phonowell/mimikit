import { normalizeChatUsage } from '../shared/utils.js'

import {
  type ChatUsage,
  extractChatText,
  formatLlmError,
  normalizeBaseUrl,
  requestJson,
} from './http-client.js'

import type { TokenUsage } from '../types/index.js'

type RunResult = {
  output: string
  usage?: TokenUsage
  elapsedMs: number
}

export const runLocalRunner = async (params: {
  prompt: string
  model: string
  baseUrl: string
  timeoutMs: number
}): Promise<RunResult> => {
  const controller = params.timeoutMs > 0 ? new AbortController() : null
  const timer =
    controller && params.timeoutMs > 0
      ? setTimeout(() => controller.abort(), params.timeoutMs)
      : null
  const startedAt = Date.now()
  const apiBase = normalizeBaseUrl(params.baseUrl)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  try {
    const response = await requestJson(
      `${apiBase}/chat/completions`,
      {
        model: params.model,
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
    throw new Error(formatLlmError('[llm] Local request', err), { cause: err })
  } finally {
    if (timer) clearTimeout(timer)
  }
}
