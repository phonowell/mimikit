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
  triggeredByTaskId?: string
  codexSessionId?: string
  prompt?: string
  result?: string
}
