import { logSafeError } from '../log/safe.js'

import type { PlannerResult } from '../types/tasks.js'
import type { ToolCall } from '../types/tools.js'

export type PlannerResultLine = Pick<
  PlannerResult,
  'status' | 'question' | 'options' | 'default' | 'error' | 'tasks' | 'triggers'
>

export const parseJsonObject = (output: string): unknown | null => {
  const trimmed = output.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch (error) {
    void logSafeError('parseJsonObject', error, {
      meta: { length: trimmed.length },
    })
    return null
  }
}

export const extractToolCalls = (output: string): ToolCall[] => {
  const parsed = parseJsonObject(output)
  if (parsed && typeof parsed === 'object' && 'tool_calls' in parsed) {
    const toolCalls = (parsed as { tool_calls?: ToolCall[] }).tool_calls
    if (Array.isArray(toolCalls))
      return toolCalls.filter((call) => typeof call.tool === 'string')
  }

  const calls: ToolCall[] = []
  const lines = output.split(/\r?\n/)
  let parseWarned = false
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
    } catch (error) {
      if (!parseWarned) {
        parseWarned = true
        void logSafeError('extractToolCalls: parse', error, {
          meta: { line: trimmed.slice(0, 200), length: trimmed.length },
        })
      }
    }
  }
  return calls
}

export const extractPlannerResult = (
  output: string,
): PlannerResultLine | null => {
  const parsed = parseJsonObject(output)
  if (parsed && typeof parsed === 'object' && 'result' in parsed) {
    const { result } = parsed as { result?: PlannerResultLine }
    if (result?.status) return result
  }

  const lines = output.split(/\r?\n/)
  let parseWarned = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue
    try {
      const parsed = JSON.parse(trimmed) as { result?: PlannerResultLine }
      if (parsed.result?.status) return parsed.result
    } catch (error) {
      if (!parseWarned) {
        parseWarned = true
        void logSafeError('extractPlannerResult: parse', error, {
          meta: { line: trimmed.slice(0, 200), length: trimmed.length },
        })
      }
    }
  }
  return null
}

export const stripToolCalls = (output: string): string => {
  const parsed = parseJsonObject(output)
  if (parsed && typeof parsed === 'object' && 'tool_calls' in parsed) return ''

  const lines = output.split(/\r?\n/)
  let parseWarned = false
  const remaining = lines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return true
    try {
      const parsed = JSON.parse(trimmed) as { tool?: string }
      return !parsed.tool
    } catch (error) {
      if (!parseWarned) {
        parseWarned = true
        void logSafeError('stripToolCalls: parse', error, {
          meta: { line: trimmed.slice(0, 200), length: trimmed.length },
        })
      }
      return true
    }
  })
  return remaining.join('\n').trim()
}
