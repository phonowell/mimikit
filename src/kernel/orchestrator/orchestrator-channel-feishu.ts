import { bestEffort, logSafeError } from '../../persistence/log/safe.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'

type AddUserInput = (
  text: string,
  meta?: UserMeta,
  quote?: string,
) => Promise<string>

export const createFeishuChannelLifecycle = (params: {
  runtime: RuntimeState
  addUserInput: AddUserInput
}) => {
  let startPromise: Promise<void> | null = null

  const startPollingIfEnabled = async (): Promise<void> => {
    if (!params.runtime.config.feishu.enabled) return
    const { startFeishuPolling } =
      await import('../../surface/channels/feishu/polling.js')
    await startFeishuPolling({
      config: params.runtime.config,
      logPath: params.runtime.paths.log,
      workDir: params.runtime.config.workDir,
      addUserInput: (text: string, meta?: UserMeta, quote?: string) =>
        params.addUserInput(text, meta, quote),
    })
  }

  const stopPollingIfEnabled = async (): Promise<void> => {
    if (!params.runtime.config.feishu.enabled) return
    const { stopFeishuPolling } =
      await import('../../surface/channels/feishu/polling.js')
    await stopFeishuPolling({
      workDir: params.runtime.config.workDir,
      logPath: params.runtime.paths.log,
    })
  }

  const ensureStart = (): void => {
    if (startPromise) return
    startPromise = (async () => {
      if (
        !params.runtime.config.feishu.enabled ||
        params.runtime.session.stopped
      )
        return
      try {
        console.log('[channel:feishu] start begin')
        await startPollingIfEnabled()
        console.log('[channel:feishu] start done')
      } catch (error) {
        console.log('[channel:feishu] start failed')
        await logSafeError('orchestrator:start_feishu_polling', error, {
          logPath: params.runtime.paths.log,
        })
      }
    })()
      .then(async () => {
        if (!params.runtime.session.stopped) return
        await bestEffort('orchestrator:stop_feishu_after_late_start', () =>
          stopPollingIfEnabled(),
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
      if (mode === 'best_effort') {
        void bestEffort('orchestrator:stop_feishu_polling', () =>
          stopPollingIfEnabled(),
        )
        return
      }
      await bestEffort('orchestrator:stop_feishu_polling', () =>
        stopPollingIfEnabled(),
      )
    },
  }
}
