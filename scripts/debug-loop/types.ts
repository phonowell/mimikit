export type LogEntry = {
  timestamp?: string
  event?: string
  role?: string
  error?: string
  errorName?: string
  aborted?: boolean
  [key: string]: unknown
}
