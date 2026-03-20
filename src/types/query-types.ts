import type { FocusId, ISODate, Role } from './base.js'
import type {
  FocusStatus,
  TaskPlanStatus,
  TaskPlanTriggerMode,
  TaskResultStatus,
  TaskStatus,
} from './runtime-domain.js'

export type HistoryLookupMessage = {
  id: string
  role: Role
  time: ISODate
  content: string
  score: number
}

export type TaskArchiveLookupMessage = {
  taskId: string
  status: TaskResultStatus
  completedAt: ISODate
  archivePath: string
  score: number
  title?: string | undefined
  snippet?: string | undefined
}

export type QueryContextScope =
  | 'history'
  | 'tasks'
  | 'focus'
  | 'plans'
  | 'generated_index'
  | 'task_archives'

export type QueryLookupHistoryItem = {
  ref: string
  id: string
  role: Role
  time: ISODate
  score: number
  focusId: FocusId
  snippet: string
}

export type QueryLookupTaskItem = {
  ref: string
  id: string
  status: TaskStatus
  focusId: FocusId
  createdAt: ISODate
  score: number
  title: string
  snippet: string
}

export type QueryLookupFocusItem = {
  ref: string
  id: string
  status: FocusStatus
  updatedAt: ISODate
  score: number
  title: string
  summary?: string | undefined
}

export type QueryLookupPlanItem = {
  ref: string
  id: string
  status: TaskPlanStatus
  triggerMode: TaskPlanTriggerMode
  updatedAt: ISODate
  score: number
  title: string
  snippet: string
}

export type QueryLookupTaskArchiveItem = {
  ref: string
  taskId: string
  status: TaskResultStatus
  completedAt: ISODate
  archivePath: string
  score: number
  title?: string | undefined
  snippet?: string | undefined
}

export type QueryLookupGeneratedIndexItem = {
  ref: string
  path: string
  updatedAt: ISODate
  size: number
  score: number
  snippet?: string | undefined
}

export type QueryLookupScopeResult<TItem> = {
  items: TItem[]
  truncated: boolean
  nextOffset?: number | undefined
}

export type QueryLookupResults = {
  history?: QueryLookupScopeResult<QueryLookupHistoryItem>
  tasks?: QueryLookupScopeResult<QueryLookupTaskItem>
  focus?: QueryLookupScopeResult<QueryLookupFocusItem>
  plans?: QueryLookupScopeResult<QueryLookupPlanItem>
  generated_index?: QueryLookupScopeResult<QueryLookupGeneratedIndexItem>
  task_archives?: QueryLookupScopeResult<QueryLookupTaskArchiveItem>
}

export type QueryLookupMessage = {
  request: {
    query: string
  }
  results: QueryLookupResults
  meta: {
    truncated: boolean
    usedBytes: number
    maxBytes: number
  }
}
