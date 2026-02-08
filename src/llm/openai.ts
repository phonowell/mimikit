import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import * as toml from '@iarna/toml'

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
}

type CodexSettings = {
  apiKey?: string
  model?: string
  baseUrl?: string
  wireApi?: string
  requiresOpenAiAuth?: boolean
}

import type { ModelReasoningEffort } from '@openai/codex-sdk'

let cachedSettings: CodexSettings | null = null

export const HARDCODED_MODEL_REASONING_EFFORT: ModelReasoningEffort = 'high'

const codexDir = (): string => join(homedir(), '.codex')
const codexAuthPath = (): string => join(codexDir(), 'auth.json')
const codexConfigPath = (): string => join(codexDir(), 'config.toml')

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

const parseCodexConfig = (raw: string): CodexConfig => {
  const parsed = asRecord(toml.parse(raw)) ?? {}
  const config: CodexConfig = { providers: {} }
  if (typeof parsed.model === 'string') config.model = parsed.model
  if (typeof parsed.model_provider === 'string')
    config.modelProvider = parsed.model_provider

  const providers = asRecord(parsed.model_providers)
  if (providers) {
    for (const [key, value] of Object.entries(providers)) {
      const entry = asRecord(value)
      if (!entry) continue
      const provider: {
        baseUrl?: string
        wireApi?: string
        requiresOpenAiAuth?: boolean
      } = {}
      if (typeof entry.base_url === 'string') provider.baseUrl = entry.base_url
      if (typeof entry.wire_api === 'string') provider.wireApi = entry.wire_api
      if (typeof entry.requires_openai_auth === 'boolean')
        provider.requiresOpenAiAuth = entry.requires_openai_auth
      config.providers[key] = provider
    }
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
