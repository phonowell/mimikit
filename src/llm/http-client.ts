export class HttpError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

export const normalizeBaseUrl = (value: string): string => {
  const trimmed = value.replace(/\/+$/, '')
  if (trimmed.endsWith('/v1')) return trimmed
  return `${trimmed}/v1`
}

export const extractChatText = (response: unknown): string => {
  if (response && typeof response === 'object') {
    const { choices } = response as { choices?: unknown }
    if (Array.isArray(choices)) {
      const texts: string[] = []
      for (const choice of choices) {
        if (!choice || typeof choice !== 'object') continue
        const { message } = choice as { message?: unknown }
        if (message && typeof message === 'object') {
          const { content } = message as { content?: unknown }
          if (typeof content === 'string') texts.push(content)
        }
      }
      return texts.join('\n').trim()
    }
  }
  return ''
}

export const requestJson = async (
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  controller: AbortController | null,
): Promise<Record<string, unknown>> => {
  const init: RequestInit = {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  }
  if (controller) init.signal = controller.signal
  const response = await fetch(url, init)
  const body = await response.text()
  if (!response.ok) {
    const snippet = body.length > 500 ? `${body.slice(0, 500)}...` : body
    throw new HttpError(response.status, snippet)
  }
  if (!body) return {}
  try {
    return JSON.parse(body) as Record<string, unknown>
  } catch {
    throw new HttpError(response.status, `invalid_json ${body.slice(0, 200)}`)
  }
}

export type ChatUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export const formatLlmError = (prefix: string, err: unknown): string => {
  if (!err) return `${prefix} failed`
  if (err instanceof Error) {
    const anyErr = err as Error & {
      status?: number
      error?: { message?: string; type?: string; code?: string; param?: string }
      body?: string
    }
    const parts: string[] = []
    if (typeof anyErr.status === 'number') parts.push(`status ${anyErr.status}`)
    if (anyErr.error?.message) parts.push(anyErr.error.message)
    if (anyErr.error?.type) parts.push(`type ${anyErr.error.type}`)
    if (anyErr.error?.code) parts.push(`code ${anyErr.error.code}`)
    if (anyErr.error?.param) parts.push(`param ${anyErr.error.param}`)
    if (anyErr.body) parts.push(`body ${anyErr.body}`)
    if (parts.length > 0) return `${prefix} failed: ${parts.join(', ')}`
    if (err.message) return `${prefix} failed: ${err.message}`
  }
  return `${prefix} failed: ${String(err)}`
}
