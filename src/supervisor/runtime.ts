import type { SupervisorConfig } from '../config.js'
import type { StatePaths } from '../fs/paths.js'
import type { TokenUsage } from '../types/usage.js'

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
  lastUserMeta?: {
    source?: string
    remote?: string
    userAgent?: string
    language?: string
    clientLocale?: string
    clientTimeZone?: string
    clientOffsetMinutes?: number
    clientNowIso?: string
  }
  thinkerLast?: {
    elapsedMs?: number
    usage?: TokenUsage
    endedAt?: string
    error?: string
  }
}
