import { homedir } from 'node:os'
import { join } from 'node:path'

import TOML from '@iarna/toml'
import read from 'fire-keeper/read'

import { readJson } from '../fs/json.js'
import { safe } from '../log/safe.js'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type CodexSettings = {
  apiKey?: string
  model?: string
  baseUrl?: string
  wireApi?: string
  requiresOpenAiAuth?: boolean
}

export const HARDCODED_MODEL_REASONING_EFFORT: ModelReasoningEffort = 'high'

const envString = (key: string): string | undefined => {
  const value = process.env[key]
  if (!value) return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

const resolveHomeDir = (): string =>
  envString('HOME') ?? envString('USERPROFILE') ?? homedir()

const codexAuthPath = (): string =>
  join(resolveHomeDir(), '.codex', 'auth.json')

const codexConfigPath = (): string =>
  join(resolveHomeDir(), '.codex', 'config.toml')

const envBoolean = (key: string): boolean | undefined => {
  const value = envString(key)
  if (!value) return undefined
  if (/^(1|true|yes|on)$/i.test(value)) return true
  if (/^(0|false|no|off)$/i.test(value)) return false
  return undefined
}

const valueString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized : undefined
}

const valueBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (/^(1|true|yes|on)$/i.test(value)) return true
    if (/^(0|false|no|off)$/i.test(value)) return false
  }
  return undefined
}

const valueRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  return value as Record<string, unknown>
}

const readCodexConfig = async (): Promise<Record<string, unknown>> => {
  const path = codexConfigPath()
  const raw = await safe(
    'readCodexConfig: readFile',
    () => read(path, { raw: true }),
    { fallback: null, meta: { path }, ignoreCodes: ['ENOENT'] },
  )
  if (!raw) return {}
  const text =
    typeof raw === 'string'
      ? raw
      : Buffer.isBuffer(raw)
        ? raw.toString('utf8')
        : ''
  if (!text.trim()) return {}
  const parsed = await safe(
    'readCodexConfig: parseToml',
    () => TOML.parse(text) as Record<string, unknown>,
    { meta: { path } },
  )
  return valueRecord(parsed) ?? {}
}

const resolveProviderSettings = (
  config: Record<string, unknown>,
): Pick<
  CodexSettings,
  'model' | 'baseUrl' | 'wireApi' | 'requiresOpenAiAuth'
> => {
  const model = valueString(config.model)
  const providerName = valueString(config.model_provider)
  const providerMap = valueRecord(config.model_providers)
  const providerConfig =
    providerName && providerMap
      ? valueRecord(providerMap[providerName])
      : undefined
  const baseUrl = valueString(providerConfig?.base_url)
  const wireApi = valueString(providerConfig?.wire_api)
  const requiresOpenAiAuth = valueBoolean(providerConfig?.requires_openai_auth)

  return {
    ...(model ? { model } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(wireApi ? { wireApi } : {}),
    ...(requiresOpenAiAuth !== undefined ? { requiresOpenAiAuth } : {}),
  }
}

const readAuthApiKey = async (): Promise<string | undefined> => {
  const auth = await readJson<{ OPENAI_API_KEY?: string }>(codexAuthPath(), {})
  if (typeof auth.OPENAI_API_KEY !== 'string') return undefined
  const key = auth.OPENAI_API_KEY.trim()
  return key || undefined
}

export const loadCodexSettings = async (): Promise<CodexSettings> => {
  const config = await readCodexConfig()
  const configSettings = resolveProviderSettings(config)
  const envModel = envString('OPENAI_MODEL')
  const envBaseUrl = envString('OPENAI_BASE_URL')
  const envWireApi = envString('OPENAI_WIRE_API')
  const envRequiresAuth = envBoolean('OPENAI_REQUIRES_AUTH')
  const apiKey = envString('OPENAI_API_KEY') ?? (await readAuthApiKey())

  return {
    ...(apiKey ? { apiKey } : {}),
    ...(envModel
      ? { model: envModel }
      : configSettings.model
        ? { model: configSettings.model }
        : {}),
    ...(envBaseUrl
      ? { baseUrl: envBaseUrl }
      : configSettings.baseUrl
        ? { baseUrl: configSettings.baseUrl }
        : {}),
    ...(envWireApi
      ? { wireApi: envWireApi }
      : configSettings.wireApi
        ? { wireApi: configSettings.wireApi }
        : {}),
    ...(envRequiresAuth !== undefined
      ? { requiresOpenAiAuth: envRequiresAuth }
      : configSettings.requiresOpenAiAuth !== undefined
        ? { requiresOpenAiAuth: configSettings.requiresOpenAiAuth }
        : {}),
  }
}

export const resolveOpenAiModel = async (
  model?: string,
  settings?: CodexSettings,
): Promise<string> => {
  if (model) return model
  const resolvedSettings = settings ?? (await loadCodexSettings())
  const resolved = resolvedSettings.model
  if (!resolved) {
    throw new Error(
      '[llm] OpenAI model not configured. Set --model or OPENAI_MODEL.',
    )
  }
  return resolved
}
