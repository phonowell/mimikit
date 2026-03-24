import { buildProviderPreflightError } from './provider-error.js'

export const newProviderId = (): string => crypto.randomUUID().replace(/-/g, '')

export const stripUndefined = <T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]: Exclude<T[K], undefined> } =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as { [K in keyof T]: Exclude<T[K], undefined> }

/** Normalizes an HTTP(S) proxy URL and delegates invalid cases to caller handlers. */
export const resolveHttpProxyUrl = (params: {
  proxy: string | undefined
  onInvalidUrl: (value: string) => never
  onInvalidProtocol: (protocol: string) => never
}): string | undefined => {
  const trimmed = params.proxy?.trim()
  if (!trimmed) return undefined
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return params.onInvalidUrl(trimmed)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    return params.onInvalidProtocol(parsed.protocol)
  return parsed.toString()
}

/** Resolves a provider proxy URL and raises canonical preflight errors on invalid input. */
export const resolveProviderProxyUrl = (
  providerId: string,
  proxy: string | undefined,
): string | undefined =>
  resolveHttpProxyUrl({
    proxy,
    onInvalidUrl: (value) => {
      throw buildProviderPreflightError({
        providerId,
        message: `proxy is invalid: ${value}`,
      })
    },
    onInvalidProtocol: (protocol) => {
      throw buildProviderPreflightError({
        providerId,
        message: `proxy protocol is invalid: ${protocol}`,
      })
    },
  })
