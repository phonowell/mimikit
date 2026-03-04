import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
} from 'openai'

import {
  appendOpenAiChatLog,
  buildFetchWithoutAuthHeader,
  ensureError,
  normalizeOpenAiChatUsage,
  resolveOpenAiApiKey,
  resolveOpenAiChatBaseUrl,
  resolveOpenAiChatModel,
} from './openai-chat-helpers.js'
import { loadCodexSettings } from './codex-settings.js'
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

import type { OpenAiChatProviderRequest, Provider } from './types.js'
import type { TokenUsage } from '../types/index.js'

const resolveOutputText = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  let output = ''
  for (const part of value) {
    if (typeof part === 'string') {
      output += part
      continue
    }
    if (!part || typeof part !== 'object') continue
    if ('text' in part && typeof part.text === 'string') output += part.text
  }
  return output
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
      const baseURL = resolveOpenAiChatBaseUrl(settings.baseUrl)
      const apiKey = resolveOpenAiApiKey(settings.apiKey, settings.requiresAuth)
      const model = resolveOpenAiChatModel(request, settings.model)
      const shouldStripAuthorizationHeader =
        settings.requiresAuth === false && !settings.apiKey?.trim()?.length
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

      let usage: TokenUsage | undefined
      resetIdle()
      const completion = await client.chat.completions.create(
        {
          model,
          messages: [{ role: 'user', content: request.prompt }],
        },
        { signal: controller.signal },
      )
      resetIdle()
      const output = resolveOutputText(completion.choices[0]?.message?.content)
      const nextUsage = normalizeOpenAiChatUsage(completion.usage)
      if (nextUsage) {
        usage = nextUsage
        request.onUsage?.(nextUsage)
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
