import { summarizeSchema } from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'

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
    if (item.name !== 'set_task_result_summary') continue
    const summary = parseSummary(item)
    if (!summary) continue
    summaries.set(summary.taskId, summary.summary)
  }
  return summaries
}
