import {
  appendOpenAiChatLog,
  normalizeOpenAiChatUsage,
  resolveOpenAiChatEndpoint,
  resolveOpenAiChatModel,
} from './openai-chat-provider-helpers.js'
import { loadCodexSettings } from './openai-settings.js'
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

import type { OpenAiChatProviderRequest, Provider } from './types.js'
import type { TokenUsage } from '../types/index.js'

const STREAM_OPTIONS = { include_usage: true }

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
