import { runCliCycle } from './runtime-cycle.js'

import type { StatePaths } from '../../persistence/fs/paths.js'
import type { AppConfig } from '../config.js'

export const RUNTIME_CHILD_ENV = 'MIMIKIT_RUNTIME_CHILD'

export const runRuntimeChild = async (params: {
  config: AppConfig
  workDir: string
  paths: StatePaths
  targetPort: number
}): Promise<never> => {
  let requestShutdown: ((reason: string, code?: number) => void) | null = null

  process.on('SIGINT', () => {
    requestShutdown?.('shutting down...')
  })
  process.on('SIGTERM', () => {
    requestShutdown?.('received SIGTERM, shutting down...')
  })

  const listenPort: number | null = params.config.webui.enabled
    ? params.targetPort
    : null
  try {
    const exitCode = await runCliCycle({
      config: params.config,
      workDir: params.workDir,
      paths: params.paths,
      port: listenPort,
      onShutdownReady: (shutdown) => {
        requestShutdown = shutdown
      },
      onReady: () => {
        if (typeof process.send === 'function') process.send({ type: 'ready' })
      },
    })
    process.exit(exitCode)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[cli:runtime] startup failed: ${message}`)
    process.exit(1)
  }
}
