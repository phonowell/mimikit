import { normalizeChatUsage } from '../shared/utils.js'

import type { TokenUsage } from '../types/common.js'

type RunResult = {
  output: string
  usage?: TokenUsage
  elapsedMs: number
}

type ChatUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

const extractChatText = (response: unknown): string => {
  if (response && typeof response === 'object') {
    const { choices } = response as { choices?: unknown }
    if (Array.isArray(choices)) {
      const texts: string[] = []
      for (const choice of choices) {
        if (!choice || typeof choice !== 'object') continue
        const { message } = choice as { message?: unknown }
        if (message && typeof message === 'object') {
          const { content } = message as { content?: unknown }
          if (typeof content === 'string') texts.push(content)
        }
      }
      return texts.join('\n').trim()
    }
  }
  return ''
}

const formatLocalError = (err: unknown): string => {
  if (!err) return '[llm] Local request failed'
  if (err instanceof Error) {
    const anyErr = err as Error & {
      status?: number
      body?: string
    }
    const parts: string[] = []
    if (typeof anyErr.status === 'number') parts.push(`status ${anyErr.status}`)
    if (anyErr.body) parts.push(`body ${anyErr.body}`)
    if (parts.length > 0)
      return `[llm] Local request failed: ${parts.join(', ')}`
    if (err.message) return `[llm] Local request failed: ${err.message}`
  }
  return `[llm] Local request failed: ${String(err)}`
}

const normalizeBaseUrl = (value: string): string => {
  const trimmed = value.replace(/\/+$/, '')
  if (trimmed.endsWith('/v1')) return trimmed
  return `${trimmed}/v1`
}

class HttpError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

const requestJson = async (
  url: string,
  payload: unknown,
  controller: AbortController | null,
): Promise<Record<string, unknown>> => {
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }
  if (controller) init.signal = controller.signal
  const response = await fetch(url, init)
  const body = await response.text()
  if (!response.ok) {
    const snippet = body.length > 500 ? `${body.slice(0, 500)}...` : body
    throw new HttpError(response.status, snippet)
  }
  if (!body) return {}
  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch {
    throw new HttpError(response.status, `invalid_json ${body.slice(0, 200)}`)
  }
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
  try {
    const response = await requestJson(
      `${apiBase}/chat/completions`,
      {
        model: params.model,
        messages: [{ role: 'user', content: params.prompt }],
      },
      controller,
    )
    const output = extractChatText(response)
    const usage = normalizeChatUsage((response as { usage?: ChatUsage }).usage)
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    return { output, elapsedMs, ...(usage ? { usage } : {}) }
  } catch (err) {
    throw new Error(formatLocalError(err), { cause: err })
  } finally {
    if (timer) clearTimeout(timer)
  }
}
