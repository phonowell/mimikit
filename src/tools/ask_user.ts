import { formatPendingQuestion } from '../format-question.js'
import { shortId } from '../ids.js'
import { appendHistory } from '../storage/history.js'
import { writePendingQuestion } from '../storage/pending-question.js'
import { addSeconds, nowIso } from '../time.js'

import type { ToolContext } from './context.js'
import type { PendingQuestion } from '../types/history.js'

export type AskUserArgs = {
  question: string
  timeout?: number
  default?: string
  options?: string[]
}

export const askUser = async (ctx: ToolContext, args: AskUserArgs) => {
  const timeout = args.timeout ?? 3600
  const createdAt = nowIso()
  const base: PendingQuestion = {
    questionId: shortId(),
    question: args.question,
    timeout,
    createdAt,
    expiresAt: addSeconds(createdAt, timeout),
  }
  const question = {
    ...base,
    ...(args.options ? { options: args.options } : {}),
    ...(args.default ? { default: args.default } : {}),
  }
  await writePendingQuestion(ctx.paths.pendingQuestion, question)
  await appendHistory(ctx.paths.history, {
    id: shortId(),
    role: 'agent',
    text: formatPendingQuestion(question),
    createdAt,
    ...(ctx.llmUsage ? { usage: ctx.llmUsage } : {}),
    ...(Number.isFinite(ctx.llmElapsedMs)
      ? { elapsedMs: ctx.llmElapsedMs }
      : {}),
  })
  return { questionId: question.questionId }
}
