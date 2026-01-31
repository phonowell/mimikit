import { loadCodexSettings, resolveOpenAiModel } from './openai.js'

import type { TokenUsage } from '../types/usage.js'

type RunResult = {
  output: string
  usage?: TokenUsage
  elapsedMs: number
}

type OpenAiUsage = {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

type ChatUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const normalizeUsage = (usage?: OpenAiUsage | null): TokenUsage | undefined => {
  if (!usage) return undefined
  const input = usage.input_tokens
  const output = usage.output_tokens
  if (!isFiniteNumber(input) && !isFiniteNumber(output)) return undefined
  const result: TokenUsage = {}
  if (isFiniteNumber(input)) result.input = input
  if (isFiniteNumber(output)) result.output = output
  if (isFiniteNumber(input) && isFiniteNumber(output))
    result.total = input + output
  else if (isFiniteNumber(usage.total_tokens)) result.total = usage.total_tokens
  return result
}

const normalizeChatUsage = (
  usage?: ChatUsage | null,
): TokenUsage | undefined => {
  if (!usage) return undefined
  const input = usage.prompt_tokens
  const output = usage.completion_tokens
  if (!isFiniteNumber(input) && !isFiniteNumber(output)) return undefined
  const result: TokenUsage = {}
  if (isFiniteNumber(input)) result.input = input
  if (isFiniteNumber(output)) result.output = output
  if (isFiniteNumber(input) && isFiniteNumber(output))
    result.total = input + output
  else if (isFiniteNumber(usage.total_tokens)) result.total = usage.total_tokens
  return result
}

const extractOutputText = (response: unknown): string => {
  if (response && typeof response === 'object') {
    const direct = (response as { output_text?: unknown }).output_text
    if (typeof direct === 'string') return direct
    const { output } = response as { output?: unknown }
    if (Array.isArray(output)) {
      const texts: string[] = []
      for (const item of output) {
        if (!item || typeof item !== 'object') continue
        const { content } = item as { content?: unknown }
        if (!Array.isArray(content)) continue
        for (const part of content) {
          if (!part || typeof part !== 'object') continue
          const { type } = part as { type?: unknown }
          const { text } = part as { text?: unknown }
          if (type === 'output_text' && typeof text === 'string')
            texts.push(text)
        }
      }
      return texts.join('\n').trim()
    }
  }
  return ''
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

export const runTellerOpenAi = async (params: {
  prompt: string
  model?: string
  timeoutMs: number
  outputSchema?: unknown
}): Promise<RunResult> => {
  const settings = await loadCodexSettings()
  const model = await resolveOpenAiModel(params.model)
  const baseUrl =
    settings.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com'
  const reasoningEffort = settings.modelReasoningEffort
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
  const hasSchema = !!params.outputSchema
  const buildResponsesRequest = (
    useSchema: boolean,
    useReasoning: boolean,
  ) => ({
    model,
    input: params.prompt,
    ...(useReasoning && reasoningEffort
      ? { model_reasoning_effort: reasoningEffort }
      : {}),
    ...(useSchema
      ? {
          text: {
            format: {
              type: 'json_schema',
              name: 'teller_output',
              strict: true,
              schema: params.outputSchema,
            },
          },
        }
      : {}),
  })
  const normalizeBaseUrl = (value: string): string => {
    const trimmed = value.replace(/\/+$/, '')
    if (trimmed.endsWith('/v1')) return trimmed
    return `${trimmed}/v1`
  }
  const apiBase = normalizeBaseUrl(baseUrl)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

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

  const requestResponses = async (
    useSchema: boolean,
    useReasoning: boolean,
  ): Promise<RunResult> => {
    const response = await requestJson(
      `${apiBase}/responses`,
      buildResponsesRequest(useSchema, useReasoning),
    )
    const output = extractOutputText(response)
    const usage = normalizeUsage((response as { usage?: OpenAiUsage }).usage)
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    return { output, elapsedMs, ...(usage ? { usage } : {}) }
  }

  const requestChat = async (useReasoning: boolean): Promise<RunResult> => {
    const response = await requestJson(`${apiBase}/chat/completions`, {
      model,
      ...(useReasoning && reasoningEffort
        ? { model_reasoning_effort: reasoningEffort }
        : {}),
      messages: [{ role: 'user', content: params.prompt }],
    })
    const output = extractChatText(response)
    const usage = normalizeChatUsage((response as { usage?: ChatUsage }).usage)
    const elapsedMs = Math.max(0, Date.now() - startedAt)
    return { output, elapsedMs, ...(usage ? { usage } : {}) }
  }

  const preferChat =
    typeof settings.wireApi === 'string' &&
    settings.wireApi.toLowerCase().includes('chat')
  try {
    const errors: Error[] = []
    const tryRun = async (fn: () => Promise<RunResult>) => {
      try {
        return await fn()
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    }

    const attempts: Array<() => Promise<RunResult>> = []
    const chatWithReasoning = () => requestChat(true)
    const chatWithoutReasoning = () => requestChat(false)
    const responsesSchemaWithReasoning = () => requestResponses(true, true)
    const responsesSchemaWithoutReasoning = () => requestResponses(true, false)
    const responsesWithReasoning = () => requestResponses(false, true)
    const responsesWithoutReasoning = () => requestResponses(false, false)

    const pushChatAttempts = () => {
      if (reasoningEffort) attempts.push(chatWithReasoning)
      attempts.push(chatWithoutReasoning)
    }
    const pushResponsesAttempts = () => {
      if (hasSchema) {
        if (reasoningEffort) attempts.push(responsesSchemaWithReasoning)
        attempts.push(responsesSchemaWithoutReasoning)
      }
      if (reasoningEffort) attempts.push(responsesWithReasoning)
      attempts.push(responsesWithoutReasoning)
    }

    if (preferChat) {
      pushChatAttempts()
      pushResponsesAttempts()
    } else {
      pushResponsesAttempts()
      pushChatAttempts()
    }

    for (const attempt of attempts) {
      const result = await tryRun(attempt)
      if (result) return result
    }

    const last = errors[errors.length - 1]
    if (last) throw last
    throw new Error('[llm] OpenAI request failed')
  } catch (err) {
    throw new Error(formatOpenAiError(err), { cause: err })
  } finally {
    if (timer) clearTimeout(timer)
  }
}
