import { appendStructuredFeedback } from '../evolve/feedback.js'
import { appendLog } from '../log/append.js'
import { nowIso } from '../shared/utils.js'
import { enqueueTask } from '../tasks/queue.js'

import { cancelTask } from './cancel.js'
import { parseCommandPayload } from './command-parser.js'
import { appendTaskSystemMessage } from './task-history.js'
import { canSpendTokens } from './token-budget.js'

import type { ParsedCommand } from './command-parser.js'
import type { RuntimeState } from './runtime.js'

type FeedbackCommandPayload = {
  message: string
  category?: 'quality' | 'latency' | 'cost' | 'failure' | 'ux' | 'other'
  roiScore?: number
  confidence?: number
  action?: 'ignore' | 'defer' | 'fix'
  rationale?: string
  fingerprint?: string
}

const estimateTaskTokenCost = (prompt: string): number =>
  Math.max(512, Math.ceil(prompt.length / 3))

const parseFeedbackCommand = (
  payload: FeedbackCommandPayload | undefined,
): FeedbackCommandPayload | undefined => {
  if (!payload) return undefined
  const message = payload.message.trim()
  if (!message) return undefined
  return {
    message,
    ...(payload.category ? { category: payload.category } : {}),
    ...(typeof payload.roiScore === 'number'
      ? { roiScore: payload.roiScore }
      : {}),
    ...(typeof payload.confidence === 'number'
      ? { confidence: payload.confidence }
      : {}),
    ...(payload.action ? { action: payload.action } : {}),
    ...(payload.rationale ? { rationale: payload.rationale } : {}),
    ...(payload.fingerprint ? { fingerprint: payload.fingerprint } : {}),
  }
}

const handleAddTaskCommand = async (
  runtime: RuntimeState,
  command: ParsedCommand,
  seenDispatches: Set<string>,
): Promise<void> => {
  const content = command.content?.trim()
  const prompt =
    content && content.length > 0
      ? content
      : (command.attrs.prompt?.trim() ?? '')
  if (!prompt) return
  const rawTitle = command.attrs.title?.trim()
  const dedupeKey = `${prompt}\n${rawTitle ?? ''}`
  if (seenDispatches.has(dedupeKey)) return
  seenDispatches.add(dedupeKey)
  if (!canSpendTokens(runtime, estimateTaskTokenCost(prompt))) {
    await appendLog(runtime.paths.log, {
      event: 'task_dispatch_skipped_budget',
      promptChars: prompt.length,
      budgetDate: runtime.tokenBudget.date,
      budgetSpent: runtime.tokenBudget.spent,
      budgetLimit: runtime.config.tokenBudget.dailyTotal,
    })
    return
  }
  const { task, created } = enqueueTask(runtime.tasks, prompt, rawTitle)
  if (!created) return
  await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
    createdAt: task.createdAt,
  })
}

const handleFeedbackCommand = async (
  runtime: RuntimeState,
  command: ParsedCommand,
): Promise<void> => {
  const payload = parseFeedbackCommand(
    parseCommandPayload<FeedbackCommandPayload>(command),
  )
  if (!payload) return
  await appendStructuredFeedback({
    stateDir: runtime.config.stateDir,
    feedback: {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: nowIso(),
      kind: 'user_feedback',
      severity: payload.action === 'ignore' ? 'low' : 'medium',
      message: payload.message,
      source: 'manager_tool',
      context: {
        note: 'manager_capture_feedback',
      },
    },
    extractedIssue: {
      kind: 'issue',
      issue: {
        title: payload.message,
        category: payload.category ?? 'other',
        ...(payload.fingerprint ? { fingerprint: payload.fingerprint } : {}),
        ...(payload.roiScore !== undefined
          ? { roiScore: payload.roiScore }
          : {}),
        ...(payload.confidence !== undefined
          ? { confidence: payload.confidence }
          : {}),
        ...(payload.action ? { action: payload.action } : {}),
        ...(payload.rationale ? { rationale: payload.rationale } : {}),
      },
    },
  })
}

export const processManagerCommands = async (
  runtime: RuntimeState,
  commands: ParsedCommand[],
): Promise<void> => {
  const seenDispatches = new Set<string>()
  for (const command of commands) {
    if (command.action === 'add_task') {
      await handleAddTaskCommand(runtime, command, seenDispatches)
      continue
    }
    if (command.action === 'cancel_task') {
      const id = command.attrs.id?.trim() ?? command.content?.trim()
      if (!id) continue
      await cancelTask(runtime, id, { source: 'manager' })
      continue
    }
    if (command.action === 'capture_feedback')
      await handleFeedbackCommand(runtime, command)
  }
}
