import { OPENAI_RESPONSES_PROVIDER_ID } from './openai-responses-provider-config.js'
import { readResponsesErrorMessage } from './openai-responses-provider-parse.js'
import {
  buildProviderAbortedError,
  buildProviderSdkError,
  buildProviderTimeoutError,
  isTransientProviderMessage,
  ProviderError,
} from './provider-error.js'

export const buildResponsesHttpErrorMessage = (
  status: number,
  raw: string,
): string => {
  const message = readResponsesErrorMessage(raw)
  if (message) return `responses_http_${status}:${message}`
  const preview = raw.trim().slice(0, 280)
  return `responses_http_${status}:${preview}`
}

const isRetryableInvalidApiKey401 = (message: string): boolean =>
  /responses_http_401:.*invalid api key/i.test(message)

export const mapOpenAiResponsesError = (params: {
  error: unknown
  externallyAborted: boolean
  timedOut: boolean
  timeoutMs: number
}): ProviderError => {
  const err =
    params.error instanceof Error
      ? params.error
      : new Error(String(params.error))
  if (err instanceof ProviderError) return err
  if (params.timedOut) {
    return buildProviderTimeoutError(
      OPENAI_RESPONSES_PROVIDER_ID,
      params.timeoutMs,
    )
  }
  if (
    params.externallyAborted ||
    err.name === 'AbortError' ||
    /aborted|canceled|cancelled/i.test(err.message)
  )
    return buildProviderAbortedError(OPENAI_RESPONSES_PROVIDER_ID)

  const transient =
    /responses_http_(429|5\d\d):/i.test(err.message) ||
    isRetryableInvalidApiKey401(err.message) ||
    isTransientProviderMessage(err.message)
  return buildProviderSdkError({
    providerId: OPENAI_RESPONSES_PROVIDER_ID,
    message: err.message,
    transient,
  })
}
