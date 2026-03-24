import { ProxyAgent } from 'undici'

import { buildProviderPreflightError } from './provider-error.js'
import { resolveProviderProxyUrl } from './utils.js'

import type { OpenAiResponsesProviderRequest } from './types.js'
import type { Dispatcher } from 'undici'

export const OPENAI_RESPONSES_PROVIDER_ID = 'openai-responses' as const

export const resolveBaseUrl = (baseUrl: string | undefined): string => {
  const trimmed = baseUrl?.trim().replace(/\/+$/g, '')
  if (!trimmed) {
    throw buildProviderPreflightError({
      providerId: OPENAI_RESPONSES_PROVIDER_ID,
      message: 'baseUrl is missing',
    })
  }
  return trimmed
}

export const trimNonEmptyString = (
  value: string | undefined,
): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export const resolveApiKey = (
  apiKey: string | undefined,
  requiresAuth: boolean | undefined,
): string => {
  const resolved = apiKey?.trim()
  if (resolved) return resolved
  if (requiresAuth !== false) {
    throw buildProviderPreflightError({
      providerId: OPENAI_RESPONSES_PROVIDER_ID,
      message: 'OPENAI_API_KEY is missing',
    })
  }
  return 'OPENAI_API_KEY_NOT_REQUIRED'
}

export const resolveModel = (
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
    providerId: OPENAI_RESPONSES_PROVIDER_ID,
    message: 'model is missing',
  })
}

const proxyDispatcherCache = new Map<string, Dispatcher>()

export const resolveProxyDispatcher = (
  proxy: string | undefined,
): Dispatcher | undefined => {
  const normalized = resolveProviderProxyUrl(
    OPENAI_RESPONSES_PROVIDER_ID,
    trimNonEmptyString(proxy),
  )
  if (!normalized) return undefined
  const cached = proxyDispatcherCache.get(normalized)
  if (cached) return cached
  const dispatcher = new ProxyAgent(normalized)
  proxyDispatcherCache.set(normalized, dispatcher)
  return dispatcher
}
