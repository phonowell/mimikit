import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { MemoryHit } from '../memory/search.js'
import type { HistoryMessage } from '../types/history.js'
import type { TellerEvent } from '../types/teller.js'

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
  } catch {
    return ''
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

const wrapTag = (tag: string, content: string): string =>
  `<${tag}>\n${content}\n</${tag}>`

const pushIf = (items: string[], tag: string, content: string): void => {
  if (!content) return
  items.push(wrapTag(tag, content))
}

export const buildTellerPrompt = async (params: {
  workDir: string
  history: HistoryMessage[]
  memory: MemoryHit[]
  inputs: string[]
  events: TellerEvent[]
}): Promise<string> => {
  const identity = await loadGuide(params.workDir, 'teller/identity')
  const outputText = await loadGuide(params.workDir, 'teller/output')

  const needsInput = formatNeedsInput(params.events)
  const plannerFailures = formatPlannerFailures(params.events)
  const taskResults = formatTaskResults(params.events)
  const historyText = formatHistory(params.history)
  const memoryText = formatMemory(params.memory)

  const plannerNeedsInput = needsInput
    ? `${needsInput}\nCall ask_user with the question/options/default.`
    : ''
  const plannerFailed = plannerFailures
    ? `${plannerFailures}\nReport failure to user.`
    : ''
  const taskResultsText = taskResults
    ? `${taskResults}\nSummarize results to user.`
    : ''

  const sections: string[] = []

  pushIf(sections, 'identity', identity)
  sections.push(wrapTag('user_inputs', params.inputs.join('\n')))

  pushIf(sections, 'planner_needs_input', plannerNeedsInput)
  pushIf(sections, 'planner_failed', plannerFailed)
  pushIf(sections, 'task_results', taskResultsText)
  pushIf(sections, 'history', historyText)
  pushIf(sections, 'memory', memoryText)

  sections.push(wrapTag('output', outputText))

  return sections.join('\n\n')
}

export const buildPlannerPrompt = async (params: {
  workDir: string
  history: HistoryMessage[]
  memory: MemoryHit[]
  request: string
}): Promise<string> => {
  const guide = await loadGuide(params.workDir, 'planner/guide')
  const outputText = await loadGuide(params.workDir, 'planner/output')

  const historyText = formatHistory(params.history)
  const memoryText = formatMemory(params.memory)

  const sections: string[] = []

  pushIf(sections, 'guide', guide)
  sections.push(wrapTag('user_request', params.request))
  pushIf(sections, 'history', historyText)
  pushIf(sections, 'memory', memoryText)

  sections.push(wrapTag('output', outputText))

  return sections.join('\n\n')
}

export const buildWorkerPrompt = async (params: {
  workDir: string
  taskPrompt: string
}): Promise<string> => {
  const guide = await loadGuide(params.workDir, 'worker/guide')

  const sections: string[] = []

  pushIf(sections, 'guide', guide)
  sections.push(wrapTag('task', params.taskPrompt))

  return sections.join('\n\n')
}
