import { randomUUID } from 'node:crypto'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { normalizeUsage } from '../shared/utils.js'

import { loadCodexSettings } from './codex-settings.js'
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

import type { OpenAiResponsesProviderRequest, Provider } from './types.js'
import type { TokenUsage } from '../types/index.js'

const PROVIDER_ID = 'openai-responses' as const

const resolveBaseUrl = (baseUrl: string | undefined): string => {
  const trimmed = baseUrl?.trim().replace(/\/+$/g, '')
  if (!trimmed) {
    throw buildProviderPreflightError({
      providerId: PROVIDER_ID,
      message: 'baseUrl is missing',
    })
  }
  return trimmed
}

const trimNonEmptyString = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const resolveApiKey = (
  apiKey: string | undefined,
  requiresAuth: boolean | undefined,
): string => {
  const resolved = apiKey?.trim()
  if (resolved) return resolved
  if (requiresAuth !== false) {
    throw buildProviderPreflightError({
      providerId: PROVIDER_ID,
      message: 'OPENAI_API_KEY is missing',
    })
  }
  return 'OPENAI_API_KEY_NOT_REQUIRED'
}

const resolveModel = (
  request: OpenAiResponsesProviderRequest,
  fallbackModel: string | undefined,
): string => {
  const requestModel = request.model?.trim()
  const fallback = fallbackModel?.trim()
  const model =
    (requestModel && requestModel.length > 0 ? requestModel : undefined) ??
    (fallback && fallback.length > 0 ? fallback : undefined)
  if (model) return model
  throw buildProviderPreflightError({
    providerId: PROVIDER_ID,
    message: 'model is missing',
  })
}

const buildFetchWithoutAuthHeader =
  (): typeof fetch => (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const headers = new Headers(request.headers)
    headers.delete('authorization')
    return fetch(new Request(request, { headers }))
  }

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value ? (value as Record<string, unknown>) : null

const asString = (
  value: Record<string, unknown> | null,
  key: string,
): string | undefined => {
  if (!value) return undefined
  const target = value[key]
  return typeof target === 'string' ? target : undefined
}

const appendOpenAiResponsesLog = async (
  request: OpenAiResponsesProviderRequest,
  entry: Record<string, unknown>,
): Promise<void> => {
  if (!request.logPath) return
  await bestEffort('appendLog: llm_call', () =>
    appendLog(request.logPath as string, {
      ...entry,
      provider: PROVIDER_ID,
      role: request.role,
      timeoutMs: request.timeoutMs,
      promptChars: request.prompt.length,
      promptLines: request.prompt.split(/\r?\n/).length,
      outputSchema: Boolean(request.outputSchema),
      workingDirectory: request.workDir,
      ...(request.model ? { model: request.model } : {}),
      ...(request.logContext ?? {}),
    }),
  )
}

const toDataPayload = (chunk: string): unknown => {
  const dataLines = chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
  if (dataLines.length === 0) return null
  const raw = dataLines.join('\n').trim()
  if (!raw || raw === '[DONE]') return null
  return JSON.parse(raw) as unknown
}

const readCompletedOutput = (completed: Record<string, unknown>): string => {
  const output = completed['output']
  if (!Array.isArray(output)) return ''
  let text = ''
  for (const item of output) {
    const itemRecord = asRecord(item)
    if (asString(itemRecord, 'type') !== 'message') continue
    const content = itemRecord?.['content']
    if (!Array.isArray(content)) continue
    for (const part of content) {
      const partRecord = asRecord(part)
      if (asString(partRecord, 'type') !== 'output_text') continue
      text += asString(partRecord, 'text') ?? ''
    }
  }
  return text
}

const parseJsonRecord = (raw: string): Record<string, unknown> | null => {
  try {
    return asRecord(JSON.parse(raw))
  } catch {
    return null
  }
}

const readErrorMessage = (raw: string): string | undefined => {
  const payload = parseJsonRecord(raw)
  const message = asString(payload, 'message')
  if (message) return message
  const error = asRecord(payload?.error)
  return asString(error, 'message')
}

const shouldRetryWithSessionId = (
  raw: string,
  sessionId: string | undefined,
): boolean => {
  if (sessionId) return false
  const message = readErrorMessage(raw)
  if (!message) return false
  return /missing[_\s-]*session[_\s-]*id|缺失session_id/i.test(message)
}

const resolveSessionId = (threadId: string | null | undefined): string => {
  const current = threadId?.trim()
  if (current) return current
  return `session-${randomUUID()}`
}

export const parseResponsesSse = (
  raw: string,
): { output: string; usage?: TokenUsage } => {
  const chunks = raw.split(/\r?\n\r?\n/)
  let completed: Record<string, unknown> | null = null
  let latestOutputText = ''
  for (const chunk of chunks) {
    if (!chunk.trim()) continue
    let payload: unknown
    try {
      payload = toDataPayload(chunk)
    } catch {
      continue
    }
    const event = asRecord(payload)
    const type = asString(event, 'type')
    if (!type) continue
    if (type === 'response.output_text.done') {
      latestOutputText = asString(event, 'text') ?? latestOutputText
      continue
    }
    if (type === 'response.failed') {
      const response = asRecord(event?.response)
      const error = asRecord(response?.error)
      throw new Error(asString(error, 'message') ?? 'responses_failed')
    }
    if (type === 'error') {
      throw new Error(asString(event, 'message') ?? 'responses_error')
    }
    if (type === 'response.completed') {
      completed = asRecord(event?.response)
    }
  }
  if (!completed) throw new Error('responses_completed_event_missing')
  const usage = normalizeUsage(completed.usage ?? null)
  const output = readCompletedOutput(completed) || latestOutputText
  return { output, ...(usage ? { usage } : {}) }
}

export const parseResponsesJson = (
  raw: string,
): { output: string; usage?: TokenUsage } => {
  const payload = parseJsonRecord(raw)
  if (!payload) throw new Error('responses_json_parse_failed')
  const message = readErrorMessage(raw)
  if (message && (payload.error || typeof payload.code === 'number')) {
    throw new Error(message)
  }
  const usage = normalizeUsage(payload.usage ?? null)
  const output = readCompletedOutput(payload) || (asString(payload, 'output_text') ?? '')
  return { output, ...(usage ? { usage } : {}) }
}

export const parseResponsesPayload = (
  raw: string,
): { output: string; usage?: TokenUsage } => {
  const trimmed = raw.trimStart()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseResponsesJson(raw)
  }
  return parseResponsesSse(raw)
}

const buildHttpErrorMessage = (status: number, raw: string): string => {
  const message = readErrorMessage(raw)
  if (message) return `responses_http_${status}:${message}`
  const preview = raw.trim().slice(0, 280)
  return `responses_http_${status}:${preview}`
}

const ensureError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

const runOpenAiResponses = async (request: OpenAiResponsesProviderRequest) => {
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
    const requestBaseUrl = trimNonEmptyString(request.baseUrl)
    const requestApiKey = trimNonEmptyString(request.apiKey)
    const baseUrl = resolveBaseUrl(requestBaseUrl ?? settings.baseUrl)
    const apiKey = resolveApiKey(
      requestApiKey ?? settings.apiKey,
      settings.requiresAuth,
    )
    const model = resolveModel(request, settings.model)
    const endpoint = `${baseUrl}/responses`
    const shouldStripAuthorizationHeader =
      settings.requiresAuth === false &&
      !requestApiKey &&
      !settings.apiKey?.trim()?.length
    const doFetch = shouldStripAuthorizationHeader
      ? buildFetchWithoutAuthHeader()
      : fetch
    await appendOpenAiResponsesLog(request, {
      event: 'llm_call_started',
      modelResolved: model,
      baseUrl,
      ...(settings.wireApi ? { wireApi: settings.wireApi } : {}),
    })

    const requestBody = JSON.stringify({
      model,
      stream: false,
      input: [{ role: 'user', content: request.prompt }],
    })
    let sessionId: string | undefined
    let response: Response | null = null
    let raw = ''
    while (true) {
      resetIdle()
      response = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
          ...(sessionId
            ? {
                session_id: sessionId,
              }
            : {}),
        },
        body: requestBody,
        signal: controller.signal,
      })
      resetIdle()
      raw = await response.text()
      resetIdle()
      if (shouldRetryWithSessionId(raw, sessionId)) {
        sessionId = resolveSessionId(request.threadId)
        continue
      }
      break
    }
    if (!response) throw new Error('responses_response_missing')
    if (!response.ok) throw new Error(buildHttpErrorMessage(response.status, raw))
    const { output, usage } = parseResponsesPayload(raw)
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
      ...(sessionId ? { threadId: sessionId } : {}),
      ...(usage ? { usage } : {}),
    })
  } catch (error) {
    const err = ensureError(error)
    let mapped: ProviderError
    if (err instanceof ProviderError) mapped = err
    else if (lifecycle.timedOut)
      mapped = buildProviderTimeoutError(PROVIDER_ID, request.timeoutMs)
    else if (
      lifecycle.externallyAborted ||
      err.name === 'AbortError' ||
      /aborted|canceled/i.test(err.message)
    )
      mapped = buildProviderAbortedError(PROVIDER_ID)
    else {
      const transient =
        /responses_http_(429|5\d\d):/i.test(err.message) ||
        isTransientProviderMessage(err.message)
      mapped = buildProviderSdkError({
        providerId: PROVIDER_ID,
        message: err.message,
        transient,
      })
    }
    const code = readProviderErrorCode(mapped)
    await appendOpenAiResponsesLog(request, {
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
}

export const openAiResponsesProvider: Provider<OpenAiResponsesProviderRequest> = {
  id: PROVIDER_ID,
  run: runOpenAiResponses,
}
