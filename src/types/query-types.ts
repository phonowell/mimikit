import type { ISODate } from './base.js'
import type { TaskResultStatus } from './runtime-domain.js'

export type TaskArchiveLookupMessage = {
  taskId: string
  status: TaskResultStatus
  completedAt: ISODate
  archivePath: string
  score: number
  title?: string | undefined
  snippet?: string | undefined
}
