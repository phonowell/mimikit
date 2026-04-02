import { bestEffort, logSafeError } from '../../persistence/log/safe.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'

const TELEGRAM_POLLING_RETRY_DELAY_MS = 10_000
type ChannelRestartResult = 'scheduled' | 'busy' | 'already_scheduled'

type AddUserInput = (
  text: string,
  meta?: UserMeta,
  quote?: string,
) => Promise<string>

type RequestRestart = (
  reason: string,
) => ChannelRestartResult | Promise<ChannelRestartResult>

export const isTelegramPollingConflictError = (error: unknown): boolean => {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error)
  return (
    message.includes('telegram_polling_start_failed:409') ||
    (message.includes('conflict') && message.includes('getupdates'))
  )
}

export const createTelegramChannelLifecycle = (params: {
  runtime: RuntimeState
  addUserInput: AddUserInput
  requestRestart: RequestRestart
}) => {
  let startPromise: Promise<void> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const clearRetryTimer = (): void => {
    if (!retryTimer) return
    clearTimeout(retryTimer)
    retryTimer = null
  }

  const startPollingIfEnabled = async (): Promise<void> => {
    if (!params.runtime.config.telegram.enabled) return
    const { startTelegramPolling } =
      await import('../../surface/channels/telegram/polling.js')
    await startTelegramPolling({
      config: params.runtime.config,
      logPath: params.runtime.paths.log,
      workDir: params.runtime.config.workDir,
      addUserInput: (text: string, meta?: UserMeta, quote?: string) =>
        params.addUserInput(text, meta, quote),
      requestRestart: (reason: string) => params.requestRestart(reason),
    })
  }

  const stopPollingIfEnabled = async (): Promise<void> => {
    if (!params.runtime.config.telegram.enabled) return
    const { stopTelegramPolling } =
      await import('../../surface/channels/telegram/polling.js')
    await stopTelegramPolling({
      workDir: params.runtime.config.workDir,
      logPath: params.runtime.paths.log,
    })
  }

  const ensureStart = (): void => {
    if (startPromise) return
    startPromise = (async () => {
      if (
        !params.runtime.config.telegram.enabled ||
        params.runtime.process.session.stopped
      )
        return
      try {
        console.log('[channel:telegram] start begin')
        await startPollingIfEnabled()
        console.log('[channel:telegram] start done')
      } catch (error) {
        console.log('[channel:telegram] start failed')
        await logSafeError('orchestrator:start_telegram_polling', error, {
          logPath: params.runtime.paths.log,
          ...(isTelegramPollingConflictError(error)
            ? { meta: { retryInMs: TELEGRAM_POLLING_RETRY_DELAY_MS } }
            : {}),
        })
        if (isTelegramPollingConflictError(error) && !retryTimer) {
          console.log(
            `[channel:telegram] retry scheduled in ${TELEGRAM_POLLING_RETRY_DELAY_MS}ms`,
          )
          retryTimer = setTimeout(() => {
            retryTimer = null
            ensureStart()
          }, TELEGRAM_POLLING_RETRY_DELAY_MS)
        }
      }
    })()
      .then(async () => {
        if (!params.runtime.process.session.stopped) return
        await bestEffort(
          'orchestrator:stop_telegram_after_late_start',
          () => stopPollingIfEnabled(),
          { logPath: params.runtime.paths.log },
        )
      })
      .finally(() => {
        startPromise = null
      })
  }

  return {
    start() {
      ensureStart()
    },
    async stop(mode: 'best_effort' | 'await'): Promise<void> {
      clearRetryTimer()
      if (mode === 'best_effort') {
        void bestEffort('orchestrator:stop_telegram_polling', () =>
          stopPollingIfEnabled(),
        )
        return
      }
      await bestEffort('orchestrator:stop_telegram_polling', () =>
        stopPollingIfEnabled(),
      )
    },
  }
}
