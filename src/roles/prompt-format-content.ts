import {
  appendYamlLine,
  appendYamlUsage,
  escapeCdata,
  mapHistoryRole,
  parseIsoToMs,
  resolveTaskChangedAt,
  yamlIndent,
  yamlScalar,
} from './prompt-format-base.js'

import type {
  HistoryMessage,
  Task,
  TaskResult,
  UserInput,
} from '../types/index.js'

const sortByTimeAndIdDesc = <T extends { time: string; id: string }>(
  entries: T[],
): T[] =>
  [...entries].sort((a, b) => {
    const aTs = parseIsoToMs(a.time)
    const bTs = parseIsoToMs(b.time)
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })

const formatMessagesYaml = (
  entries: Array<{
    id: string
    role: string
    time: string
    quote?: string
    content: string
  }>,
): string => {
  if (entries.length === 0) return ''
  const sorted = sortByTimeAndIdDesc(entries)
  const lines: string[] = ['messages:']
  for (const entry of sorted) {
    lines.push(`${yamlIndent(1)}- id: ${yamlScalar(entry.id)}`)
    appendYamlLine(lines, 2, 'role', entry.role)
    appendYamlLine(lines, 2, 'time', entry.time)
    if (entry.quote) appendYamlLine(lines, 2, 'quote', entry.quote)
    appendYamlLine(lines, 2, 'content', entry.content)
  }
  return escapeCdata(lines.join('\n'))
}

export const formatHistory = (history: HistoryMessage[]): string => {
  if (history.length === 0) return ''
  const entries = history
    .map((item) => {
      const content = item.text.trim()
      if (!content) return null
      return {
        id: item.id,
        role: mapHistoryRole(item.role),
        time: item.createdAt,
        ...(item.quote ? { quote: item.quote } : {}),
        content,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  return formatMessagesYaml(entries)
}

export const formatInputs = (inputs: UserInput[]): string => {
  if (inputs.length === 0) return ''
  const entries = inputs
    .map((input) => {
      const content = input.text.trim()
      if (!content) return null
      return {
        id: input.id,
        role: 'user',
        time: input.createdAt,
        ...(input.quote ? { quote: input.quote } : {}),
        content,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  return formatMessagesYaml(entries)
}

export const selectTasksForPrompt = (tasks: Task[]): Task[] => {
  if (tasks.length === 0) return []
  return [...tasks].sort((a, b) => {
    const aTs = parseIsoToMs(resolveTaskChangedAt(a))
    const bTs = parseIsoToMs(resolveTaskChangedAt(b))
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })
}

const formatTaskEntry = (
  task: Task,
  result: TaskResult | undefined,
  lines: string[],
): void => {
  lines.push(`${yamlIndent(1)}- id: ${yamlScalar(task.id)}`)
  appendYamlLine(lines, 2, 'status', task.status)
  appendYamlLine(lines, 2, 'title', task.title.trim() || task.id)
  appendYamlLine(lines, 2, 'changed_at', resolveTaskChangedAt(task))
  appendYamlLine(lines, 2, 'prompt', task.prompt)
  if (!result) return
  lines.push(`${yamlIndent(2)}result:`)
  appendYamlLine(lines, 3, 'status', result.status)
  appendYamlLine(lines, 3, 'ok', result.ok)
  appendYamlLine(lines, 3, 'completed_at', result.completedAt)
  appendYamlLine(lines, 3, 'duration_ms', result.durationMs)
  appendYamlLine(lines, 3, 'output', result.output)
  if (result.archivePath)
    appendYamlLine(lines, 3, 'archive_path', result.archivePath)
  appendYamlUsage(lines, 3, result.usage)
}

export const formatTasksYaml = (
  tasks: Task[],
  results: TaskResult[],
): string => {
  if (tasks.length === 0 && results.length === 0) return ''
  const resultById = new Map(results.map((result) => [result.taskId, result]))
  const ordered = selectTasksForPrompt(tasks)
  const lines: string[] = ['tasks:']
  if (ordered.length === 0 && results.length > 0) {
    for (const result of results) {
      const fallbackTask: Task = {
        id: result.taskId,
        fingerprint: '',
        prompt: '',
        title: result.title ?? result.taskId,
        status: result.status,
        createdAt: result.completedAt,
        completedAt: result.completedAt,
      }
      formatTaskEntry(fallbackTask, result, lines)
    }
    return escapeCdata(lines.join('\n'))
  }
  for (const task of ordered)
    formatTaskEntry(task, resultById.get(task.id), lines)

  return escapeCdata(lines.join('\n'))
}

export const formatResultsYaml = (
  tasks: Task[],
  results: TaskResult[],
): string => {
  if (results.length === 0) return ''
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const resultById = new Map<string, TaskResult>()
  for (const result of results) {
    const existing = resultById.get(result.taskId)
    if (!existing) {
      resultById.set(result.taskId, result)
      continue
    }
    const existingTs = parseIsoToMs(existing.completedAt)
    const nextTs = parseIsoToMs(result.completedAt)
    if (nextTs >= existingTs) resultById.set(result.taskId, result)
  }
  const ordered = Array.from(resultById.values()).sort((a, b) => {
    const aTs = parseIsoToMs(a.completedAt)
    const bTs = parseIsoToMs(b.completedAt)
    if (aTs !== bTs) return bTs - aTs
    return a.taskId.localeCompare(b.taskId)
  })
  const lines: string[] = []
  if (ordered.length > 0) lines.push('tasks:')
  else lines.push('tasks: []')
  for (const result of ordered) {
    const task = taskById.get(result.taskId)
    const title = task?.title.trim() ?? result.title?.trim() ?? result.taskId
    lines.push(`${yamlIndent(1)}- id: ${yamlScalar(result.taskId)}`)
    appendYamlLine(lines, 2, 'title', title)
    appendYamlLine(lines, 2, 'prompt', task?.prompt ?? '')
    appendYamlLine(lines, 2, 'changed_at', result.completedAt)
    lines.push(`${yamlIndent(2)}result:`)
    appendYamlLine(lines, 3, 'status', result.status)
    appendYamlLine(lines, 3, 'ok', result.ok)
    appendYamlLine(lines, 3, 'completed_at', result.completedAt)
    appendYamlLine(lines, 3, 'duration_ms', result.durationMs)
    appendYamlLine(lines, 3, 'output', result.output)
    if (result.archivePath)
      appendYamlLine(lines, 3, 'archive_path', result.archivePath)
    appendYamlUsage(lines, 3, result.usage)
  }
  return escapeCdata(lines.join('\n'))
}
