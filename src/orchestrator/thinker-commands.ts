import { appendStructuredFeedback } from '../evolve/feedback.js'
import { nowIso } from '../shared/utils.js'
import { enqueueTask } from '../tasks/queue.js'

import { cancelTask } from './cancel.js'
import { appendTaskSystemMessage } from './task-history.js'

import type { ParsedCommand } from './command-parser.js'
import type { RuntimeState } from './runtime-state.js'
import type { WorkerProfile } from '../types/index.js'

type FeedbackCommandPayload = {
  message: string
}

const parseFeedbackCommand = (
  command: ParsedCommand,
): FeedbackCommandPayload | undefined => {
  const message = command.attrs.message?.trim() ?? ''
  if (!message) return undefined
  return { message }
}

const normalizeResultSummary = (
  taskIdRaw: string | undefined,
  summaryRaw: string | undefined,
): { taskId: string; summary: string } | undefined => {
  const taskId = taskIdRaw?.trim() ?? ''
  const summary = summaryRaw?.trim() ?? ''
  if (!taskId || !summary) return undefined
  return { taskId, summary }
}

const parseResultSummaryCommand = (
  command: ParsedCommand,
): { taskId: string; summary: string } | undefined =>
  normalizeResultSummary(
    command.attrs.taskId ?? command.attrs.id,
    command.attrs.summary,
  )

export const collectResultSummaries = (
  commands: ParsedCommand[],
): Map<string, string> => {
  const summaries = new Map<string, string>()
  for (const command of commands) {
    if (command.action !== 'summarize_result') continue
    const summary = parseResultSummaryCommand(command)
    if (!summary) continue
    summaries.set(summary.taskId, summary.summary)
  }
  return summaries
}

const handleAddTaskCommand = async (
  runtime: RuntimeState,
  command: ParsedCommand,
  seenDispatches: Set<string>,
): Promise<void> => {
  const prompt = command.attrs.prompt?.trim() ?? ''
  if (!prompt) return
  const rawTitle = command.attrs.title?.trim()
  const profileRaw = command.attrs.profile?.trim().toLowerCase()
  const profile: WorkerProfile = profileRaw === 'expert' ? 'expert' : 'standard'
  const dedupeKey = `${prompt}\n${rawTitle ?? ''}\n${profile}`
  if (seenDispatches.has(dedupeKey)) return
  seenDispatches.add(dedupeKey)
  const { task, created } = enqueueTask(
    runtime.tasks,
    prompt,
    rawTitle,
    profile,
  )
  if (!created) return
  await appendTaskSystemMessage(runtime.paths.history, 'created', task, {
    createdAt: task.createdAt,
  })
}

const handleFeedbackCommand = async (
  runtime: RuntimeState,
  command: ParsedCommand,
): Promise<void> => {
  const payload = parseFeedbackCommand(command)
  if (!payload) return
  await appendStructuredFeedback({
    stateDir: runtime.config.stateDir,
    feedback: {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: nowIso(),
      kind: 'user_feedback',
      severity: 'medium',
      message: payload.message,
      source: 'thinker_tool',
      context: {
        note: 'thinker_capture_feedback',
      },
    },
    extractedIssue: {
      kind: 'issue',
      issue: {
        title: payload.message,
        category: 'other',
      },
    },
  })
}

export const processThinkerCommands = async (
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
      const id = command.attrs.id?.trim() ?? ''
      if (!id) continue
      await cancelTask(runtime, id, { source: 'thinker' })
      continue
    }
    if (command.action === 'capture_feedback')
      await handleFeedbackCommand(runtime, command)
    if (command.action === 'summarize_result') continue
  }
}
