import { z } from 'zod'

import type { Task, TokenUsage } from '../types/index.js'

export type RuntimeSnapshot = {
  tasks: Task[]
  reporting?: {
    lastDailyReportDate?: string
  }
  channels?: {
    teller: {
      userInputCursor: number
      workerResultCursor: number
      thinkerDecisionCursor: number
    }
    thinker: {
      tellerDigestCursor: number
    }
  }
}

const tokenUsageSchema = z
  .object({
    input: z.number().finite().nonnegative().optional(),
    output: z.number().finite().nonnegative().optional(),
    total: z.number().finite().nonnegative().optional(),
  })
  .strict()

const taskRawSchema = z
  .object({
    id: z.string().trim().min(1),
    fingerprint: z.string().trim().min(1),
    prompt: z.string(),
    title: z.string(),
    profile: z.enum(['standard', 'expert']),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'canceled']),
    createdAt: z.string(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    durationMs: z.number().finite().nonnegative().optional(),
    attempts: z.number().int().nonnegative().optional(),
    usage: tokenUsageSchema.optional(),
    archivePath: z.string().optional(),
  })
  .strict()

const runtimeSnapshotChannelsSchema = z
  .object({
    teller: z
      .object({
        userInputCursor: z.number().int().nonnegative(),
        workerResultCursor: z.number().int().nonnegative(),
        thinkerDecisionCursor: z.number().int().nonnegative(),
      })
      .strict(),
    thinker: z
      .object({
        tellerDigestCursor: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()

const runtimeSnapshotRawSchema = z
  .object({
    tasks: z.array(taskRawSchema),
    reporting: z
      .object({
        lastDailyReportDate: z.string().optional(),
      })
      .strict()
      .optional(),
    channels: runtimeSnapshotChannelsSchema.optional(),
  })
  .strict()

const toTokenUsage = (
  usage: z.infer<typeof tokenUsageSchema> | undefined,
): TokenUsage | undefined => {
  if (!usage) return undefined
  const normalized: TokenUsage = {
    ...(usage.input !== undefined ? { input: usage.input } : {}),
    ...(usage.output !== undefined ? { output: usage.output } : {}),
    ...(usage.total !== undefined ? { total: usage.total } : {}),
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

const toTask = (task: z.infer<typeof taskRawSchema>): Task => {
  const usage = toTokenUsage(task.usage)
  return {
    id: task.id,
    fingerprint: task.fingerprint,
    prompt: task.prompt,
    title: task.title,
    profile: task.profile,
    status: task.status,
    createdAt: task.createdAt,
    ...(task.startedAt !== undefined ? { startedAt: task.startedAt } : {}),
    ...(task.completedAt !== undefined
      ? { completedAt: task.completedAt }
      : {}),
    ...(task.durationMs !== undefined ? { durationMs: task.durationMs } : {}),
    ...(task.attempts !== undefined ? { attempts: task.attempts } : {}),
    ...(usage ? { usage } : {}),
    ...(task.archivePath !== undefined
      ? { archivePath: task.archivePath }
      : {}),
  }
}

export const parseRuntimeSnapshot = (value: unknown): RuntimeSnapshot => {
  const parsed = runtimeSnapshotRawSchema.parse(value)
  const reportingDate = parsed.reporting?.lastDailyReportDate

  return {
    tasks: parsed.tasks.map((task) => toTask(task)),
    ...(reportingDate
      ? { reporting: { lastDailyReportDate: reportingDate } }
      : {}),
    ...(parsed.channels ? { channels: parsed.channels } : {}),
  }
}
