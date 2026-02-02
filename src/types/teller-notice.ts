import type { Id, ISODate } from './common.js'

export type TellerNotice = {
  id: Id
  message: string
  createdAt: ISODate
  processedByTeller: boolean
}
