import { readFile } from 'node:fs/promises'
import { hostname, release as osRelease, type as osType } from 'node:os'
import { join } from 'node:path'

import { logSafeError } from '../log/safe.js'

import type { HistoryMessage } from '../types/history.js'
import type { Task, TaskResult } from '../types/tasks.js'

export type ManagerEnv = {
  lastUser?: {
    source?: string
    remote?: string
    userAgent?: string
    language?: string
    clientLocale?: string
    clientTimeZone?: string
    clientOffsetMinutes?: number
    clientNowIso?: string
  }
}

type PromptTemplateValues = Record<string, string>

const loadPromptFile = async (
  workDir: string,
  role: string,
  name: string,
): Promise<string> => {
  const path = join(workDir, 'prompts', 'agents', role, `${name}.md`)
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined
    if (code === 'ENOENT') return ''
    await logSafeError('loadPromptFile', error, { meta: { path } })
    throw error
  }
}

const loadSystemPrompt = (workDir: string, role: string): Promise<string> =>
  loadPromptFile(workDir, role, 'system')

const loadInjectionPrompt = (workDir: string, role: string): Promise<string> =>
  loadPromptFile(workDir, role, 'injection')

const renderPromptTemplate = (
  template: string,
  values: PromptTemplateValues,
): string =>
  template.replace(/\{([^}]+)\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return match
    return values[key] ?? match
  })

const joinPromptSections = (sections: string[]): string => {
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

const formatHistory = (history: HistoryMessage[]): string => {
  if (history.length === 0)
    return `<history_message role="system"><![CDATA[\n（无）\n]]></history_message>`
  return history
    .map((item) => {
      const role = mapHistoryRole(item.role)
      const text = item.text.trim()
      const content = text.length > 0 ? escapeCdata(text) : '（空）'
      return `<history_message role="${role}"><![CDATA[\n${content}\n]]></history_message>`
    })
    .join('\n')
}

const formatEnvironment = (workDir: string, env?: ManagerEnv): string => {
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
  const text = lines.length > 0 ? lines.join('\n') : '（无）'
  return escapeCdata(text)
}

const formatInputs = (inputs: string[]): string => {
  if (inputs.length === 0) return '（无）'
  const text = inputs.map((input) => `- ${input}`).join('\n')
  return escapeCdata(text)
}

const formatTaskResults = (results: TaskResult[]): string => {
  if (results.length === 0) return '（无）'
  const text = results
    .map((result) => {
      const status = result.ok ? 'ok' : 'error'
      return `- [${result.taskId}] ${status}\n${result.output}`
    })
    .join('\n')
  return escapeCdata(text)
}

const formatQueueStatus = (tasks: Task[]): string => {
  const pending = tasks.filter((task) => task.status === 'pending')
  if (pending.length === 0) return '（无）'
  const text = pending.map((task) => `- [${task.id}] ${task.prompt}`).join('\n')
  return escapeCdata(text)
}

export const buildManagerPrompt = async (params: {
  workDir: string
  inputs: string[]
  results: TaskResult[]
  tasks: Task[]
  history: HistoryMessage[]
  env?: ManagerEnv
}): Promise<string> => {
  const system = await loadSystemPrompt(params.workDir, 'manager')
  const injectionTemplate = await loadInjectionPrompt(params.workDir, 'manager')
  const inputsText = formatInputs(params.inputs)
  const historyText = formatHistory(params.history)
  const envText = formatEnvironment(params.workDir, params.env)
  const resultsText = formatTaskResults(params.results)
  const tasksText = formatQueueStatus(params.tasks)
  const injectionValues = Object.fromEntries<string>([
    ['环境信息', envText],
    ['历史对话', historyText],
    ['用户输入', inputsText],
    ['任务完成情况', resultsText],
    ['当前任务队列', tasksText],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}

export const buildWorkerPrompt = async (params: {
  workDir: string
  task: Task
}): Promise<string> => {
  const system = await loadSystemPrompt(params.workDir, 'worker')
  const injectionTemplate = await loadInjectionPrompt(params.workDir, 'worker')
  const injectionValues = Object.fromEntries<string>([
    ['任务描述', params.task.prompt],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}
