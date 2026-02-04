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
  if (lines.length === 0) return ''
  return escapeCdata(lines.join('\n'))
}

const formatCapabilities = (capabilities?: string): string => {
  const trimmed = capabilities?.trim() ?? ''
  if (!trimmed) return ''
  return escapeCdata(trimmed)
}

const formatInputs = (inputs: string[]): string => {
  const cleaned = inputs.filter((input) => input.trim().length > 0)
  if (cleaned.length === 0) return ''
  const text = cleaned.map((input) => `- ${input}`).join('\n')
  return escapeCdata(text)
}

const formatTaskResults = (results: TaskResult[]): string => {
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

const formatQueueStatus = (tasks: Task[]): string => {
  const active = tasks.filter(
    (task) => task.status === 'pending' || task.status === 'running',
  )
  if (active.length === 0) return ''
  const text = active
    .map((task) => `- [${task.id}] ${task.status} ${task.title}`)
    .join('\n')
  return escapeCdata(text)
}

const buildCdataBlock = (
  comment: string,
  tag: string,
  content: string,
): string => {
  if (!content) return ''
  return `// ${comment}\n<${tag}>\n<![CDATA[\n${content}\n]]>\n</${tag}>`
}

const buildRawBlock = (
  comment: string,
  tag: string,
  content: string,
): string => {
  if (!content) return ''
  return `// ${comment}\n<${tag}>\n${content}\n</${tag}>`
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
  const workerCapabilitiesPrompt = await loadPromptFile(
    params.workDir,
    'worker',
    'capabilities',
  )
  const inputsText = formatInputs(params.inputs)
  const historyText = formatHistory(params.history)
  const envText = formatEnvironment(params.workDir, params.env)
  const resultsText = formatTaskResults(params.results)
  const tasksText = formatQueueStatus(params.tasks)
  const capabilitiesText = formatCapabilities(workerCapabilitiesPrompt)
  const envBlock = buildCdataBlock(
    '背景信息（仅供参考，不要主动提及）：',
    'environment_context',
    envText,
  )
  const capabilitiesBlock = buildCdataBlock(
    'Worker 能力清单（内部参考）：',
    'worker_capabilities',
    capabilitiesText,
  )
  const historyBlock = buildRawBlock(
    '之前的对话：',
    'conversation_history',
    historyText,
  )
  const inputBlock = buildCdataBlock('用户刚刚说：', 'user_input', inputsText)
  const resultsBlock = buildCdataBlock(
    '已处理的结果（可视情况告知用户）：',
    'task_results',
    resultsText,
  )
  const tasksBlock = buildCdataBlock(
    '待处理事项（内部参考，不要主动汇报）：',
    'pending_tasks',
    tasksText,
  )
  const injectionValues = Object.fromEntries<string>([
    ['environment_context', envBlock],
    ['worker_capabilities', capabilitiesBlock],
    ['conversation_history', historyBlock],
    ['user_input', inputBlock],
    ['task_results', resultsBlock],
    ['pending_tasks', tasksBlock],
  ])
  const injection = renderPromptTemplate(injectionTemplate, injectionValues)
  return joinPromptSections([system, injection])
}

export const buildLocalPrompt = async (params: {
  workDir: string
  input: string
  history: HistoryMessage[]
  env?: ManagerEnv
}): Promise<string> => {
  const system = await loadSystemPrompt(params.workDir, 'local')
  const injectionTemplate = await loadInjectionPrompt(params.workDir, 'local')
  const inputsText = formatInputs([params.input])
  const historyText = formatHistory(params.history)
  const envText = formatEnvironment(params.workDir, params.env)
  const envBlock = buildCdataBlock(
    '背景信息（仅供参考，不要主动提及）：',
    'environment_context',
    envText,
  )
  const historyBlock = buildRawBlock(
    '之前的对话：',
    'conversation_history',
    historyText,
  )
  const inputBlock = buildCdataBlock('用户刚刚说：', 'user_input', inputsText)
  const injectionValues = Object.fromEntries<string>([
    ['environment_context', envBlock],
    ['conversation_history', historyBlock],
    ['user_input', inputBlock],
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
