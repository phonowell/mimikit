import { describe, expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { applyCliEnvOverrides } from '../src/cli/env.js'

type ManagedEnvKey = 'MIMIKIT_EVOLVER_ENABLED'

const managedEnvKeys: ManagedEnvKey[] = ['MIMIKIT_EVOLVER_ENABLED']

const snapshotEnv = (): Record<ManagedEnvKey, string | undefined> =>
  Object.fromEntries(
    managedEnvKeys.map((key) => [key, process.env[key]] as const),
  ) as Record<ManagedEnvKey, string | undefined>

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

describe.sequential('evolver config', () => {
  test('default config keeps evolver disabled', async () => {
    await withManagedEnv(async () => {
      const config = defaultConfig({ stateDir: '.mimikit', workDir: process.cwd() })
      expect(config.evolver.enabled).toBe(false)
    })
  })

  test('env override can enable evolver loop', async () => {
    await withManagedEnv(async () => {
      process.env.MIMIKIT_EVOLVER_ENABLED = 'true'
      const config = defaultConfig({ stateDir: '.mimikit', workDir: process.cwd() })
      applyCliEnvOverrides(config)
      expect(config.evolver.enabled).toBe(true)
    })
  })

  test('env override can disable evolver loop', async () => {
    await withManagedEnv(async () => {
      process.env.MIMIKIT_EVOLVER_ENABLED = 'false'
      const config = defaultConfig({ stateDir: '.mimikit', workDir: process.cwd() })
      config.evolver.enabled = true
      applyCliEnvOverrides(config)
      expect(config.evolver.enabled).toBe(false)
    })
  })

  test('env override accepts 1/0 for evolver enabled', async () => {
    await withManagedEnv(async () => {
      process.env.MIMIKIT_EVOLVER_ENABLED = '1'
      const enabledConfig = defaultConfig({
        stateDir: '.mimikit',
        workDir: process.cwd(),
      })
      applyCliEnvOverrides(enabledConfig)
      expect(enabledConfig.evolver.enabled).toBe(true)

      process.env.MIMIKIT_EVOLVER_ENABLED = '0'
      const disabledConfig = defaultConfig({
        stateDir: '.mimikit',
        workDir: process.cwd(),
      })
      disabledConfig.evolver.enabled = true
      applyCliEnvOverrides(disabledConfig)
      expect(disabledConfig.evolver.enabled).toBe(false)
    })
  })
})
