import { homedir } from 'node:os'
import { join } from 'node:path'

import TOML from '@iarna/toml'

import { readJson } from '../fs/json.js'
import { readTextFileIfExists } from '../fs/read-text.js'
import { safe } from '../log/safe.js'
import { stripUndefined } from '../shared/utils.js'

import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type CodexSettings = {
  apiKey?: string
  model?: string
  baseUrl?: string
  wireApi?: string
  requiresOpenAiAuth?: boolean
}

export const HARDCODED_MODEL_REASONING_EFFORT: ModelReasoningEffort = 'high'

const readNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

const readBooleanFlag = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  if (/^(1|true|yes|on)$/i.test(normalized)) return true
  if (/^(0|false|no|off)$/i.test(normalized)) return false
  return undefined
}

const envString = (key: string): string | undefined =>
  readNonEmptyString(process.env[key])

const envBoolean = (key: string): boolean | undefined =>
  readBooleanFlag(envString(key))

const resolveHomeDir = (): string =>
  envString('HOME') ?? envString('USERPROFILE') ?? homedir()

const codexAuthPath = (): string =>
  join(resolveHomeDir(), '.codex', 'auth.json')

const codexConfigPath = (): string =>
  join(resolveHomeDir(), '.codex', 'config.toml')

const valueRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  return value as Record<string, unknown>
}

const readCodexConfig = async (): Promise<Record<string, unknown>> => {
  const path = codexConfigPath()
  const text = await safe(
    'readCodexConfig: readFile',
    () => readTextFileIfExists(path),
    { fallback: '', meta: { path } },
  )
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
  const model = readNonEmptyString(config.model)
  const providerName = readNonEmptyString(config.model_provider)
  const providerMap = valueRecord(config.model_providers)
  const providerConfig =
    providerName && providerMap
      ? valueRecord(providerMap[providerName])
      : undefined
  const baseUrl = readNonEmptyString(providerConfig?.base_url)
  const wireApi = readNonEmptyString(providerConfig?.wire_api)
  const requiresOpenAiAuth = readBooleanFlag(
    providerConfig?.requires_openai_auth,
  )

  return stripUndefined({ model, baseUrl, wireApi, requiresOpenAiAuth })
}

const readAuthApiKey = async (): Promise<string | undefined> => {
  const auth = await readJson<{ OPENAI_API_KEY?: string }>(codexAuthPath(), {})
  return readNonEmptyString(auth.OPENAI_API_KEY)
}

export const loadCodexSettings = async (): Promise<CodexSettings> => {
  const config = await readCodexConfig()
  const cs = resolveProviderSettings(config)
  const apiKey = envString('OPENAI_API_KEY') ?? (await readAuthApiKey())
  return stripUndefined({
    apiKey,
    model: envString('OPENAI_MODEL') ?? cs.model,
    baseUrl: envString('OPENAI_BASE_URL') ?? cs.baseUrl,
    wireApi: envString('OPENAI_WIRE_API') ?? cs.wireApi,
    requiresOpenAiAuth:
      envBoolean('OPENAI_REQUIRES_AUTH') ?? cs.requiresOpenAiAuth,
  })
}
