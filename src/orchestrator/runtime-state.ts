import type { AppConfig } from '../config.js'
import type { StatePaths } from '../fs/paths.js'
import type { Task, UserInput } from '../types/index.js'

export type PendingUserInput = UserInput

export type UserMeta = {
  source?: string
  remote?: string
  userAgent?: string
  language?: string
  clientLocale?: string
  clientTimeZone?: string
  clientOffsetMinutes?: number
  clientNowIso?: string
}

export type RuntimeState = {
  config: AppConfig
  paths: StatePaths
  stopped: boolean
  thinkerRunning: boolean
  inflightInputs: PendingUserInput[]
  lastThinkerRunAt?: number
  channels: {
    teller: {
      userInputCursor: number
      workerResultCursor: number
      thinkerDecisionCursor: number
    }
    thinker: {
      tellerDigestCursor: number
    }
  }
  tasks: Task[]
  runningWorkers: Set<string>
  runningControllers: Map<string, AbortController>
  evolveState: {
    lastIdleReviewAt?: string
  }
  lastUserMeta?: UserMeta
}
