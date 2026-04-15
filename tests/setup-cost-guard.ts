import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeEach } from 'vitest'

const COST_ENV_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENROUTER_API_KEY',
  'AICODING_API_KEY',
] as const

type CostEnvKey = (typeof COST_ENV_KEYS)[number]
type EnvSnapshot = Partial<Record<CostEnvKey, string>>

const originalFetch = globalThis.fetch
const originalHome = process.env.HOME
const originalUserProfile = process.env.USERPROFILE
const isolatedHomeDir = mkdtempSync(join(tmpdir(), 'mimikit-test-home-'))

process.env.HOME = isolatedHomeDir
process.env.USERPROFILE = isolatedHomeDir

const toFetchUrl = (input: Parameters<typeof fetch>[0]): string => {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

const isLoopbackFetchUrl = (value: string): boolean => {
  if (value.startsWith('/')) return true
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return true
  }
  return (
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1' ||
    parsed.hostname === '[::1]'
  )
}

const guardedFetch: typeof fetch = (input, init) => {
  const url = toFetchUrl(input)
  if (!isLoopbackFetchUrl(url)) {
    return Promise.reject(
      new Error(
        `external_fetch_blocked_in_tests:${url}. Mock fetch explicitly if this request is intentional.`,
      ),
    )
  }
  return originalFetch(input, init)
}

let envSnapshot: EnvSnapshot = {}

beforeEach(() => {
  envSnapshot = {}
  for (const key of COST_ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined) envSnapshot[key] = value
    delete process.env[key]
  }
  globalThis.fetch = guardedFetch
})

afterEach(() => {
  globalThis.fetch = guardedFetch
  for (const key of COST_ENV_KEYS) delete process.env[key]
  for (const key of COST_ENV_KEYS) {
    const value = envSnapshot[key]
    if (value !== undefined) process.env[key] = value
  }
})

afterAll(() => {
  globalThis.fetch = originalFetch
  if (originalHome !== undefined) process.env.HOME = originalHome
  else delete process.env.HOME
  if (originalUserProfile !== undefined)
    process.env.USERPROFILE = originalUserProfile
  else delete process.env.USERPROFILE
  rmSync(isolatedHomeDir, { recursive: true, force: true })
})
