import type { Id, ISODate } from './common.js'

export type InboxItem = {
  id: Id
  text: string
  createdAt: ISODate
}
