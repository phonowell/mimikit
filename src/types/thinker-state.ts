import type { ISODate } from './common.js'

export type ThinkerState = {
  sessionId: string
  lastWakeAt: ISODate
  notes: string
}
