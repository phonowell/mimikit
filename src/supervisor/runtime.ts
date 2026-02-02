import type { SupervisorConfig } from '../config.js'
import type { StatePaths } from '../fs/paths.js'

export type PendingUserInput = {
  id: string
  text: string
  createdAt: string
}

export type RuntimeState = {
  config: SupervisorConfig
  paths: StatePaths
  stopped: boolean
  pendingInputs: PendingUserInput[]
  lastUserInputAt: number
  lastTellerReplyAt: number
  thinkerRunning: boolean
  runningWorkers: Set<string>
}
