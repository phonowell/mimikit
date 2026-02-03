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

const loadSystemPrompt = async (
  workDir: string,
  role: string,
): Promise<string> => {
  const path = join(workDir, 'prompts', 'agents', role, 'system.md')
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined
    if (code === 'ENOENT') return ''
    await logSafeError('loadSystemPrompt', error, { meta: { path } })
    throw error
  }
}

const formatHistory = (history: HistoryMessage[]): string => {
  if (history.length === 0) return '（无）'
  return history.map((item) => `- [${item.role}] ${item.text}`).join('\n')
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
  return lines.length > 0 ? lines.join('\n') : '（无）'
}

const formatInputs = (inputs: string[]): string => {
  if (inputs.length === 0) return '（无）'
  return inputs.map((input) => `- ${input}`).join('\n')
}

const formatTaskResults = (results: TaskResult[]): string => {
  if (results.length === 0) return '（无）'
  return results
    .map((result) => {
      const status = result.ok ? 'ok' : 'error'
      return `- [${result.taskId}] ${status}\n${result.output}`
    })
    .join('\n')
}

const formatQueueStatus = (tasks: Task[]): string => {
  const pending = tasks.filter((task) => task.status === 'pending')
  if (pending.length === 0) return '（无）'
  return pending.map((task) => `- [${task.id}] ${task.prompt}`).join('\n')
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
  const inputsText = formatInputs(params.inputs)
  const historyText = formatHistory(params.history)
  const envText = formatEnvironment(params.workDir, params.env)
  const resultsText = formatTaskResults(params.results)
  const tasksText = formatQueueStatus(params.tasks)
  return `${system}\n\n环境信息（背景上下文，仅在相关时参考，无需主动提及）：\n${envText}\n\n历史对话：\n${historyText}\n\n用户消息：\n${inputsText}\n\n任务完成情况（如有需要可告知用户）：\n${resultsText}\n\n当前任务队列（无需主动汇报）：\n${tasksText}`
}

export const buildWorkerPrompt = async (params: {
  workDir: string
  task: Task
}): Promise<string> => {
  const system = await loadSystemPrompt(params.workDir, 'worker')
  return `${system}\n\n任务描述：\n${params.task.prompt}`
}
