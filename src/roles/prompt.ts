import { readFile } from 'node:fs/promises'
import { hostname, release as osRelease, type as osType } from 'node:os'
import { join } from 'node:path'

import { logSafeError } from '../log/safe.js'

import type { HistoryMessage } from '../types/history.js'
import type { Task, TaskResult } from '../types/tasks.js'
import type { TellerNotice } from '../types/teller-notice.js'
import type { ThinkerState } from '../types/thinker-state.js'
import type { UserInput } from '../types/user-input.js'

export type TellerEnv = {
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

const formatInputs = (inputs: UserInput[]): string => {
  if (inputs.length === 0) return '（无）'
  return inputs
    .map((input) => {
      const summary = input.summary ?? input.text ?? ''
      const metaParts: string[] = []
      if (input.sourceIds?.length)
        metaParts.push(`sources=${input.sourceIds.join(',')}`)
      if (input.updatedAt) metaParts.push(`updated_at=${input.updatedAt}`)
      const meta = metaParts.length > 0 ? ` ${metaParts.join(' ')}` : ''
      return `- [${input.id}${meta}] ${summary}`
    })
    .join('\n')
}

const formatNotices = (notices: TellerNotice[]): string => {
  if (notices.length === 0) return '（无）'
  const lines = notices
    .map((notice) => notice.fact ?? notice.message ?? '')
    .map((fact) => fact.trim())
    .filter((fact) => fact.length > 0)
    .map((fact) => `- ${fact}`)
  return lines.length > 0 ? lines.join('\n') : '（无）'
}

const formatHistory = (history: HistoryMessage[]): string => {
  if (history.length === 0) return '（无）'
  return history.map((item) => `- [${item.role}] ${item.text}`).join('\n')
}

const formatEnvironment = (workDir: string, env?: TellerEnv): string => {
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

const formatTaskResults = (results: TaskResult[]): string => {
  if (results.length === 0) return '（无）'
  return results
    .map((result) => `- [${result.taskId}] ${result.status}\n${result.output}`)
    .join('\n')
}

const formatQueueStatus = (tasks: Task[]): string => {
  if (tasks.length === 0) return '（无）'
  return tasks
    .map((task) => {
      const blocked = task.blockedBy?.length
        ? ` blocked_by=${task.blockedBy.join(',')}`
        : ''
      const scheduled = task.scheduledAt
        ? ` scheduled_at=${task.scheduledAt}`
        : ''
      return `- [${task.id}] ${task.status} p${task.priority}${blocked}${scheduled}\n${task.prompt}`
    })
    .join('\n')
}

export const buildTellerPrompt = async (params: {
  workDir: string
  inputs: string[]
  notices: TellerNotice[]
  history: HistoryMessage[]
  env?: TellerEnv
}): Promise<string> => {
  const system = await loadSystemPrompt(params.workDir, 'teller')
  const inputsText =
    params.inputs.length > 0 ? params.inputs.join('\n') : '（无）'
  const historyText = formatHistory(params.history)
  const envText = formatEnvironment(params.workDir, params.env)
  const noticesText = formatNotices(params.notices)
  return `${system}\n\n环境信息：\n${envText}\n\n历史对话：\n${historyText}\n\n用户消息：\n${inputsText}\n\n系统通知：\n${noticesText}`
}

export const buildThinkerPrompt = async (params: {
  workDir: string
  state: ThinkerState
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
}): Promise<string> => {
  const system = await loadSystemPrompt(params.workDir, 'thinker')
  const inputsText = formatInputs(params.inputs)
  const resultsText = formatTaskResults(params.results)
  const tasksText = formatQueueStatus(params.tasks)
  const notes = params.state.notes.trim()
  const notesBlock = notes ? `\n\n你的笔记：\n${notes}` : ''
  return `${system}\n\n整理后的用户输入：\n${inputsText}\n\n任务完成情况：\n${resultsText}\n\n当前队列状态：\n${tasksText}${notesBlock}`
}

export const buildWorkerPrompt = async (params: {
  workDir: string
  task: Task
}): Promise<string> => {
  const system = await loadSystemPrompt(params.workDir, 'worker')
  return `${system}\n\n任务描述：\n${params.task.prompt}`
}
