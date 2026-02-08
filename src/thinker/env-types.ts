import type { TaskStatusSummary } from '../types/index.js'

export type ThinkerEnv = {
  lastUser?: {
    source?: string
    remote?: string
    userAgent?: string
    language?: string
    clientLocale?: string
    clientTimeZone?: string
    clientOffsetMinutes?: number
    clientNowIso?: string
  }
  tellerDigestSummary?: string
  taskSummary?: TaskStatusSummary
}
