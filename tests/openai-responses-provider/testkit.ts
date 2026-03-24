import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach } from 'vitest'

const ENV_KEYS = [
  'HOME',
  'USERPROFILE',
  'OPENAI_API_KEY',
  'AICODING_API_KEY',
] as const

type EnvSnapshot = Partial<Record<(typeof ENV_KEYS)[number], string>>

export const createHomeDir = async (): Promise<string> =>
  mkdtemp(join(tmpdir(), 'mimikit-openai-responses-provider-'))

export const writeCodexConfig = async (homeDir: string): Promise<void> => {
  const codexDir = join(homeDir, '.codex')
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    join(codexDir, 'config.toml'),
    [
      'model_provider = "aicoding"',
      '',
      '[model_providers.aicoding]',
      'base_url = "https://your-codex-provider.example.com/v1/codex"',
      'wire_api = "responses"',
      'env_key = "AICODING_API_KEY"',
      '',
    ].join('\n'),
    'utf8',
  )
}

let envSnapshot: EnvSnapshot = {}
const createdHomeDirs: string[] = []
const originalFetch = globalThis.fetch

export const trackHomeDir = (dir: string): void => {
  createdHomeDirs.push(dir)
}

beforeEach(() => {
  envSnapshot = {}
  for (const key of ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) envSnapshot[key] = value
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key]
  for (const key of ENV_KEYS) {
    const value = envSnapshot[key]
    if (value !== undefined) process.env[key] = value
  }
  globalThis.fetch = originalFetch
})

afterEach(async () => {
  await Promise.all(
    createdHomeDirs.splice(0).map(async (dir) => {
      await rm(dir, { recursive: true, force: true })
    }),
  )
})
