import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { logSafeError } from '../log/safe.js'

import {
  buildCdataBlock,
  buildRawBlock,
  formatCapabilities,
  formatEnvironment,
  formatHistory,
  formatInputs,
  formatQueueStatus,
  formatTaskResults,
  joinPromptSections,
  renderPromptTemplate,
} from './prompt-format.js'

import type { HistoryMessage, Task, TaskResult } from '../types/index.js'

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
  const injectionValues = Object.fromEntries<string>([
    [
      'environment_context',
      buildCdataBlock(
        '背景信息（仅供参考，不要主动提及）：',
        'environment_context',
        formatEnvironment(params.workDir, params.env),
      ),
    ],
    [
      'worker_capabilities',
      buildCdataBlock(
        'Worker 能力清单（内部参考）：',
        'worker_capabilities',
        formatCapabilities(workerCapabilitiesPrompt),
      ),
    ],
    [
      'conversation_history',
      buildRawBlock(
        '之前的对话：',
        'conversation_history',
        formatHistory(params.history),
      ),
    ],
    [
      'user_input',
      buildCdataBlock('用户刚刚说：', 'user_input', formatInputs(params.inputs)),
    ],
    [
      'task_results',
      buildCdataBlock(
        '已处理的结果（可视情况告知用户）：',
        'task_results',
        formatTaskResults(params.results),
      ),
    ],
    [
      'pending_tasks',
      buildCdataBlock(
        '待处理事项（内部参考，不要主动汇报）：',
        'pending_tasks',
        formatQueueStatus(params.tasks),
      ),
    ],
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
  const systemTemplate = await loadSystemPrompt(params.workDir, 'local')
  const system = renderPromptTemplate(systemTemplate, {
    user_input: params.input,
  })
  return joinPromptSections([system])
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
