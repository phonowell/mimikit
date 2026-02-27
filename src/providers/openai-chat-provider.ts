import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
} from 'openai'

import {
  buildProviderAbortedError,
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
import {
  appendOpenAiChatLog,
  buildFetchWithoutAuthHeader,
  ensureError,
  normalizeOpenAiChatUsage,
  resolveOpenAiApiKey,
  resolveOpenAiChatBaseUrl,
  resolveOpenAiChatModel,
  STREAM_OPTIONS,
} from './openai-chat-helpers.js'

import type { OpenAiChatProviderRequest, Provider } from './types.js'
import type { TokenUsage } from '../types/index.js'

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
      const baseURL = resolveOpenAiChatBaseUrl(settings.baseUrl)
      const apiKey = resolveOpenAiApiKey(
        settings.apiKey,
        settings.requiresOpenAiAuth,
      )
      const model = resolveOpenAiChatModel(request, settings.model)
      const shouldStripAuthorizationHeader =
        settings.requiresOpenAiAuth === false &&
        !(settings.apiKey?.trim()?.length)
      const client = new OpenAI({
        apiKey,
        baseURL,
        maxRetries: 0,
        ...(shouldStripAuthorizationHeader
          ? { fetch: buildFetchWithoutAuthHeader() }
          : {}),
      })
      await appendOpenAiChatLog(request, {
        event: 'llm_call_started',
        modelResolved: model,
        baseUrl: settings.baseUrl,
      })

      let output = ''
      let usage: TokenUsage | undefined
      resetIdle()
      const stream = await client.chat.completions.create(
        {
          model,
          messages: [{ role: 'user', content: request.prompt }],
          stream: true,
          stream_options: STREAM_OPTIONS,
        },
        { signal: controller.signal },
      )
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (typeof delta === 'string' && delta.length > 0) {
          output += delta
          request.onTextDelta?.(delta)
        }
        const nextUsage = normalizeOpenAiChatUsage(chunk.usage)
        if (nextUsage) {
          usage = nextUsage
          request.onUsage?.(nextUsage)
        }
        resetIdle()
      }

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
      const err = ensureError(error)
      let mapped: ProviderError
      if (err instanceof ProviderError) mapped = err
      else if (lifecycle.timedOut || err instanceof APIConnectionTimeoutError)
        mapped = buildProviderTimeoutError('openai-chat', request.timeoutMs)
      else if (lifecycle.externallyAborted || err instanceof APIUserAbortError)
        mapped = buildProviderAbortedError('openai-chat')
      else {
        mapped = buildProviderSdkError({
          providerId: 'openai-chat',
          message: err.message,
          transient:
            err instanceof APIConnectionError ||
            isTransientProviderMessage(err.message),
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
