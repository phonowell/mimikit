import { appendStructuredFeedback } from '../evolve/feedback.js'
import { nowIso } from '../shared/utils.js'

import type { RuntimeState } from './runtime.js'
import type { Task } from '../types/index.js'

export const appendRuntimeIssue = async (params: {
  runtime: RuntimeState
  message: string
  severity: 'low' | 'medium' | 'high'
  category: 'quality' | 'latency' | 'cost' | 'failure' | 'ux' | 'other'
  action?: 'ignore' | 'defer' | 'fix'
  confidence?: number
  roiScore?: number
  note: string
  task?: Task
  elapsedMs?: number
  usageTotal?: number
  rationale?: string
}): Promise<void> => {
  await appendStructuredFeedback({
    stateDir: params.runtime.config.stateDir,
    feedback: {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: nowIso(),
      kind: 'runtime_signal',
      severity: params.severity,
      message: params.message,
      source: 'runtime',
      evidence: {
        event: params.note,
        ...(params.task ? { taskId: params.task.id } : {}),
        ...(params.elapsedMs !== undefined
          ? { elapsedMs: params.elapsedMs }
          : {}),
        ...(params.usageTotal !== undefined
          ? { usageTotal: params.usageTotal }
          : {}),
      },
      context: {
        note: params.note,
        ...(params.task ? { input: params.task.prompt } : {}),
      },
    },
    extractedIssue: {
      kind: 'issue',
      issue: {
        title: params.message,
        category: params.category,
        ...(params.action ? { action: params.action } : {}),
        ...(params.confidence !== undefined
          ? { confidence: params.confidence }
          : {}),
        ...(params.roiScore !== undefined ? { roiScore: params.roiScore } : {}),
        ...(params.rationale ? { rationale: params.rationale } : {}),
        fingerprint: `${params.note}:${params.message
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .slice(0, 80)}`,
      },
    },
  })
}
