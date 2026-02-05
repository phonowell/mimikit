import { hostname, release as osRelease, type as osType } from 'node:os'

import type { ManagerEnv } from './prompt.js'
import type { BeadsContext } from '../integrations/beads/types.js'
import type { HistoryMessage, Task, TaskResult } from '../types/index.js'

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

const mapHistoryRole = (role: HistoryMessage['role']): string => {
  switch (role) {
    case 'user':
      return 'user'
    case 'manager':
      return 'assistant'
    case 'system':
      return 'system'
    default:
      return 'unknown'
  }
}

export const formatHistory = (history: HistoryMessage[]): string => {
  if (history.length === 0) return ''
  const items = history
    .map((item) => {
      const text = item.text.trim()
      if (!text) return ''
      const role = mapHistoryRole(item.role)
      const content = escapeCdata(text)
      return `<history_message role="${role}" time="${item.createdAt}"><![CDATA[\n${content}\n]]></history_message>`
    })
    .filter((item) => item.length > 0)
  return items.length > 0 ? items.join('\n') : ''
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

export const formatCapabilities = (capabilities?: string): string => {
  const trimmed = capabilities?.trim() ?? ''
  if (!trimmed) return ''
  return escapeCdata(trimmed)
}

export const formatInputs = (inputs: string[]): string => {
  const cleaned = inputs.filter((input) => input.trim().length > 0)
  if (cleaned.length === 0) return ''
  const text = cleaned.map((input) => `- ${input}`).join('\n')
  return escapeCdata(text)
}

export const formatTaskResults = (results: TaskResult[]): string => {
  if (results.length === 0) return ''
  const text = results
    .map((result) => {
      const title = result.title ? ` ${result.title}` : ''
      const archive = result.archivePath
        ? `\narchive: ${result.archivePath}`
        : ''
      return `- [${result.taskId}] ${result.status}${title}\n${result.output}${archive}`
    })
    .join('\n')
  return escapeCdata(text)
}

export const formatQueueStatus = (tasks: Task[]): string => {
  const active = tasks.filter(
    (task) => task.status === 'pending' || task.status === 'running',
  )
  if (active.length === 0) return ''
  const text = active
    .map((task) => `- [${task.id}] ${task.status} ${task.title}`)
    .join('\n')
  return escapeCdata(text)
}

export const formatBeadsContext = (context?: BeadsContext): string => {
  if (!context) return ''
  return escapeCdata(JSON.stringify(context, null, 2))
}

export const buildCdataBlock = (
  comment: string,
  tag: string,
  content: string,
): string => {
  if (!content) return ''
  return `// ${comment}\n<${tag}>\n<![CDATA[\n${content}\n]]>\n</${tag}>`
}

export const buildRawBlock = (
  comment: string,
  tag: string,
  content: string,
): string => {
  if (!content) return ''
  return `// ${comment}\n<${tag}>\n${content}\n</${tag}>`
}
