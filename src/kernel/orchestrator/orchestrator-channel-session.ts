import {
  startOrchestratorChannels,
  stopOrchestratorChannels,
} from './orchestrator-channel-lifecycle.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'

type ChannelRestartResult = 'scheduled' | 'busy' | 'already_scheduled'

type AddUserInput = (
  text: string,
  meta?: UserMeta,
  quote?: string,
) => Promise<string>

type RequestRestart = (
  reason: string,
) => ChannelRestartResult | Promise<ChannelRestartResult>

type ChannelSession = {
  runtime: RuntimeState
  addUserInput: AddUserInput
  requestRestart: RequestRestart
}

const buildChannelSession = (params: ChannelSession): ChannelSession => ({
  runtime: params.runtime,
  addUserInput: params.addUserInput,
  requestRestart: params.requestRestart,
})

export const startChannelSession = (
  params: ChannelSession,
): (() => Promise<void>) =>
  startOrchestratorChannels(buildChannelSession(params))

export const stopChannelSession = async (params: {
  runtime: RuntimeState
  addUserInput: AddUserInput
  requestRestart: RequestRestart
  stopAwait?: () => Promise<void>
  mode: 'best_effort' | 'await'
}): Promise<void> => {
  if (params.stopAwait) {
    await params.stopAwait()
    return
  }
  await stopOrchestratorChannels({
    ...buildChannelSession({
      runtime: params.runtime,
      addUserInput: params.addUserInput,
      requestRestart: params.requestRestart,
    }),
    mode: params.mode,
  })
}
