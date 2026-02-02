import type { Id, ISODate } from './common.js'

export type TellerNotice = {
  id: Id
  fact?: string
  message?: string
  createdAt: ISODate
  processedByTeller: boolean
}
