import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { logSafeError } from '../log/safe.js'

import type { MemoryHit } from '../memory/search.js'
import type { HistoryMessage } from '../types/history.js'
import type { TellerEvent } from '../types/teller.js'

export type PromptMode = 'full' | 'minimal' | 'none'

export type PromptSection = {
  tag: string
  content: string
}

const isNeedsInputEvent = (
  event: TellerEvent,
): event is Extract<TellerEvent, { kind: 'needs_input' }> =>
  event.kind === 'needs_input'

const isPlannerFailedEvent = (
  event: TellerEvent,
): event is Extract<TellerEvent, { kind: 'planner_failed' }> =>
  event.kind === 'planner_failed'

const isTaskResultEvent = (
  event: TellerEvent,
): event is Extract<TellerEvent, { kind: 'task_result' }> =>
  event.kind === 'task_result'

const loadGuide = async (workDir: string, name: string): Promise<string> => {
  const path = join(workDir, 'prompts', 'agents', `${name}.md`)
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined
    if (code === 'ENOENT') return ''
    await logSafeError('loadGuide', error, { meta: { path } })
    throw error
  }
}

const formatHistory = (messages: HistoryMessage[]): string =>
  messages.map((m) => `[${m.createdAt}] ${m.role}: ${m.text}`).join('\n')

const formatMemory = (hits: MemoryHit[]): string =>
  hits.map((h) => `[${h.source}] ${h.content}`).join('\n')

const formatNeedsInput = (events: TellerEvent[]): string => {
  const items = events.filter(isNeedsInputEvent)
  if (items.length === 0) return ''
  return items
    .map((item, idx) => {
      const options =
        item.options && item.options.length > 0
          ? `options=${JSON.stringify(item.options)}`
          : ''
      const def = item.default ? `default=${JSON.stringify(item.default)}` : ''
      return [`#${idx + 1}: ${item.question}`, options, def]
        .filter(Boolean)
        .join(' ')
    })
    .join('\n')
}

const formatPlannerFailures = (events: TellerEvent[]): string => {
  const items = events.filter(isPlannerFailedEvent)
  if (items.length === 0) return ''
  return items.map((item, idx) => `#${idx + 1}: ${item.error}`).join('\n')
}

const formatTaskResults = (events: TellerEvent[]): string => {
  const items = events.filter(isTaskResultEvent)
  if (items.length === 0) return ''
  return items
    .map((item, idx) => {
      const head = `#${idx + 1} ${item.taskId} (${item.status})`
      const body = item.result ?? item.error ?? ''
      return body ? `${head}\n${body}` : head
    })
    .join('\n')
}

const wrapSection = (tag: string, content: string): string => {
  const header = `## ${tag}`
  return content ? `${header}\n${content}` : header
}

export const renderPromptSections = (sections: PromptSection[]): string =>
  sections
    .map((section) => wrapSection(section.tag, section.content))
    .join('\n\n')

const resolvePromptMode = (mode?: PromptMode): PromptMode => mode ?? 'full'

const pushSection = (
  sections: PromptSection[],
  tag: string,
  content: string,
  opts?: { force?: boolean },
): void => {
  if (!opts?.force && !content) return
  sections.push({ tag, content })
}

export const buildTellerPromptSections = async (params: {
  workDir: string
  history: HistoryMessage[]
  memory: MemoryHit[]
  inputs: string[]
  events: TellerEvent[]
  promptMode?: PromptMode
}): Promise<PromptSection[]> => {
  const mode = resolvePromptMode(params.promptMode)
  const includeIdentity = mode !== 'none'
  const includeVoice = mode !== 'none'
  const includeTools = mode !== 'none'
  const includeHistory = mode === 'full'
  const includeMemory = mode === 'full'
  const includeOutput = mode !== 'none'

  const identity = await loadGuide(params.workDir, 'teller/identity')
  const voiceText = await loadGuide(params.workDir, 'teller/voice')
  const toolsText = await loadGuide(params.workDir, 'teller/tools')
  const outputText = await loadGuide(params.workDir, 'teller/output')

  const needsInput = formatNeedsInput(params.events)
  const plannerFailures = formatPlannerFailures(params.events)
  const taskResults = formatTaskResults(params.events)
  const historyText = formatHistory(params.history)
  const memoryText = formatMemory(params.memory)

  const plannerNeedsInput = needsInput
    ? `${needsInput}\n请用 question/options/default 调用 ask_user。`
    : ''
  const plannerFailed = plannerFailures
    ? `${plannerFailures}\n向用户报告失败原因。`
    : ''
  const taskResultsText = taskResults ? `${taskResults}\n向用户概述结果。` : ''

  const sections: PromptSection[] = []

  if (includeIdentity) pushSection(sections, 'identity', identity)
  if (includeVoice) pushSection(sections, 'voice', voiceText)
  if (includeTools) pushSection(sections, 'tools', toolsText)
  pushSection(sections, 'user_inputs', params.inputs.join('\n'), {
    force: true,
  })

  pushSection(sections, 'planner_needs_input', plannerNeedsInput)
  pushSection(sections, 'planner_failed', plannerFailed)
  pushSection(sections, 'task_results', taskResultsText)
  if (includeHistory) pushSection(sections, 'history', historyText)
  if (includeMemory) pushSection(sections, 'memory', memoryText)

  if (includeOutput)
    pushSection(sections, 'output', outputText, { force: true })

  return sections
}

export const buildTellerPrompt = async (params: {
  workDir: string
  history: HistoryMessage[]
  memory: MemoryHit[]
  inputs: string[]
  events: TellerEvent[]
  promptMode?: PromptMode
}): Promise<string> =>
  renderPromptSections(await buildTellerPromptSections(params))

export const buildPlannerPromptSections = async (params: {
  workDir: string
  history: HistoryMessage[]
  memory: MemoryHit[]
  request: string
  promptMode?: PromptMode
}): Promise<PromptSection[]> => {
  const mode = resolvePromptMode(params.promptMode)
  const includeIdentity = mode !== 'none'
  const includeTools = mode !== 'none'
  const includeRules = mode !== 'none'
  const includeHistory = mode === 'full'
  const includeMemory = mode === 'full'
  const includeOutput = mode !== 'none'

  const identity = await loadGuide(params.workDir, 'planner/identity')
  const toolsText = await loadGuide(params.workDir, 'planner/tools')
  const rulesText = await loadGuide(params.workDir, 'planner/rules')
  const outputText = await loadGuide(params.workDir, 'planner/output')

  const historyText = formatHistory(params.history)
  const memoryText = formatMemory(params.memory)

  const sections: PromptSection[] = []

  if (includeIdentity) pushSection(sections, 'identity', identity)
  if (includeTools) pushSection(sections, 'tools', toolsText)
  if (includeRules) pushSection(sections, 'rules', rulesText)
  pushSection(sections, 'user_request', params.request, { force: true })
  if (includeHistory) pushSection(sections, 'history', historyText)
  if (includeMemory) pushSection(sections, 'memory', memoryText)

  if (includeOutput)
    pushSection(sections, 'output', outputText, { force: true })

  return sections
}

export const buildPlannerPrompt = async (params: {
  workDir: string
  history: HistoryMessage[]
  memory: MemoryHit[]
  request: string
  promptMode?: PromptMode
}): Promise<string> =>
  renderPromptSections(await buildPlannerPromptSections(params))

export const buildWorkerPromptSections = async (params: {
  workDir: string
  taskPrompt: string
  promptMode?: PromptMode
}): Promise<PromptSection[]> => {
  const mode = resolvePromptMode(params.promptMode)
  const includeIdentity = mode !== 'none'
  const includeTools = mode !== 'none'
  const includeRules = mode !== 'none'
  const includeOutput = mode !== 'none'

  const identity = await loadGuide(params.workDir, 'worker/identity')
  const toolsText = await loadGuide(params.workDir, 'worker/tools')
  const rulesText = await loadGuide(params.workDir, 'worker/rules')
  const outputText = await loadGuide(params.workDir, 'worker/output')

  const sections: PromptSection[] = []

  if (includeIdentity) pushSection(sections, 'identity', identity)
  if (includeTools) pushSection(sections, 'tools', toolsText)
  if (includeRules) pushSection(sections, 'rules', rulesText)
  pushSection(sections, 'task', params.taskPrompt, { force: true })
  if (includeOutput)
    pushSection(sections, 'output', outputText, { force: true })

  return sections
}

export const buildWorkerPrompt = async (params: {
  workDir: string
  taskPrompt: string
  promptMode?: PromptMode
}): Promise<string> =>
  renderPromptSections(await buildWorkerPromptSections(params))
