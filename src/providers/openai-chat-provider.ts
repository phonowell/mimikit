import { appendLog } from '../log/append.js'
import { asNumber } from '../shared/utils.js'
import { bestEffort } from '../log/safe.js'

import {
  buildProviderAbortedError,
  buildProviderPreflightError,
  buildProviderSdkError,
  buildProviderTimeoutError,
  isTransientProviderMessage,
  ProviderError,
  readProviderErrorCode,
} from './provider-error.js'
import {
  bindExternalAbort,
  buildProviderResult,
  createTimeoutGuard,
  elapsedMsSince,
} from './provider-runtime.js'
import { loadCodexSettings } from './openai-settings.js'

import type { OpenAiChatProviderRequest, Provider } from './types.js'
import type { TokenUsage } from '../types/index.js'

const STREAM_OPTIONS = { include_usage: true }

const appendOpenAiChatLog = async (
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

const normalizeOpenAiChatUsage = (value: unknown): TokenUsage | undefined => {
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

const resolveOpenAiChatEndpoint = (baseUrl: string | undefined): string => {
  const trimmed = baseUrl?.trim().replace(/\/+$/g, '')
  if (!trimmed) {
    throw buildProviderPreflightError({
      providerId: 'openai-chat',
      message: 'baseUrl is missing',
    })
  }
  return `${trimmed}/chat/completions`
}

const resolveOpenAiChatModel = (
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

export const openAiChatProvider: Provider<OpenAiChatProviderRequest> = {
  id: 'openai-chat',
  run: async (request) => {
    const startedAt = Date.now()
    const controller = new AbortController()
    const lifecycle = {
      externallyAborted: false,
      timedOut: false,
    }
    const releaseExternalAbort = bindExternalAbort({
      controller,
      ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
      onAbort: () => {
        lifecycle.externallyAborted = true
      },
    })
    const idleTimeout = createTimeoutGuard({
      controller,
      timeoutMs: request.timeoutMs,
      onTimeout: () => {
        lifecycle.timedOut = true
      },
    })
    const resetIdle = () => idleTimeout.arm()

    try {
      const settings = await loadCodexSettings()
      const endpoint = resolveOpenAiChatEndpoint(settings.baseUrl)
      const model = resolveOpenAiChatModel(request, settings.model)
      if (settings.requiresOpenAiAuth !== false && !settings.apiKey) {
        throw buildProviderPreflightError({
          providerId: 'openai-chat',
          message: 'OPENAI_API_KEY is missing',
        })
      }
      await appendOpenAiChatLog(request, {
        event: 'llm_call_started',
        modelResolved: model,
        baseUrl: settings.baseUrl,
      })

      resetIdle()
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(settings.apiKey
            ? { authorization: `Bearer ${settings.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: request.prompt }],
          stream: true,
          stream_options: STREAM_OPTIONS,
        }),
        signal: controller.signal,
      })
      resetIdle()

      if (!response.ok) {
        const errorText = (await response.text()).trim()
        throw new Error(errorText || `http_${response.status}`)
      }
      if (!response.body) throw new Error('empty_response_body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf8')
      let output = ''
      let usage: TokenUsage | undefined
      let buffer = ''

      const consumeLine = (line: string): void => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) return
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') return
        const chunk = JSON.parse(payload) as Record<string, unknown>
        if (chunk.error && typeof chunk.error === 'object') {
          const message =
            (chunk.error as { message?: unknown }).message ?? 'unknown_error'
          throw new Error(String(message))
        }
        const choices = Array.isArray(chunk.choices)
          ? (chunk.choices as Array<Record<string, unknown>>)
          : []
        for (const choice of choices) {
          const delta =
            choice.delta &&
            typeof choice.delta === 'object' &&
            !Array.isArray(choice.delta)
              ? (choice.delta as Record<string, unknown>)
              : undefined
          const text =
            typeof delta?.content === 'string' ? delta.content : undefined
          if (!text) continue
          output += text
          request.onTextDelta?.(text)
        }
        const nextUsage = normalizeOpenAiChatUsage(chunk.usage)
        if (!nextUsage) return
        usage = nextUsage
        request.onUsage?.(nextUsage)
      }

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        resetIdle()
        buffer += decoder.decode(value, { stream: true })
        let lineBreak = buffer.indexOf('\n')
        while (lineBreak >= 0) {
          consumeLine(buffer.slice(0, lineBreak))
          buffer = buffer.slice(lineBreak + 1)
          lineBreak = buffer.indexOf('\n')
        }
      }
      const tail = decoder.decode()
      if (tail) buffer += tail
      if (buffer.trim()) consumeLine(buffer)

      const elapsedMs = elapsedMsSince(startedAt)
      await appendOpenAiChatLog(request, {
        event: 'llm_call_finished',
        elapsedMs,
        ...(usage ? { usage } : {}),
      })
      return buildProviderResult({
        startedAt,
        output,
        ...(usage ? { usage } : {}),
      })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      let mapped: ProviderError
      if (err instanceof ProviderError) mapped = err
      else if (lifecycle.timedOut)
        mapped = buildProviderTimeoutError('openai-chat', request.timeoutMs)
      else if (lifecycle.externallyAborted)
        mapped = buildProviderAbortedError('openai-chat')
      else {
        mapped = buildProviderSdkError({
          providerId: 'openai-chat',
          message: err.message,
          transient: isTransientProviderMessage(err.message),
        })
      }
      const code = readProviderErrorCode(mapped)
      await appendOpenAiChatLog(request, {
        event: 'llm_call_failed',
        elapsedMs: elapsedMsSince(startedAt),
        error: mapped.message,
        errorName: mapped.name,
        ...(code ? { errorCode: code } : {}),
      })
      throw mapped
    } finally {
      idleTimeout.clear()
      releaseExternalAbort()
    }
  },
}
