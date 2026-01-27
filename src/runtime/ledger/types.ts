import type { ResumePolicy } from '../../config.js'

export type TaskStatus = 'queued' | 'running' | 'done' | 'failed'

export type TaskRecord = {
  id: string
  status: TaskStatus
  sessionKey: string
  runId: string
  retries: number
  attempt?: number
  createdAt: string
  updatedAt: string
  resume: ResumePolicy
  maxIterations?: number
  verifyCommand?: string
  scoreCommand?: string
  minScore?: number
  objective?: string
  score?: number
  scoreSummary?: string
  guardRequireClean?: boolean
  guardMaxChangedFiles?: number
  guardMaxChangedLines?: number
  changedFiles?: number
  changedLines?: number
  triggeredByTaskId?: string
  codexSessionId?: string
  prompt?: string
  result?: string
}
