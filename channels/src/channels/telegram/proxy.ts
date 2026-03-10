import { HttpsProxyAgent } from 'https-proxy-agent'

const trimToUndefined = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const normalizeProxyUrl = (value: string): string => {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new Error('unsupported_protocol')

    return url.toString()
  } catch {
    throw new Error(`telegram_proxy_invalid_url:${value}`)
  }
}

const resolveProxyUrl = (configProxy: string): string | undefined => {
  const configured = trimToUndefined(configProxy)
  if (configured) return normalizeProxyUrl(configured)
  const envProxy = trimToUndefined(process.env.TELEGRAM_PROXY)
  if (!envProxy) return undefined
  return normalizeProxyUrl(envProxy)
}

export const resolveTelegramProxy = (
  configProxy: string,
): {
  proxyUrl?: string
  proxyAgent?: HttpsProxyAgent<string>
} => {
  const proxyUrl = resolveProxyUrl(configProxy)
  if (!proxyUrl) return {}
  return {
    proxyUrl,
    proxyAgent: new HttpsProxyAgent(proxyUrl),
  }
}
