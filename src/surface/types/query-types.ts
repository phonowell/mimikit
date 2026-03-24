import type { ISODate } from '../../foundation/types/base.js'
import type { TaskResultStatus } from '../../foundation/types/runtime-domain.js'

export type TaskArchiveLookupMessage = {
  taskId: string
  status: TaskResultStatus
  completedAt: ISODate
  archivePath: string
  score: number
  title?: string | undefined
  snippet?: string | undefined
}
