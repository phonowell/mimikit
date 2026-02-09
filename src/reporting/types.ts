export type ReportingSeverity = 'low' | 'medium' | 'high'

export type ReportingCategory =
  | 'quality'
  | 'latency'
  | 'cost'
  | 'failure'
  | 'ux'
  | 'other'

export type ReportingSource =
  | 'thinker_action'
  | 'runtime'
  | 'worker_loop'
  | 'thinker_error'

export type ReportingEvent = {
  id: string
  createdAt: string
  source: ReportingSource
  category: ReportingCategory
  severity: ReportingSeverity
  message: string
  note?: string
  taskId?: string
  elapsedMs?: number
  usageTotal?: number
}
