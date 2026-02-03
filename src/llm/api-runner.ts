import { normalizeChatUsage } from '../shared/utils.js'

import { loadCodexSettings, resolveOpenAiModel } from './openai.js'

import type { TokenUsage } from '../types/common.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

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

const formatOpenAiError = (err: unknown): string => {
  if (!err) return '[llm] OpenAI request failed'
  if (err instanceof Error) {
    const anyErr = err as Error & {
      status?: number
      error?: { message?: string; type?: string; code?: string; param?: string }
      body?: string
    }
    const parts: string[] = []
    if (typeof anyErr.status === 'number') parts.push(`status ${anyErr.status}`)
    if (anyErr.error?.message) parts.push(anyErr.error.message)
    if (anyErr.error?.type) parts.push(`type ${anyErr.error.type}`)
    if (anyErr.error?.code) parts.push(`code ${anyErr.error.code}`)
    if (anyErr.error?.param) parts.push(`param ${anyErr.error.param}`)
    if (anyErr.body) parts.push(`body ${anyErr.body}`)
    if (parts.length > 0)
      return `[llm] OpenAI request failed: ${parts.join(', ')}`
    if (err.message) return `[llm] OpenAI request failed: ${err.message}`
  }
  return `[llm] OpenAI request failed: ${String(err)}`
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
  headers: Record<string, string>,
  controller: AbortController | null,
): Promise<Record<string, unknown>> => {
  const init: RequestInit = {
    method: 'POST',
    headers,
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

export const runManagerApi = async (params: {
  prompt: string
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  timeoutMs: number
}): Promise<RunResult> => {
  const settings = await loadCodexSettings()
  const model = await resolveOpenAiModel(params.model)
  const baseUrl =
    settings.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com'
  const reasoningEffort =
    params.modelReasoningEffort ?? settings.modelReasoningEffort
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

  try {
    const response = await requestJson(
      `${apiBase}/chat/completions`,
      {
        model,
        ...(reasoningEffort ? { model_reasoning_effort: reasoningEffort } : {}),
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
    throw new Error(formatOpenAiError(err), { cause: err })
  } finally {
    if (timer) clearTimeout(timer)
  }
}
