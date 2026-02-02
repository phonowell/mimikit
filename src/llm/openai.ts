import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { readJson } from '../fs/json.js'
import { logSafeError } from '../log/safe.js'

type CodexAuth = {
  OPENAI_API_KEY?: string
}

type CodexConfig = {
  model?: string
  modelProvider?: string
  providers: Record<
    string,
    { baseUrl?: string; wireApi?: string; requiresOpenAiAuth?: boolean }
  >
  modelReasoningEffort?: string
}

type CodexSettings = {
  apiKey?: string
  model?: string
  baseUrl?: string
  wireApi?: string
  requiresOpenAiAuth?: boolean
  modelReasoningEffort?: string
}

let cachedSettings: CodexSettings | null = null

const codexDir = (): string => join(homedir(), '.codex')
const codexAuthPath = (): string => join(codexDir(), 'auth.json')
const codexConfigPath = (): string => join(codexDir(), 'config.toml')

const parseTomlValue = (raw: string): string | boolean | number | null => {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const slice = trimmed.slice(1, -1)
    if (trimmed.startsWith('"')) {
      try {
        return JSON.parse(trimmed) as string
      } catch (error) {
        console.warn('[llm] parseTomlValue JSON parse failed', error)
        return slice
      }
    }
    return slice
  }
  const num = Number(trimmed)
  if (Number.isFinite(num)) return num
  return trimmed
}

const parseCodexConfig = (raw: string): CodexConfig => {
  const config: CodexConfig = { providers: {} }
  let currentProvider: string | null = null
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed)
    if (sectionMatch) {
      const section = (sectionMatch[1] ?? '').trim()
      const providerMatch = /^model_providers\.([A-Za-z0-9_-]+)$/.exec(section)
      const providerKey = providerMatch?.[1] ?? null
      currentProvider = providerKey
      if (currentProvider && !config.providers[currentProvider])
        config.providers[currentProvider] = {}

      continue
    }
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const rawValue = trimmed.slice(eqIndex + 1).trim()
    const value = parseTomlValue(rawValue)
    if (currentProvider) {
      const provider =
        config.providers[currentProvider] ??
        (config.providers[currentProvider] = {})
      if (key === 'base_url' && typeof value === 'string')
        provider.baseUrl = value
      else if (key === 'wire_api' && typeof value === 'string')
        provider.wireApi = value
      else if (key === 'requires_openai_auth' && typeof value === 'boolean')
        provider.requiresOpenAiAuth = value
      continue
    }
    if (key === 'model' && typeof value === 'string') config.model = value
    if (key === 'model_provider' && typeof value === 'string')
      config.modelProvider = value
    if (key === 'model_reasoning_effort' && typeof value === 'string')
      config.modelReasoningEffort = value
  }
  return config
}

const readCodexConfig = async (): Promise<CodexConfig> => {
  try {
    const raw = await readFile(codexConfigPath(), 'utf8')
    return parseCodexConfig(raw)
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined
    if (code === 'ENOENT') return { providers: {} }
    await logSafeError('readCodexConfig', error, {
      meta: { path: codexConfigPath() },
    })
    return { providers: {} }
  }
}

export const loadCodexSettings = async (): Promise<CodexSettings> => {
  if (cachedSettings) return cachedSettings
  const settings: CodexSettings = {}
  if (process.env.OPENAI_API_KEY) settings.apiKey = process.env.OPENAI_API_KEY
  else {
    const auth = await readJson<CodexAuth>(codexAuthPath(), {})
    const key =
      typeof auth.OPENAI_API_KEY === 'string' && auth.OPENAI_API_KEY.trim()
        ? auth.OPENAI_API_KEY.trim()
        : undefined
    if (key) {
      settings.apiKey = key
      process.env.OPENAI_API_KEY = key
    }
  }

  const config = await readCodexConfig()
  if (process.env.OPENAI_MODEL) settings.model = process.env.OPENAI_MODEL
  else if (config.model) settings.model = config.model

  const provider = config.modelProvider
    ? config.providers[config.modelProvider]
    : undefined

  const baseUrl = process.env.OPENAI_BASE_URL ?? provider?.baseUrl
  if (baseUrl) settings.baseUrl = baseUrl

  const wireApi = process.env.OPENAI_WIRE_API ?? provider?.wireApi
  if (wireApi) settings.wireApi = wireApi

  if (provider?.requiresOpenAiAuth !== undefined)
    settings.requiresOpenAiAuth = provider.requiresOpenAiAuth

  if (config.modelReasoningEffort)
    settings.modelReasoningEffort = config.modelReasoningEffort

  cachedSettings = settings
  return settings
}

export const resolveOpenAiModel = async (model?: string): Promise<string> => {
  if (model) return model
  const settings = await loadCodexSettings()
  const resolved = settings.model ?? process.env.OPENAI_MODEL
  if (!resolved) {
    throw new Error(
      '[llm] OpenAI model not configured. Set --model or OPENAI_MODEL.',
    )
  }

  return resolved
}
