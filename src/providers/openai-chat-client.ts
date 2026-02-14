import { normalizeChatUsage } from '../shared/utils.js'

import { formatLlmError } from './openai-chat-errors.js'

import type { TextDeltaListener } from './types.js'
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
  onTextDelta?: TextDeltaListener
  onUsage?: (usage: TokenUsage) => void
}

const isSameUsage = (
  left: TokenUsage | undefined,
  right: TokenUsage | undefined,
): boolean =>
  left?.input === right?.input &&
  left?.output === right?.output &&
  left?.total === right?.total

const normalizeBaseUrl = (value: string): string => {
  const trimmed = value.replace(/\/+$/, '')
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}

const requestSse = async (
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  onChunk: (chunk: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> => {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {}),
  })
  if (!response.ok) {
    const body = await response.text()
    const snippet = body.length > 500 ? `${body.slice(0, 500)}...` : body
    throw new Error(`HTTP ${response.status}: ${snippet}`)
  }
  if (!response.body) throw new Error('missing_response_body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let dataLines: string[] = []

  const flushEvent = (): boolean => {
    if (dataLines.length === 0) return false
    const payloadText = dataLines.join('\n').trim()
    dataLines = []
    if (!payloadText) return false
    if (payloadText === '[DONE]') return true
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(payloadText) as Record<string, unknown>
    } catch {
      throw new Error(`invalid_json: ${payloadText.slice(0, 200)}`)
    }
    onChunk(parsed)
    return false
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    for (;;) {
      const lineBreakIndex = buffer.indexOf('\n')
      if (lineBreakIndex < 0) break
      let line = buffer.slice(0, lineBreakIndex)
      buffer = buffer.slice(lineBreakIndex + 1)
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (!line) {
        if (flushEvent()) return
        continue
      }
      if (line.startsWith(':')) continue
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
  }
  buffer += decoder.decode()

  const tail = buffer.trim()
  if (tail.startsWith('data:')) dataLines.push(tail.slice(5).trimStart())

  flushEvent()
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
  let output = ''
  let usage: TokenUsage | undefined
  try {
    await withTimeout(params.timeoutMs, (signal) =>
      requestSse(
        `${normalizeBaseUrl(params.baseUrl)}/chat/completions`,
        {
          model: params.model,
          stream: true,
          stream_options: { include_usage: true },
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
        (chunk) => {
          const { choices } = chunk as { choices?: unknown }
          if (Array.isArray(choices)) {
            for (const choice of choices) {
              if (!choice || typeof choice !== 'object') continue
              const { delta } = choice as { delta?: unknown }
              if (!delta || typeof delta !== 'object') continue
              const { content } = delta as { content?: unknown }
              if (typeof content === 'string') {
                output += content
                params.onTextDelta?.(content)
                continue
              }
              if (!Array.isArray(content)) continue
              for (const part of content) {
                if (!part || typeof part !== 'object') continue
                const { text } = part as { text?: unknown }
                if (typeof text !== 'string' || text.length === 0) continue
                output += text
                params.onTextDelta?.(text)
              }
            }
          }
          const nextUsage = normalizeChatUsage(
            (chunk as { usage?: unknown }).usage as {
              prompt_tokens?: number
              completion_tokens?: number
              total_tokens?: number
            },
          )
          if (nextUsage && !isSameUsage(usage, nextUsage)) {
            usage = nextUsage
            params.onUsage?.(nextUsage)
          }
        },
        signal,
      ),
    )
    return {
      output: output.trim(),
      elapsedMs: Math.max(0, Date.now() - startedAt),
      ...(usage ? { usage } : {}),
    }
  } catch (error) {
    throw new Error(formatLlmError(params.errorPrefix, error), { cause: error })
  }
}
