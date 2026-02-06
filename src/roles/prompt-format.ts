import { hostname, release as osRelease, type as osType } from 'node:os'

import type { ManagerEnv } from './prompt.js'
import type {
  HistoryMessage,
  Task,
  TaskResult,
  UserInput,
} from '../types/index.js'

type PromptTemplateValues = Record<string, string>

export const renderPromptTemplate = (
  template: string,
  values: PromptTemplateValues,
): string =>
  template.replace(/\{([^}]+)\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return match
    return values[key] ?? match
  })

export const joinPromptSections = (sections: string[]): string => {
  let output = ''
  for (const section of sections) {
    if (!section) continue
    output = output ? `${output}\n\n${section}` : section
  }
  return output
}

const escapeCdata = (value: string): string =>
  value.replaceAll(']]>', ']]]]><![CDATA[>')

const TAG_PREFIX = 'MIMIKIT:'

const normalizeTagName = (tag: string): string => {
  const trimmed = tag.trim()
  if (!trimmed) return TAG_PREFIX
  return trimmed.startsWith(TAG_PREFIX) ? trimmed : `${TAG_PREFIX}${trimmed}`
}

const mapHistoryRole = (role: HistoryMessage['role']): string => {
  switch (role) {
    case 'user':
      return 'user'
    case 'manager':
      return 'agent'
    case 'system':
      return 'system'
    default:
      return 'unknown'
  }
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
        quote: item.quote,
        content,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  if (entries.length === 0) return ''
  const sorted = [...entries].sort((a, b) => {
    const aTs = parseIsoToMs(a.time)
    const bTs = parseIsoToMs(b.time)
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })
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

export const formatEnvironment = (
  workDir: string,
  env?: ManagerEnv,
): string => {
  const now = new Date()
  const resolved = Intl.DateTimeFormat().resolvedOptions()
  const lines: string[] = []
  const push = (label: string, value: string | number | undefined) => {
    if (value === undefined || value === '') return
    lines.push(`- ${label}: ${value}`)
  }
  push('now_iso', now.toISOString())
  push('now_local', now.toLocaleString())
  push('time_zone', resolved.timeZone)
  push('tz_offset_minutes', now.getTimezoneOffset())
  push('locale', resolved.locale)
  push('node', process.version)
  push('platform', `${process.platform} ${process.arch}`)
  push('os', `${osType()} ${osRelease()}`)
  push('hostname', hostname())
  push('work_dir', workDir)
  const last = env?.lastUser
  if (last) {
    push('user_source', last.source)
    push('user_remote', last.remote)
    push('user_agent', last.userAgent)
    push('user_language', last.language)
    push('client_locale', last.clientLocale)
    push('client_time_zone', last.clientTimeZone)
    if (typeof last.clientOffsetMinutes === 'number')
      push('client_tz_offset_minutes', last.clientOffsetMinutes)
    push('client_now_iso', last.clientNowIso)
  }
  if (lines.length === 0) return ''
  return escapeCdata(lines.join('\n'))
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
        quote: input.quote,
        content,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  if (entries.length === 0) return ''
  const sorted = [...entries].sort((a, b) => {
    const aTs = parseIsoToMs(a.time)
    const bTs = parseIsoToMs(b.time)
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })
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

const resolveTaskChangedAt = (task: Task): string =>
  task.completedAt ?? task.startedAt ?? task.createdAt

const parseIsoToMs = (value: string): number => {
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

export const selectTasksForPrompt = (tasks: Task[]): Task[] => {
  if (tasks.length === 0) return []
  const sorted = [...tasks].sort((a, b) => {
    const aTs = parseIsoToMs(resolveTaskChangedAt(a))
    const bTs = parseIsoToMs(resolveTaskChangedAt(b))
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })
  return sorted
}

const yamlIndent = (level: number): string => '  '.repeat(level)

const yamlScalar = (value: string | number | boolean): string => {
  if (typeof value === 'number')
    return Number.isFinite(value) ? `${value}` : '0'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return JSON.stringify(value)
}

const appendYamlLine = (
  lines: string[],
  level: number,
  key: string,
  value: string | number | boolean,
): void => {
  lines.push(`${yamlIndent(level)}${key}: ${yamlScalar(value)}`)
}

const appendYamlUsage = (
  lines: string[],
  level: number,
  usage?: Task['usage'],
): void => {
  if (!usage) return
  const entries: Array<[string, number]> = []
  if (typeof usage.input === 'number') entries.push(['input', usage.input])
  if (typeof usage.output === 'number') entries.push(['output', usage.output])
  if (typeof usage.total === 'number') entries.push(['total', usage.total])
  if (entries.length === 0) return
  lines.push(`${yamlIndent(level)}usage:`)
  for (const [key, val] of entries)
    lines.push(`${yamlIndent(level + 1)}${key}: ${val}`)
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

export const buildCdataBlock = (tag: string, content: string): string => {
  if (!content) return ''
  const normalized = normalizeTagName(tag)
  return `<${normalized}>\n<![CDATA[\n${content}\n]]>\n</${normalized}>`
}

export const buildRawBlock = (tag: string, content: string): string => {
  if (!content) return ''
  const normalized = normalizeTagName(tag)
  return `<${normalized}>\n${content}\n</${normalized}>`
}
