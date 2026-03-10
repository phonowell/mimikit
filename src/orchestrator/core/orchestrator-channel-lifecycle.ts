import { bestEffort, logSafeError } from '../../log/safe.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'

const TELEGRAM_POLLING_RETRY_DELAY_MS = 10_000
type ChannelRestartResult = 'scheduled' | 'busy' | 'already_scheduled'

export const isTelegramPollingConflictError = (error: unknown): boolean => {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error)
  return (
    message.includes('telegram_polling_start_failed:409') ||
    (message.includes('conflict') && message.includes('getupdates'))
  )
}

const createChannelController = (params: {
  runtime: RuntimeState
  addUserInput: (
    text: string,
    meta?: UserMeta,
    quote?: string,
  ) => Promise<string>
  requestRestart: (
    reason: string,
  ) => ChannelRestartResult | Promise<ChannelRestartResult>
}) => {
  let telegramStartPromise: Promise<void> | null = null
  let feishuStartPromise: Promise<void> | null = null
  let telegramRetryTimer: ReturnType<typeof setTimeout> | null = null

  const clearTelegramRetryTimer = (): void => {
    if (!telegramRetryTimer) return
    clearTimeout(telegramRetryTimer)
    telegramRetryTimer = null
  }

  const startTelegramPollingIfEnabled = async (): Promise<void> => {
    if (!params.runtime.config.telegram.enabled) return
    const { startTelegramPolling } =
      await import('../../channels/telegram/index.js')
    await startTelegramPolling({
      config: params.runtime.config,
      logPath: params.runtime.paths.log,
      workDir: params.runtime.config.workDir,
      addUserInput: (text: string, meta?: UserMeta, quote?: string) =>
        params.addUserInput(text, meta, quote),
      requestRestart: (reason: string) => params.requestRestart(reason),
    })
  }

  const stopTelegramPollingIfEnabled = async (): Promise<void> => {
    if (!params.runtime.config.telegram.enabled) return
    const { stopTelegramPolling } =
      await import('../../channels/telegram/index.js')
    await stopTelegramPolling({
      workDir: params.runtime.config.workDir,
      logPath: params.runtime.paths.log,
    })
  }

  const scheduleTelegramPollingRetry = (error: unknown): void => {
    if (!isTelegramPollingConflictError(error)) return
    if (
      params.runtime.session.stopped ||
      !params.runtime.config.telegram.enabled ||
      telegramRetryTimer
    )
      return
    telegramRetryTimer = setTimeout(() => {
      telegramRetryTimer = null
      ensureTelegramPollingStart()
    }, TELEGRAM_POLLING_RETRY_DELAY_MS)
  }

  const ensureTelegramPollingStart = (): void => {
    if (telegramStartPromise) return
    telegramStartPromise = (async () => {
      if (
        !params.runtime.config.telegram.enabled ||
        params.runtime.session.stopped
      )
        return
      try {
        await startTelegramPollingIfEnabled()
      } catch (error) {
        await logSafeError('orchestrator:start_telegram_polling', error, {
          logPath: params.runtime.paths.log,
          ...(isTelegramPollingConflictError(error)
            ? { meta: { retryInMs: TELEGRAM_POLLING_RETRY_DELAY_MS } }
            : {}),
        })
        scheduleTelegramPollingRetry(error)
      }
    })()
      .then(async () => {
        if (!params.runtime.session.stopped) return
        await bestEffort(
          'orchestrator:stop_telegram_after_late_start',
          () => stopTelegramPollingIfEnabled(),
          { logPath: params.runtime.paths.log },
        )
      })
      .finally(() => {
        telegramStartPromise = null
      })
  }

  const startFeishuPollingIfEnabled = async (): Promise<void> => {
    if (!params.runtime.config.feishu.enabled) return
    const { startFeishuPolling } =
      await import('../../channels/feishu/index.js')
    await startFeishuPolling({
      config: params.runtime.config,
      logPath: params.runtime.paths.log,
      workDir: params.runtime.config.workDir,
      addUserInput: (text: string, meta?: UserMeta, quote?: string) =>
        params.addUserInput(text, meta, quote),
    })
  }

  const stopFeishuPollingIfEnabled = async (): Promise<void> => {
    if (!params.runtime.config.feishu.enabled) return
    const { stopFeishuPolling } = await import('../../channels/feishu/index.js')
    await stopFeishuPolling({
      workDir: params.runtime.config.workDir,
      logPath: params.runtime.paths.log,
    })
  }

  const ensureFeishuPollingStart = (): void => {
    if (feishuStartPromise) return
    feishuStartPromise = (async () => {
      if (
        !params.runtime.config.feishu.enabled ||
        params.runtime.session.stopped
      )
        return
      try {
        await startFeishuPollingIfEnabled()
      } catch (error) {
        await logSafeError('orchestrator:start_feishu_polling', error, {
          logPath: params.runtime.paths.log,
        })
      }
    })()
      .then(async () => {
        if (!params.runtime.session.stopped) return
        await bestEffort('orchestrator:stop_feishu_after_late_start', () =>
          stopFeishuPollingIfEnabled(),
        )
      })
      .finally(() => {
        feishuStartPromise = null
      })
  }

  const stop = async (mode: 'best_effort' | 'await'): Promise<void> => {
    clearTelegramRetryTimer()
    if (mode === 'best_effort') {
      void bestEffort('orchestrator:stop_telegram_polling', () =>
        stopTelegramPollingIfEnabled(),
      )
      void bestEffort('orchestrator:stop_feishu_polling', () =>
        stopFeishuPollingIfEnabled(),
      )
      return
    }
    await bestEffort('orchestrator:stop_telegram_polling', () =>
      stopTelegramPollingIfEnabled(),
    )
    await bestEffort('orchestrator:stop_feishu_polling', () =>
      stopFeishuPollingIfEnabled(),
    )
  }

  return {
    start() {
      ensureTelegramPollingStart()
      ensureFeishuPollingStart()
    },
    stop,
  }
}

export const startOrchestratorChannels = (params: {
  runtime: RuntimeState
  addUserInput: (
    text: string,
    meta?: UserMeta,
    quote?: string,
  ) => Promise<string>
  requestRestart: (
    reason: string,
  ) => ChannelRestartResult | Promise<ChannelRestartResult>
}): (() => Promise<void>) => {
  const controller = createChannelController(params)
  controller.start()
  return () => controller.stop('await')
}

export const stopOrchestratorChannels = (params: {
  runtime: RuntimeState
  addUserInput: (
    text: string,
    meta?: UserMeta,
    quote?: string,
  ) => Promise<string>
  requestRestart: (
    reason: string,
  ) => ChannelRestartResult | Promise<ChannelRestartResult>
  mode: 'best_effort' | 'await'
}): Promise<void> => createChannelController(params).stop(params.mode)
