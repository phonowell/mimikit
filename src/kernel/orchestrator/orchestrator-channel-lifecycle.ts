import {
  createTelegramChannelLifecycle,
  isTelegramPollingConflictError,
} from './orchestrator-channel-telegram.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'

type ChannelRestartResult = 'scheduled' | 'busy' | 'already_scheduled'

export { isTelegramPollingConflictError }

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
  const telegram = createTelegramChannelLifecycle(params)

  return {
    start() {
      telegram.start()
    },
    async stop(mode: 'best_effort' | 'await'): Promise<void> {
      await telegram.stop(mode)
    },
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
