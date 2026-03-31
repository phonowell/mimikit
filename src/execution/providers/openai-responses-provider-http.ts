import { readResponsesErrorMessage } from './openai-responses-provider-parse.js'

export const buildHttpErrorMessage = (status: number, raw: string): string => {
  const message = readResponsesErrorMessage(raw)
  if (message) return `responses_http_${status}:${message}`
  const preview = raw.trim().slice(0, 280)
  return `responses_http_${status}:${preview}`
}

export const isRetryableInvalidApiKey401 = (message: string): boolean =>
  /responses_http_401:.*invalid api key/i.test(message)
