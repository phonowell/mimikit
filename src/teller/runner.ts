import { runApiRunner } from '../llm/api-runner.js'
import { buildTellerPrompt } from '../prompts/build-prompts.js'
import {
  formatHistory,
  formatInputs,
  formatTasksYaml,
} from '../prompts/format.js'
import { nowIso, shortId } from '../shared/utils.js'

import { buildTaskStatusSummary } from './task-summary.js'

import type { TellerDigest } from '../contracts/channels.js'
import type {
  HistoryMessage,
  Task,
  TaskResult,
  UserInput,
} from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const buildSummaryPrompt = (params: {
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  history: HistoryMessage[]
}): string => {
  const inputText = formatInputs(params.inputs)
  const historyText = formatHistory(params.history)
  const taskText = formatTasksYaml(params.tasks, params.results)
  return [
    '你是 teller，负责对用户当下重点做去噪摘要，供 thinker 决策。',
    '仅输出摘要正文，不要命令、不要代码块、不要解释流程。',
    '优先包含：目标、约束、优先级、未决问题、已知结果。',
    '',
    '【用户输入】',
    inputText || '(empty)',
    '',
    '【任务状态摘要】',
    taskText || '(empty)',
    '',
    '【历史对话】',
    historyText || '(empty)',
  ].join('\n')
}

const fallbackSummary = (params: {
  inputs: UserInput[]
  results: TaskResult[]
}): string => {
  const latestInput = params.inputs.at(-1)?.text.trim()
  if (latestInput) return latestInput
  const latestResult = params.results.at(-1)?.output.trim()
  if (latestResult) return latestResult.slice(0, 300)
  return '继续处理当前任务并保持与用户最新目标一致。'
}

export const runTellerDigest = async (params: {
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  history: HistoryMessage[]
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
}): Promise<TellerDigest> => {
  const prompt = buildSummaryPrompt(params)
  let summary = ''
  try {
    const response = await runApiRunner({
      prompt,
      timeoutMs: params.timeoutMs,
      ...(params.model ? { model: params.model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
    })
    summary = response.output.trim()
  } catch {
    summary = ''
  }
  const finalSummary = summary || fallbackSummary(params)
  return {
    digestId: `digest-${shortId()}`,
    summary: finalSummary,
    inputs: params.inputs,
    results: params.results,
    taskSummary: buildTaskStatusSummary(params.tasks),
  }
}

export const formatDecisionForUser = (params: {
  workDir: string
  tasks: Task[]
  history: HistoryMessage[]
  decision: string
  inputIds: string[]
  inputs: UserInput[]
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
}): Promise<string> => {
  const fallback = () => {
    const text = params.decision.trim()
    if (text.length > 0) return text
    const quoted = params.inputs
      .filter((input) => params.inputIds.includes(input.id))
      .map((input) => input.text.trim())
      .filter(Boolean)
    if (quoted.length > 0) return quoted.at(-1) ?? '收到，我继续处理。'
    return `收到（${nowIso()}），我继续处理。`
  }
  return (async () => {
    try {
      const prompt = await buildTellerPrompt({
        workDir: params.workDir,
        inputs: params.inputs,
        tasks: params.tasks,
        history: params.history,
        thinkerDecision: params.decision,
      })
      const response = await runApiRunner({
        prompt,
        timeoutMs: params.timeoutMs,
        ...(params.model ? { model: params.model } : {}),
        ...(params.modelReasoningEffort
          ? { modelReasoningEffort: params.modelReasoningEffort }
          : {}),
      })
      const text = response.output.trim()
      if (!text) return fallback()
      return text
    } catch {
      return fallback()
    }
  })()
}
