import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { loadCodexSettings } from '../src/providers/openai-settings.js'

const ENV_KEYS = [
  'HOME',
  'USERPROFILE',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_BASE_URL',
  'OPENAI_WIRE_API',
  'OPENAI_REQUIRES_AUTH',
  'AICODING_API_KEY',
] as const

type Snapshot = Partial<Record<(typeof ENV_KEYS)[number], string>>

const createHomeDir = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), 'mimikit-openai-settings-'))

const writeCodexConfig = async (
  homeDir: string,
  source: string,
): Promise<void> => {
  const codexDir = join(homeDir, '.codex')
  await mkdir(codexDir, { recursive: true })
  await writeFile(join(codexDir, 'config.toml'), source, 'utf8')
}

const writeCodexAuth = async (homeDir: string, apiKey: string): Promise<void> => {
  const codexDir = join(homeDir, '.codex')
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    join(codexDir, 'auth.json'),
    JSON.stringify({ OPENAI_API_KEY: apiKey }),
    'utf8',
  )
}

let snapshot: Snapshot = {}
const createdHomeDirs: string[] = []

beforeEach(() => {
  snapshot = {}
  for (const key of ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) snapshot[key] = value
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  for (const key of ENV_KEYS) {
    const value = snapshot[key]
    if (value !== undefined) process.env[key] = value
  }
})

afterEach(async () => {
  await Promise.all(
    createdHomeDirs.splice(0).map(async (dir) => {
      await rm(dir, { recursive: true, force: true })
    }),
  )
})

test('loads api key from active provider env_key when OPENAI_API_KEY is missing', async () => {
  const homeDir = await createHomeDir()
  createdHomeDirs.push(homeDir)
  await writeCodexConfig(
    homeDir,
    `
model_provider = "aicoding"
[model_providers.aicoding]
base_url = "http://api-ai-coding.bilibili.co/api/v1/codex"
wire_api = "responses"
env_key = "AICODING_API_KEY"
`,
  )
  process.env.HOME = homeDir
  process.env.AICODING_API_KEY = 'provider-env-key'

  const settings = await loadCodexSettings()

  expect(settings).toMatchObject({
    apiKey: 'provider-env-key',
    baseUrl: 'http://api-ai-coding.bilibili.co/api/v1/codex',
    wireApi: 'responses',
  })
})

test('prefers provider api_key over env_key and OPENAI_API_KEY', async () => {
  const homeDir = await createHomeDir()
  createdHomeDirs.push(homeDir)
  await writeCodexConfig(
    homeDir,
    `
model_provider = "aicoding"
[model_providers.aicoding]
api_key = "provider-config-key"
env_key = "AICODING_API_KEY"
`,
  )
  process.env.HOME = homeDir
  process.env.AICODING_API_KEY = 'provider-env-key'
  process.env.OPENAI_API_KEY = 'openai-env-key'

  const settings = await loadCodexSettings()

  expect(settings.apiKey).toBe('provider-config-key')
})

test('falls back to OPENAI_API_KEY when provider key config is absent', async () => {
  const homeDir = await createHomeDir()
  createdHomeDirs.push(homeDir)
  await writeCodexConfig(
    homeDir,
    `
model_provider = "aicoding"
[model_providers.aicoding]
base_url = "http://api-ai-coding.bilibili.co/api/v1/codex"
`,
  )
  process.env.HOME = homeDir
  process.env.OPENAI_API_KEY = 'openai-env-key'

  const settings = await loadCodexSettings()

  expect(settings.apiKey).toBe('openai-env-key')
})

test('falls back to ~/.codex/auth.json when envs are absent', async () => {
  const homeDir = await createHomeDir()
  createdHomeDirs.push(homeDir)
  await writeCodexConfig(
    homeDir,
    `
model_provider = "aicoding"
[model_providers.aicoding]
base_url = "http://api-ai-coding.bilibili.co/api/v1/codex"
`,
  )
  await writeCodexAuth(homeDir, 'auth-json-key')
  process.env.HOME = homeDir

  const settings = await loadCodexSettings()

  expect(settings.apiKey).toBe('auth-json-key')
})

test('supports api_key_env alias from active provider config', async () => {
  const homeDir = await createHomeDir()
  createdHomeDirs.push(homeDir)
  await writeCodexConfig(
    homeDir,
    `
model_provider = "aicoding"
[model_providers.aicoding]
api_key_env = "AICODING_API_KEY"
`,
  )
  process.env.HOME = homeDir
  process.env.AICODING_API_KEY = 'provider-env-alias-key'

  const settings = await loadCodexSettings()

  expect(settings.apiKey).toBe('provider-env-alias-key')
})
