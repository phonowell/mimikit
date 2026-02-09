import {
  escapeCdata,
  mapHistoryRole,
  normalizeYamlUsage,
  parseIsoToMs,
  resolveTaskChangedAt,
  stringifyPromptYaml,
} from './format-base.js'

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
  return escapeCdata(
    stringifyPromptYaml({
      messages: sorted,
    }),
  )
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
): Record<string, unknown> => ({
  id: task.id,
  status: task.status,
  title: task.title.trim() || task.id,
  changed_at: resolveTaskChangedAt(task),
  prompt: task.prompt,
  ...(result
    ? {
        result: {
          status: result.status,
          ok: result.ok,
          completed_at: result.completedAt,
          duration_ms: result.durationMs,
          output: result.output,
          ...(result.archivePath ? { archive_path: result.archivePath } : {}),
          usage: normalizeYamlUsage(result.usage),
        },
      }
    : {}),
})

export const formatTasksYaml = (
  tasks: Task[],
  results: TaskResult[],
): string => {
  if (tasks.length === 0 && results.length === 0) return ''
  const resultById = new Map(results.map((result) => [result.taskId, result]))
  const ordered = selectTasksForPrompt(tasks)
  const taskEntries: Array<Record<string, unknown>> = []
  if (ordered.length === 0 && results.length > 0) {
    for (const result of results) {
      const fallbackTask: Task = {
        id: result.taskId,
        fingerprint: '',
        prompt: '',
        title: result.title ?? result.taskId,
        profile: result.profile === 'expert' ? 'expert' : 'standard',
        status: result.status,
        createdAt: result.completedAt,
        completedAt: result.completedAt,
      }
      taskEntries.push(formatTaskEntry(fallbackTask, result))
    }
    return escapeCdata(stringifyPromptYaml({ tasks: taskEntries }))
  }
  for (const task of ordered)
    taskEntries.push(formatTaskEntry(task, resultById.get(task.id)))

  return escapeCdata(stringifyPromptYaml({ tasks: taskEntries }))
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
  const taskEntries: Array<Record<string, unknown>> = []
  for (const result of ordered) {
    const task = taskById.get(result.taskId)
    const title = task?.title.trim() ?? result.title?.trim() ?? result.taskId
    taskEntries.push({
      id: result.taskId,
      title,
      prompt: task?.prompt ?? '',
      changed_at: result.completedAt,
      result: {
        status: result.status,
        ok: result.ok,
        completed_at: result.completedAt,
        duration_ms: result.durationMs,
        output: result.output,
        ...(result.archivePath ? { archive_path: result.archivePath } : {}),
        usage: normalizeYamlUsage(result.usage),
      },
    })
  }
  return escapeCdata(
    stringifyPromptYaml({
      tasks: taskEntries,
    }),
  )
}
