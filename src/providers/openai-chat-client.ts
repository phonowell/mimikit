import { normalizeChatUsage } from '../shared/utils.js'

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

const readMessage = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

const readCode = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized ? normalized : undefined
  }
  if (typeof value === 'number') return String(value)
  return undefined
}

const parseErrorNode = (
  value: unknown,
): { message?: string; code?: string; cause?: unknown } => {
  if (value instanceof Error) {
    const errorWithCode = value as Error & { code?: unknown; cause?: unknown }
    const code = readCode(errorWithCode.code)
    return {
      ...(value.message ? { message: value.message } : {}),
      ...(code ? { code } : {}),
      ...(errorWithCode.cause !== undefined
        ? { cause: errorWithCode.cause }
        : {}),
    }
  }
  if (!value || typeof value !== 'object') return {}
  const node = value as {
    message?: unknown
    code?: unknown
    cause?: unknown
  }
  const message = readMessage(node.message)
  const code = readCode(node.code)
  return {
    ...(message ? { message } : {}),
    ...(code ? { code } : {}),
    ...(node.cause !== undefined ? { cause: node.cause } : {}),
  }
}

const formatCause = (value: unknown): string | undefined => {
  const nodes: string[] = []
  const details: string[] = []
  let current: unknown = value
  const seen = new Set<unknown>()
  for (let depth = 0; depth < 4 && current !== undefined; depth += 1) {
    if (typeof current === 'object' && current !== null) {
      if (seen.has(current)) break
      seen.add(current)
    }
    const parsed = parseErrorNode(current)
    const message = parsed.message ? parsed.message.trim() : ''
    const code = parsed.code ? parsed.code.trim() : ''
    const part = [message, code ? `code=${code}` : '']
      .filter(Boolean)
      .join(', ')
    if (part) nodes.push(part)
    if (part && depth > 0) details.push(part)
    if (parsed.cause === undefined || parsed.cause === current) break
    current = parsed.cause
  }
  if (details.length > 0) return details.join(' -> ')
  if (nodes.length <= 1) return undefined
  return nodes.slice(1).join(' -> ')
}

const formatLlmError = (prefix: string, err: unknown): string => {
  if (err instanceof Error) {
    const cause = formatCause(err)
    if (cause) return `${prefix} failed: ${err.message} (cause: ${cause})`
    return `${prefix} failed: ${err.message}`
  }
  return `${prefix} failed: ${String(err)}`
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
