import { z } from 'zod'

import type { Parsed } from '../actions/model/spec.js'

const nonEmptyString = z.string().trim().min(1)

const summarizeSchema = z
  .object({
    task_id: nonEmptyString,
    summary: nonEmptyString,
  })
  .strict()

export const createSchema = z
  .object({
    prompt: nonEmptyString,
    title: nonEmptyString,
    profile: z.enum(['standard', 'specialist', 'deferred']),
    cron: z.string().trim().optional(),
    scheduled_at: z.string().trim().optional(),
  })
  .strict()
  .refine(
    (data) => !(data.cron?.trim() && data.scheduled_at?.trim()),
    'cron and scheduled_at are mutually exclusive',
  )

export const cancelSchema = z
  .object({
    id: nonEmptyString,
  })
  .strict()

export const restartSchema = z.object({}).strict()

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
