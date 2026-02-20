import { z } from 'zod'

import type { Parsed } from '../actions/model/spec.js'

const nonEmptyString = z.string().trim().min(1)

export const summarizeSchema = z
  .object({
    task_id: nonEmptyString,
    summary: nonEmptyString,
  })
  .strict()

export const createSchema = z
  .object({
    prompt: nonEmptyString,
    title: nonEmptyString,
    profile: z.enum(['standard', 'specialist']).optional(),
    cron: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasCron = Boolean(data.cron?.trim())
    const hasScheduledAt = Boolean(data.scheduled_at?.trim())
    const hasSchedule = hasCron || hasScheduledAt
    if (hasCron && hasScheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cron and scheduled_at are mutually exclusive',
        path: ['cron'],
      })
    }
    if (hasSchedule && data.profile !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'profile must be omitted when cron or scheduled_at is set',
        path: ['profile'],
      })
    }
    if (!hasSchedule && data.profile === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'profile is required when cron and scheduled_at are absent',
        path: ['profile'],
      })
    }
  })

export const cancelSchema = z
  .object({
    id: nonEmptyString,
  })
  .strict()

export const restartSchema = z.object({}).strict()
export const compressSchema = z.object({}).strict()

const parseSummary = (
  item: Parsed,
): { taskId: string; summary: string } | undefined => {
  const parsed = summarizeSchema.safeParse(item.attrs)
  if (!parsed.success) return undefined
  return { taskId: parsed.data.task_id, summary: parsed.data.summary }
}

export const collectTaskResultSummaries = (
  items: Parsed[],
): Map<string, string> => {
  const summaries = new Map<string, string>()
  for (const item of items) {
    if (item.name !== 'summarize_task_result') continue
    const summary = parseSummary(item)
    if (!summary) continue
    summaries.set(summary.taskId, summary.summary)
  }
  return summaries
}
