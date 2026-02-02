import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { logSafeError } from '../log/safe.js'

import type { Task, TaskResult } from '../types/tasks.js'
import type { TellerNotice } from '../types/teller-notice.js'
import type { ThinkerState } from '../types/thinker-state.js'
import type { UserInput } from '../types/user-input.js'

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
  return inputs.map((input) => `- [${input.id}] ${input.text}`).join('\n')
}

const formatNotices = (notices: TellerNotice[]): string => {
  if (notices.length === 0) return '（无）'
  return notices.map((notice) => `- ${notice.message}`).join('\n')
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
}): Promise<string> => {
  const system = await loadSystemPrompt(params.workDir, 'teller')
  const inputsText =
    params.inputs.length > 0 ? params.inputs.join('\n') : '（无）'
  const noticesText = formatNotices(params.notices)
  return `${system}\n\n用户消息：\n${inputsText}\n\n系统通知：\n${noticesText}`
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
  return `${system}\n\n新的用户输入：\n${inputsText}\n\n任务完成情况：\n${resultsText}\n\n当前队列状态：\n${tasksText}${notesBlock}`
}

export const buildWorkerPrompt = async (params: {
  workDir: string
  task: Task
}): Promise<string> => {
  const system = await loadSystemPrompt(params.workDir, 'worker')
  return `${system}\n\n任务描述：\n${params.task.prompt}`
}
