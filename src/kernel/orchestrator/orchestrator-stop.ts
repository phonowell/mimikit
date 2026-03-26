import { stopChannelSession } from './orchestrator-channel-session.js'
import {
  persistRuntimeSnapshotOnStop,
  prepareRuntimeStop,
  waitForRuntimeManagerDrain,
} from './orchestrator-runtime-lifecycle.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'

type ChannelInput = (
  text: string,
  meta?: UserMeta,
  quote?: string,
) => Promise<string>

type ChannelRestart = (
  reason: string,
) => 'scheduled' | 'busy' | 'already_scheduled'

type StopParams = {
  runtime: RuntimeState
  stopChannelsAwait?: () => Promise<void>
  channelInput: ChannelInput
  channelRestart: ChannelRestart
}

const resolveStopChannelOptions = (params: StopParams) => ({
  runtime: params.runtime,
  addUserInput: params.channelInput,
  requestRestart: params.channelRestart,
  ...(params.stopChannelsAwait ? { stopAwait: params.stopChannelsAwait } : {}),
})

export const stopOrchestratorBestEffort = (params: StopParams): void => {
  prepareRuntimeStop(params.runtime)
  void stopChannelSession({
    ...resolveStopChannelOptions(params),
    mode: 'best_effort',
  })
  void persistRuntimeSnapshotOnStop(params.runtime)
}

export const stopOrchestratorAndPersist = async (
  params: StopParams,
): Promise<void> => {
  prepareRuntimeStop(params.runtime)
  await stopChannelSession({
    ...resolveStopChannelOptions(params),
    mode: 'await',
  })
  await waitForRuntimeManagerDrain(params.runtime)
  await persistRuntimeSnapshotOnStop(params.runtime)
}
