import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { asNumber } from '../shared/utils.js'

import { buildProviderPreflightError } from './provider-error.js'

import type { OpenAiChatProviderRequest } from './types.js'
import type { TokenUsage } from '../types/index.js'

export const STREAM_OPTIONS = { include_usage: true }
const FALLBACK_API_KEY = 'OPENAI_API_KEY_NOT_REQUIRED'

export const appendOpenAiChatLog = async (
  request: OpenAiChatProviderRequest,
  entry: Record<string, unknown>,
): Promise<void> => {
  if (!request.logPath) return
  await bestEffort('appendLog: llm_call', () =>
    appendLog(request.logPath as string, {
      ...entry,
      provider: 'openai-chat',
      role: request.role,
      timeoutMs: request.timeoutMs,
      promptChars: request.prompt.length,
      promptLines: request.prompt.split(/\r?\n/).length,
      workingDirectory: request.workDir,
      ...(request.model ? { model: request.model } : {}),
      ...(request.logContext ?? {}),
    }),
  )
}

export const normalizeOpenAiChatUsage = (
  value: unknown,
): TokenUsage | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const usage = value as Record<string, unknown>
  const input = asNumber(usage.prompt_tokens)
  const output = asNumber(usage.completion_tokens)
  const total = asNumber(usage.total_tokens)
  const promptDetails =
    usage.prompt_tokens_details &&
    typeof usage.prompt_tokens_details === 'object' &&
    !Array.isArray(usage.prompt_tokens_details)
      ? (usage.prompt_tokens_details as Record<string, unknown>)
      : undefined
  const completionDetails =
    usage.completion_tokens_details &&
    typeof usage.completion_tokens_details === 'object' &&
    !Array.isArray(usage.completion_tokens_details)
      ? (usage.completion_tokens_details as Record<string, unknown>)
      : undefined
  const inputCacheRead = asNumber(promptDetails?.cached_tokens)
  const outputCache = asNumber(completionDetails?.cached_tokens)
  if (
    input === undefined &&
    output === undefined &&
    total === undefined &&
    inputCacheRead === undefined &&
    outputCache === undefined
  )
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(inputCacheRead !== undefined ? { inputCacheRead } : {}),
    ...(outputCache !== undefined ? { outputCache } : {}),
  }
}

export const resolveOpenAiChatBaseUrl = (baseUrl: string | undefined): string => {
  const trimmed = baseUrl?.trim().replace(/\/+$/g, '')
  if (!trimmed) {
    throw buildProviderPreflightError({
      providerId: 'openai-chat',
      message: 'baseUrl is missing',
    })
  }
  return trimmed
}

export const resolveOpenAiApiKey = (
  apiKey: string | undefined,
  requiresOpenAiAuth: boolean | undefined,
): string => {
  const resolved = apiKey?.trim()
  if (resolved) return resolved
  if (requiresOpenAiAuth !== false) {
    throw buildProviderPreflightError({
      providerId: 'openai-chat',
      message: 'OPENAI_API_KEY is missing',
    })
  }
  return FALLBACK_API_KEY
}

export const resolveOpenAiChatModel = (
  request: OpenAiChatProviderRequest,
  fallbackModel: string | undefined,
): string => {
  const requestModel = request.model?.trim()
  const fallback = fallbackModel?.trim()
  const model =
    (requestModel && requestModel.length > 0 ? requestModel : undefined) ??
    (fallback && fallback.length > 0 ? fallback : undefined)
  if (model) return model
  throw buildProviderPreflightError({
    providerId: 'openai-chat',
    message: 'model is missing',
  })
}

export const ensureError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

export const buildFetchWithoutAuthHeader = (): typeof fetch =>
  async (input, init) => {
    const request =
      input instanceof Request ? input : new Request(input, init)
    const headers = new Headers(request.headers)
    headers.delete('authorization')
    return fetch(new Request(request, { headers }))
  }
