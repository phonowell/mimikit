import { describe, expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { applyCliEnvOverrides } from '../src/cli/env.js'

type ManagedEnvKey =
  | 'MIMIKIT_MODEL'
  | 'MIMIKIT_MANAGER_MODEL'
  | 'MIMIKIT_WORKER_STANDARD_MODEL'
  | 'MIMIKIT_WORKER_SPECIALIST_MODEL'

const managedEnvKeys: ManagedEnvKey[] = [
  'MIMIKIT_MODEL',
  'MIMIKIT_MANAGER_MODEL',
  'MIMIKIT_WORKER_STANDARD_MODEL',
  'MIMIKIT_WORKER_SPECIALIST_MODEL',
]

const snapshotEnv = (): Record<ManagedEnvKey, string | undefined> =>
  Object.fromEntries(
    managedEnvKeys.map((key) => [key, process.env[key]] as const),
  ) as Record<ManagedEnvKey, string | undefined>

const clearManagedEnv = (): void => {
  for (const key of managedEnvKeys) delete process.env[key]
}

const restoreEnv = (
  snapshot: Record<ManagedEnvKey, string | undefined>,
): void => {
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

describe.sequential('cli env model overrides', () => {
  test('MIMIKIT_MODEL only overrides manager model', async () => {
    await withManagedEnv(async () => {
      process.env.MIMIKIT_MODEL = 'gpt-5.4-manager'
      const config = defaultConfig({ stateDir: '.mimikit', workDir: process.cwd() })
      applyCliEnvOverrides(config)

      expect(config.manager.model).toBe('gpt-5.4-manager')
      expect(config.worker.standard.model).toBe('opencode/big-pickle')
      expect(config.worker.specialist.model).toBe('gpt-5.3-codex-high')
    })
  })
})
