import { loadCodexSettings } from './codex-settings.js'
import {
  OPENAI_RESPONSES_PROVIDER_ID,
  resolveApiKey,
  resolveBaseUrl,
  resolveModel,
  resolveProxyDispatcher,
  trimNonEmptyString,
} from './openai-responses-provider-config.js'
import { summarizeResponsesPayload } from './openai-responses-provider-diagnostics.js'
import {
  buildResponsesHttpErrorMessage,
  mapOpenAiResponsesError,
} from './openai-responses-provider-errors.js'
import { appendOpenAiResponsesLog } from './openai-responses-provider-log.js'
import {
  buildResponsesInput,
  parseResponsesPayload,
  resolveSessionId,
} from './openai-responses-provider-parse.js'
import {
  buildStructuredOutputTextFormat,
  parseStructuredOutputJson,
} from './openai-responses-provider-structured.js'
import { ProviderError, readProviderErrorCode } from './provider-error.js'
import {
  bindExternalAbort,
  buildProviderResult,
  createTimeoutGuard,
  elapsedMsSince,
} from './provider-runtime.js'
import { attachProviderThreadId } from './thread-id.js'

import type { OpenAiResponsesProviderRequest, Provider } from './types.js'
import type { Dispatcher } from 'undici'

export {
  parseResponsesJson,
  parseResponsesPayload,
  parseResponsesSse,
} from './openai-responses-provider-parse.js'
export { summarizeResponsesPayload } from './openai-responses-provider-diagnostics.js'

const runOpenAiResponses = async (request: OpenAiResponsesProviderRequest) => {
  const startedAt = Date.now()
  const controller = new AbortController()
  let sessionId: string | undefined
  let rawResponse: string | undefined
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
    const requestBaseUrl = trimNonEmptyString(request.baseUrl)
    const requestApiKey = trimNonEmptyString(request.apiKey)
    const baseUrl = resolveBaseUrl(requestBaseUrl ?? settings.baseUrl)
    const apiKey = resolveApiKey(
      requestApiKey ?? settings.apiKey,
      settings.requiresAuth,
    )
    const dispatcher = resolveProxyDispatcher(request.proxy)
    const model = resolveModel(request, settings.model)
    const endpoint = `${baseUrl}/responses`
    const shouldStripAuthorizationHeader =
      settings.requiresAuth === false &&
      !requestApiKey &&
      !trimNonEmptyString(settings.apiKey)
    await appendOpenAiResponsesLog(request, {
      event: 'llm_call_started',
      modelResolved: model,
      baseUrl,
      proxyEnabled: Boolean(dispatcher),
      ...(settings.wireApi ? { wireApi: settings.wireApi } : {}),
    })

    const requestBody = JSON.stringify({
      model,
      stream: true,
      input: buildResponsesInput(request),
      ...(buildStructuredOutputTextFormat(request.outputSchema)
        ? {
            text: buildStructuredOutputTextFormat(request.outputSchema),
          }
        : {}),
      ...(request.modelReasoningEffort
        ? { reasoning: { effort: request.modelReasoningEffort } }
        : {}),
    })
    sessionId = resolveSessionId(request.threadId)
    resetIdle()
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      session_id: sessionId,
    }
    if (!shouldStripAuthorizationHeader)
      headers.authorization = `Bearer ${apiKey}`

    const requestInit: RequestInit & { dispatcher?: Dispatcher } = {
      method: 'POST',
      headers,
      body: requestBody,
      signal: controller.signal,
      ...(dispatcher ? { dispatcher } : {}),
    }
    const response = await fetch(endpoint, requestInit)
    resetIdle()
    if (response.ok) request.onTurnStarted?.()
    const raw = await response.text()
    rawResponse = raw
    resetIdle()
    if (!response.ok)
      throw new Error(buildResponsesHttpErrorMessage(response.status, raw))
    const { output, usage } = parseResponsesPayload(raw)
    const outputJson = request.outputSchema
      ? parseStructuredOutputJson(output)
      : undefined
    if (usage) request.onUsage?.(usage)
    const elapsedMs = elapsedMsSince(startedAt)
    await appendOpenAiResponsesLog(request, {
      event: 'llm_call_finished',
      elapsedMs,
      ...(sessionId ? { sessionId } : {}),
      ...(usage ? { usage } : {}),
    })
    return buildProviderResult({
      startedAt,
      output,
      ...(outputJson !== undefined ? { outputJson } : {}),
      ...(sessionId ? { threadId: sessionId } : {}),
      ...(usage ? { usage } : {}),
    })
  } catch (error) {
    const mapped: ProviderError =
      error instanceof ProviderError
        ? error
        : mapOpenAiResponsesError({
            error,
            externallyAborted: lifecycle.externallyAborted,
            timedOut: lifecycle.timedOut,
            timeoutMs: request.timeoutMs,
          })
    const code = readProviderErrorCode(mapped)
    await appendOpenAiResponsesLog(request, {
      event: 'llm_call_failed',
      elapsedMs: elapsedMsSince(startedAt),
      error: mapped.message,
      errorName: mapped.name,
      ...(rawResponse
        ? { responseSummary: summarizeResponsesPayload(rawResponse) }
        : {}),
      ...(code ? { errorCode: code } : {}),
    })
    throw attachProviderThreadId(mapped, sessionId ?? request.threadId ?? null)
  } finally {
    idleTimeout.clear()
    releaseExternalAbort()
  }
}

export const openAiResponsesProvider: Provider<OpenAiResponsesProviderRequest> =
  {
    id: OPENAI_RESPONSES_PROVIDER_ID,
    run: runOpenAiResponses,
  }
