export type FeedbackIssueCategory =
  | 'quality'
  | 'latency'
  | 'cost'
  | 'failure'
  | 'ux'
  | 'other'

export type EvolveFeedback = {
  id: string
  createdAt: string
  kind: 'user_feedback' | 'runtime_signal'
  severity: 'low' | 'medium' | 'high'
  message: string
  source?: 'thinker_action' | 'idle_review' | 'runtime'
  evidence?: {
    fromMessageId?: string
    taskId?: string
    elapsedMs?: number
    usageTotal?: number
    event?: string
  }
  issue?: {
    category?: FeedbackIssueCategory
    fingerprint?: string
    roiScore?: number
    confidence?: number
    action?: 'ignore' | 'defer' | 'fix'
    rationale?: string
  }
  context?: {
    input?: string
    response?: string
    note?: string
  }
}

export type EvolveFeedbackIssue = {
  fingerprint: string
  category: FeedbackIssueCategory
  title: string
  roiScore: number
  confidence: number
  count: number
  firstSeenAt: string
  lastSeenAt: string
  status: 'open' | 'deferred' | 'ignored' | 'resolved'
  evidence: Array<{
    feedbackId: string
    kind: EvolveFeedback['kind']
    severity: EvolveFeedback['severity']
    message: string
    createdAt: string
    source?: EvolveFeedback['source']
  }>
  action?: 'ignore' | 'defer' | 'fix'
  mustContain?: string[]
  rationale?: string
}

export type ExtractIssueResult =
  | {
      kind: 'issue'
      issue: {
        title: string
        category: FeedbackIssueCategory
        fingerprint?: string
        roiScore?: number
        confidence?: number
        action?: 'ignore' | 'defer' | 'fix'
        rationale?: string
      }
    }
  | {
      kind: 'non_issue'
      rationale?: string
    }

export type EvolveFeedbackState = {
  processedCount: number
  lastRunAt?: string
  lastIdleReviewAt?: string
}
