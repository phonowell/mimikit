import { shortId } from '../../foundation/shared/utils.js'
import { Orchestrator } from '../../kernel/orchestrator/orchestrator-service.js'
import { setRuntimeReaperBridge } from '../../kernel/runtime/reaper-bridge.js'
import { createRuntimeReaperHandle } from '../../kernel/runtime/reaper.js'
import { buildRuntimeStartupLogEntry } from '../../kernel/shared/runtime-startup.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import {
  closeHttpServer as closeRuntimeHttpServer,
  createHttpServer,
} from '../../surface/http/index.js'

import { acquireRuntimeLock } from './runtime-lock.js'
import { resolveRuntimeStartupInfo } from './runtime-startup-info.js'

import type { StatePaths } from '../../persistence/fs/paths.js'
import type { AppConfig } from '../config.js'
import type { FastifyInstance } from 'fastify'

type ShutdownOptions = {
  skipPersist?: boolean
}

type ShutdownFn = (
  reason: string,
  code?: number,
  options?: ShutdownOptions,
) => void

type RunCliCycleParams = {
  config: AppConfig
  workDir: string
  paths: StatePaths
  port: number | null
  onShutdownReady: (shutdown: ShutdownFn) => void
  onReady?: () => void
}

export const runCliCycle = async (
  params: RunCliCycleParams,
): Promise<number> => {
  const runtimeId =
    process.pid > 0
      ? `runtime-${process.pid}-${shortId()}`
      : `runtime-main-${shortId()}`
  const startup = resolveRuntimeStartupInfo()
  console.log(`[cli:runtime] acquiring runtime lock for ${params.workDir}`)
  const runtimeLock = await acquireRuntimeLock(params.workDir)
  console.log(`[cli:runtime] runtime lock acquired: ${runtimeLock.path}`)
  await bestEffort('appendLog: runtime_startup', () =>
    appendLog(
      params.paths.log,
      buildRuntimeStartupLogEntry({
        runtimeId,
        startup,
      }),
    ),
  )
  const runtimeReaper = await createRuntimeReaperHandle({
    runtimeId,
    paths: params.paths,
    runtimeLock,
    port: params.port,
    logPath: params.paths.log,
  })
  await runtimeReaper.startHeartbeat()
  setRuntimeReaperBridge({
    onRuntimeChildStarted: (child) =>
      runtimeReaper.registerChild({
        id: child.id,
        kind: child.kind,
        pid: child.pid,
        ...(child.meta ? { meta: child.meta } : {}),
      }),
    onRuntimeChildStopped: (id) => runtimeReaper.unregisterChild(id),
  })

  let httpServer: FastifyInstance | null = null
  let resolveExit: ((code: number) => void) | null = null
  const exitPromise = new Promise<number>((resolve) => {
    resolveExit = resolve
  })
  let shutdownPromise: Promise<number> | null = null

  const finish = (code: number): number => {
    resolveExit?.(code)
    return code
  }

  const orchestrator = new Orchestrator(params.config, {
    runtimeId,
    startup,
    onExitRequested: ({ code, reason, skipPersist }) => {
      void shutdown(`orchestrator exit requested: ${reason}`, code, {
        skipPersist: reason === 'http_api_reset' || skipPersist === true,
      })
    },
  })

  const shutdown = (
    reason: string,
    code = 0,
    options?: ShutdownOptions,
  ): Promise<number> => {
    if (shutdownPromise) return shutdownPromise
    shutdownPromise = (async () => {
      console.log(`\n[cli] ${reason}`)
      console.log(`[cli:runtime] shutdown begin: code=${code}`)
      console.log('[cli:runtime] closeHttpServer begin')
      await bestEffort(
        'cli:stop_http_server',
        () => (httpServer ? closeRuntimeHttpServer(httpServer) : undefined),
        {
          meta: { reason },
        },
      )
      console.log('[cli:runtime] closeHttpServer done')
      await bestEffort('cli:stop_runtime_reaper_heartbeat', () =>
        runtimeReaper.stopHeartbeat(),
      )
      setRuntimeReaperBridge(null)
      await bestEffort(
        'cli:release_runtime_lock',
        () => runtimeLock.release(),
        {
          meta: { reason },
        },
      )
      console.log('[cli:runtime] runtime lock released')
      if (!options?.skipPersist) {
        console.log('[cli:runtime] stopAndPersist begin')
        await bestEffort(
          'cli:stop_and_persist',
          () => orchestrator.stopAndPersist(),
          {
            meta: { reason },
          },
        )
        console.log('[cli:runtime] stopAndPersist done')
      }
      return finish(code)
    })()
    return shutdownPromise
  }

  params.onShutdownReady((reason, code = 0) => {
    void shutdown(reason, code)
  })

  try {
    console.log(`[cli:runtime] orchestrator.start begin: ${runtimeId}`)
    await orchestrator.start()
    console.log(`[cli:runtime] orchestrator.start done: ${runtimeId}`)
    if (!params.config.webui.enabled)
      console.log('[cli] webui disabled by config: webui.enabled=false')
    else if (params.port !== null) {
      console.log(`[cli:runtime] createHttpServer begin: port=${params.port}`)
      httpServer = await createHttpServer(
        orchestrator,
        params.config,
        params.port,
      )
      console.log(`[cli:runtime] createHttpServer done: port=${params.port}`)
    }
    params.onReady?.()
    console.log(`[cli:runtime] ready: ${runtimeId}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return shutdown(`startup failed: ${message}`, 1)
  }

  return exitPromise
}
