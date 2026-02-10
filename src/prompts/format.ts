import { hostname, release as osRelease, type as osType } from 'node:os'

import { escapeCdata, normalizeTagName } from './format-base.js'

import type { ManagerEnv } from '../types/index.js'

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
  if (env?.taskSummary) {
    push('task_pending', env.taskSummary.pending)
    push('task_running', env.taskSummary.running)
    push('task_succeeded', env.taskSummary.succeeded)
    push('task_failed', env.taskSummary.failed)
    push('task_canceled', env.taskSummary.canceled)
  }
  if (lines.length === 0) return ''
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

export {
  formatDecesionsYaml,
  formatHistory,
  formatInputs,
  formatResultsYaml,
  formatTasksYaml,
  selectTasksForPrompt,
} from './format-content.js'
