import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { MemoryHit } from '../memory/search.js'
import type { HistoryMessage } from '../types/history.js'
import type { TellerEvent } from '../types/teller.js'

const loadGuide = async (workDir: string, name: string): Promise<string> => {
  const path = join(workDir, 'docs', 'agents', `${name}.md`)
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
  const items = events.filter((e) => e.kind === 'needs_input')
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
  const items = events.filter((e) => e.kind === 'planner_failed')
  if (items.length === 0) return ''
  return items.map((item, idx) => `#${idx + 1}: ${item.error}`).join('\n')
}

const formatTaskResults = (events: TellerEvent[]): string => {
  const items = events.filter((e) => e.kind === 'task_result')
  if (items.length === 0) return ''
  return items
    .map((item, idx) => {
      const head = `#${idx + 1} ${item.taskId} (${item.status})`
      const body = item.result ?? item.error ?? ''
      return body ? `${head}\n${body}` : head
    })
    .join('\n')
}

export const buildTellerPrompt = async (params: {
  workDir: string
  history: HistoryMessage[]
  memory: MemoryHit[]
  inputs: string[]
  events: TellerEvent[]
}): Promise<string> => {
  const guide = await loadGuide(params.workDir, 'teller')
  const needsInput = formatNeedsInput(params.events)
  const plannerFailures = formatPlannerFailures(params.events)
  const taskResults = formatTaskResults(params.events)
  return [
    'You are the Mimikit runtime teller.',
    guide,
    '## User Inputs',
    params.inputs.join('\n'),
    ...(needsInput
      ? [
          '## Planner Needs Input',
          needsInput,
          'Call ask_user with the question/options/default.',
        ]
      : []),
    ...(plannerFailures
      ? ['## Planner Failed', plannerFailures, 'Report failure to user.']
      : []),
    ...(taskResults
      ? ['## Task Results', taskResults, 'Summarize results to user.']
      : []),
    '## History',
    formatHistory(params.history),
    '## Memory',
    formatMemory(params.memory),
    '## Output',
    'Return tool calls as JSON lines. Example: {"tool":"reply","args":{"text":"..."}}',
    'Always call reply once for each user input unless you call ask_user.',
    'If you delegate work, still reply with a brief acknowledgment.',
  ].join('\n\n')
}

export const buildPlannerPrompt = async (params: {
  workDir: string
  history: HistoryMessage[]
  memory: MemoryHit[]
  request: string
}): Promise<string> => {
  const guide = await loadGuide(params.workDir, 'planner')
  return [
    guide,
    '## User Request',
    params.request,
    '## History',
    formatHistory(params.history),
    '## Memory',
    formatMemory(params.memory),
    '## Output',
    'Return tool calls as JSON lines. Example: {"tool":"delegate","args":{...}}',
    'If you need user input, add a final JSON line:',
    '{"result":{"status":"needs_input","question":"...","options":["..."],"default":"..."}}',
    'If planning is complete, add a final JSON line with tasks/triggers:',
    '{"result":{"status":"done","tasks":[{"prompt":"...","priority":5}],"triggers":[{"type":"scheduled","prompt":"...","runAt":"..."}]}}',
    'On failure: {"result":{"status":"failed","error":"..."}}',
  ].join('\n\n')
}

export const buildWorkerPrompt = async (params: {
  workDir: string
  taskPrompt: string
}): Promise<string> => {
  const guide = await loadGuide(params.workDir, 'worker')
  return [guide, '## Task', params.taskPrompt].join('\n\n')
}
