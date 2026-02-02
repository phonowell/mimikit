import type { Id, ISODate } from './common.js'

export type UserInput = {
  id: Id
  text: string
  createdAt: ISODate
  processedByThinker: boolean
}
