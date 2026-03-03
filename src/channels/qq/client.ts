const QQ_TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken'
const TOKEN_EXPIRE_SKEW_MS = 30_000
const REQUEST_TIMEOUT_MS = 10_000

type QqClientConfig = { appId: string; appSecret: string; apiBase: string }
type QqTokenCacheEntry = { token: string; expiresAtMs: number }
type QqTokenResponse = {
  code?: number
  message?: string
  access_token?: string
  expires_in?: string | number
}
type QqSendResponse = { id?: string; timestamp?: number | string }
type QqApiError = { code?: number; message?: string; trace_id?: string }
type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; bodyText: string }

const tokenCache = new Map<string, QqTokenCacheEntry>()

const normalizeApiBase = (value: string): string =>
  value.endsWith('/') ? value.slice(0, -1) : value

const toExpiresInSeconds = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0)
    return Math.floor(value)
  if (typeof value !== 'string') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined
}

const fetchJson = async <T>(params: {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: string
  timeoutMs?: number
}): Promise<FetchResult<T>> => {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    params.timeoutMs ?? REQUEST_TIMEOUT_MS,
  )
  try {
    const response = await fetch(params.url, {
      method: params.method,
      headers: params.headers,
      body: params.body,
      signal: controller.signal,
    })
    const bodyText = await response.text()
    if (!response.ok) return { ok: false, status: response.status, bodyText }
    return { ok: true, data: JSON.parse(bodyText) as T }
  } finally {
    clearTimeout(timer)
  }
}

const buildCacheKey = (config: QqClientConfig): string =>
  `${config.appId}\n${config.appSecret}\n${config.apiBase}`

const fetchQqAccessToken = async (config: QqClientConfig): Promise<string> => {
  const response = await fetchJson<QqTokenResponse>({
    url: QQ_TOKEN_URL,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appId: config.appId, clientSecret: config.appSecret }),
  })
  if (!response.ok)
    throw new Error(`qq_token_http_${response.status}:${response.bodyText}`)
  const body = response.data
  if (body.code !== 0 || !body.access_token)
    throw new Error(`qq_token_api_${body.code ?? 'unknown'}:${body.message ?? 'unknown'}`)

  tokenCache.set(buildCacheKey(config), {
    token: body.access_token,
    expiresAtMs: Date.now() + (toExpiresInSeconds(body.expires_in) ?? 0) * 1000,
  })
  return body.access_token
}

const getQqAccessToken = async (config: QqClientConfig): Promise<string> => {
  const cached = tokenCache.get(buildCacheKey(config))
  if (cached && cached.expiresAtMs - Date.now() > TOKEN_EXPIRE_SKEW_MS)
    return cached.token
  return fetchQqAccessToken(config)
}

export const sendQqPassiveTextReply = async (params: {
  appId: string
  appSecret: string
  apiBase: string
  openid: string
  text: string
  msgId?: string
  eventId?: string
  msgSeq: number
}): Promise<{ messageId?: string }> => {
  const config: QqClientConfig = {
    appId: params.appId.trim(),
    appSecret: params.appSecret.trim(),
    apiBase: normalizeApiBase(params.apiBase.trim()),
  }
  const token = await getQqAccessToken(config)
  const response = await fetchJson<QqSendResponse | QqApiError>({
    url: `${config.apiBase}/v2/users/${encodeURIComponent(params.openid)}/messages`,
    method: 'POST',
    headers: {
      authorization: `QQBot ${token}`,
      'content-type': 'application/json',
      'x-union-appid': config.appId,
    },
    body: JSON.stringify({
      content: params.text,
      msg_type: 0,
      ...(params.msgId ? { msg_id: params.msgId } : {}),
      ...(params.eventId ? { event_id: params.eventId } : {}),
      msg_seq: params.msgSeq,
    }),
  })
  if (!response.ok)
    throw new Error(`qq_send_http_${response.status}:${response.bodyText}`)

  const data = response.data as QqSendResponse & QqApiError
  if (data.code !== undefined && data.code !== 0)
    throw new Error(`qq_send_api_${data.code}:${data.message ?? 'unknown'}`)
  return data.id ? { messageId: data.id } : {}
}
