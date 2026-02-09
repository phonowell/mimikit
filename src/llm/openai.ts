import { homedir } from 'node:os'
import { join } from 'node:path'

import { readJson } from '../fs/json.js'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type CodexSettings = {
  apiKey?: string
  model?: string
  baseUrl?: string
  wireApi?: string
  requiresOpenAiAuth?: boolean
}

export const HARDCODED_MODEL_REASONING_EFFORT: ModelReasoningEffort = 'high'

let cachedSettings: CodexSettings | null = null

const codexAuthPath = (): string => join(homedir(), '.codex', 'auth.json')

const envString = (key: string): string | undefined => {
  const value = process.env[key]
  if (!value) return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

const envBoolean = (key: string): boolean | undefined => {
  const value = envString(key)
  if (!value) return undefined
  if (/^(1|true|yes|on)$/i.test(value)) return true
  if (/^(0|false|no|off)$/i.test(value)) return false
  return undefined
}

const readAuthApiKey = async (): Promise<string | undefined> => {
  const auth = await readJson<{ OPENAI_API_KEY?: string }>(codexAuthPath(), {})
  if (typeof auth.OPENAI_API_KEY !== 'string') return undefined
  const key = auth.OPENAI_API_KEY.trim()
  return key || undefined
}

export const loadCodexSettings = async (): Promise<CodexSettings> => {
  if (cachedSettings) return cachedSettings

  const envModel = envString('OPENAI_MODEL')
  const envBaseUrl = envString('OPENAI_BASE_URL')
  const envWireApi = envString('OPENAI_WIRE_API')
  const envRequiresAuth = envBoolean('OPENAI_REQUIRES_AUTH')
  const apiKey = envString('OPENAI_API_KEY') ?? (await readAuthApiKey())

  if (apiKey && !process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = apiKey

  cachedSettings = {
    ...(apiKey ? { apiKey } : {}),
    ...(envModel ? { model: envModel } : {}),
    ...(envBaseUrl ? { baseUrl: envBaseUrl } : {}),
    ...(envWireApi ? { wireApi: envWireApi } : {}),
    ...(envRequiresAuth !== undefined
      ? { requiresOpenAiAuth: envRequiresAuth }
      : {}),
  }
  return cachedSettings
}

export const resolveOpenAiModel = async (model?: string): Promise<string> => {
  if (model) return model
  const settings = await loadCodexSettings()
  const resolved = settings.model
  if (!resolved) {
    throw new Error(
      '[llm] OpenAI model not configured. Set --model or OPENAI_MODEL.',
    )
  }
  return resolved
}
