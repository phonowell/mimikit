import type { PlannerResult } from '../types/tasks.js'
import type { ToolCall } from '../types/tools.js'

export type PlannerResultLine = Pick<
  PlannerResult,
  'status' | 'question' | 'options' | 'default' | 'error' | 'tasks' | 'triggers'
>

export const extractToolCalls = (output: string): ToolCall[] => {
  const calls: ToolCall[] = []
  const lines = output.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (
        parsed &&
        typeof parsed === 'object' &&
        'tool' in parsed &&
        typeof (parsed as ToolCall).tool === 'string'
      )
        calls.push(parsed as ToolCall)
    } catch {
      // ignore
    }
  }
  return calls
}

export const extractPlannerResult = (
  output: string,
): PlannerResultLine | null => {
  const lines = output.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue
    try {
      const parsed = JSON.parse(trimmed) as { result?: PlannerResultLine }
      if (parsed.result?.status) return parsed.result
    } catch {
      // ignore
    }
  }
  return null
}

export const stripToolCalls = (output: string): string => {
  const lines = output.split(/\r?\n/)
  const remaining = lines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return true
    try {
      const parsed = JSON.parse(trimmed) as { tool?: string }
      return !parsed.tool
    } catch {
      return true
    }
  })
  return remaining.join('\n').trim()
}
