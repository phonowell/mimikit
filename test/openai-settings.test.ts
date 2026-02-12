import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { loadCodexSettings } from '../src/providers/openai-settings.js'

type ManagedEnvKey =
  | 'HOME'
  | 'OPENAI_MODEL'
  | 'OPENAI_BASE_URL'
  | 'OPENAI_WIRE_API'
  | 'OPENAI_REQUIRES_AUTH'
  | 'OPENAI_API_KEY'

const managedEnvKeys: ManagedEnvKey[] = [
  'HOME',
  'OPENAI_MODEL',
  'OPENAI_BASE_URL',
  'OPENAI_WIRE_API',
  'OPENAI_REQUIRES_AUTH',
  'OPENAI_API_KEY',
]

const snapshotEnv = (): Record<ManagedEnvKey, string | undefined> => {
  const entries = managedEnvKeys.map((key) => [key, process.env[key]] as const)
  return Object.fromEntries(entries) as Record<ManagedEnvKey, string | undefined>
}

const clearManagedEnv = (): void => {
  for (const key of managedEnvKeys) delete process.env[key]
}

const restoreEnv = (snapshot: Record<ManagedEnvKey, string | undefined>): void => {
  for (const key of managedEnvKeys) {
    const value = snapshot[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

const withManagedEnv = async (run: () => Promise<void>): Promise<void> => {
  const snapshot = snapshotEnv()
  try {
    clearManagedEnv()
    await run()
  } finally {
    restoreEnv(snapshot)
  }
}

const writeCodexFiles = async (params: {
  homeDir: string
  configToml: string
  authJson: string
}): Promise<void> => {
  const codexDir = join(params.homeDir, '.codex')
  await mkdir(codexDir, { recursive: true })
  await writeFile(join(codexDir, 'config.toml'), params.configToml, 'utf8')
  await writeFile(join(codexDir, 'auth.json'), params.authJson, 'utf8')
}

const createHomeDir = (): Promise<string> =>
  mkdtemp(join(tmpdir(), 'mimikit-openai-settings-'))

describe.sequential('loadCodexSettings', () => {
  test('reads ~/.codex/config.toml on every call', async () => {
    await withManagedEnv(async () => {
      const homeDir = await createHomeDir()
      process.env.HOME = homeDir
      await writeCodexFiles({
        homeDir,
        configToml: [
          'model_provider = "right"',
          'model = "model-from-config-v1"',
          '',
          '[model_providers.right]',
          'base_url = "https://api-v1.example.com"',
          'wire_api = "responses"',
          'requires_openai_auth = false',
          '',
        ].join('\n'),
        authJson: JSON.stringify({ OPENAI_API_KEY: 'key-from-auth-v1' }),
      })

      const first = await loadCodexSettings()
      expect(first.model).toBe('model-from-config-v1')
      expect(first.baseUrl).toBe('https://api-v1.example.com')
      expect(first.wireApi).toBe('responses')
      expect(first.requiresOpenAiAuth).toBe(false)
      expect(first.apiKey).toBe('key-from-auth-v1')

      await writeCodexFiles({
        homeDir,
        configToml: [
          'model_provider = "right"',
          'model = "model-from-config-v2"',
          '',
          '[model_providers.right]',
          'base_url = "https://api-v2.example.com"',
          'wire_api = "chat_completions"',
          'requires_openai_auth = true',
          '',
        ].join('\n'),
        authJson: JSON.stringify({ OPENAI_API_KEY: 'key-from-auth-v2' }),
      })

      const second = await loadCodexSettings()
      expect(second.model).toBe('model-from-config-v2')
      expect(second.baseUrl).toBe('https://api-v2.example.com')
      expect(second.wireApi).toBe('chat_completions')
      expect(second.requiresOpenAiAuth).toBe(true)
      expect(second.apiKey).toBe('key-from-auth-v2')
    })
  })

  test('env variables override ~/.codex settings', async () => {
    await withManagedEnv(async () => {
      const homeDir = await createHomeDir()
      process.env.HOME = homeDir
      await writeCodexFiles({
        homeDir,
        configToml: [
          'model_provider = "right"',
          'model = "model-from-config"',
          '',
          '[model_providers.right]',
          'base_url = "https://api-config.example.com"',
          'wire_api = "responses"',
          'requires_openai_auth = true',
          '',
        ].join('\n'),
        authJson: JSON.stringify({ OPENAI_API_KEY: 'key-from-auth' }),
      })

      process.env.OPENAI_MODEL = 'model-from-env'
      process.env.OPENAI_BASE_URL = 'https://api-env.example.com'
      process.env.OPENAI_WIRE_API = 'chat_completions'
      process.env.OPENAI_REQUIRES_AUTH = 'false'
      process.env.OPENAI_API_KEY = 'key-from-env'

      const settings = await loadCodexSettings()
      expect(settings.model).toBe('model-from-env')
      expect(settings.baseUrl).toBe('https://api-env.example.com')
      expect(settings.wireApi).toBe('chat_completions')
      expect(settings.requiresOpenAiAuth).toBe(false)
      expect(settings.apiKey).toBe('key-from-env')
    })
  })
})
