import type { Id, ISODate } from './common.js'

export type UserInput = {
  id: Id
  summary?: string
  text?: string
  createdAt: ISODate
  updatedAt?: ISODate
  processedByThinker: boolean
  sourceIds?: Id[]
}
