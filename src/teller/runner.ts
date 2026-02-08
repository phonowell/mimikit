import { runApiRunner } from '../llm/api-runner.js'
import { extractTellerDigestSummary } from '../orchestrator/command-parser.js'
import {
  buildTellerDigestPrompt,
  buildTellerPrompt,
} from '../prompts/build-prompts.js'
import { nowIso, shortId } from '../shared/utils.js'

import { buildTaskStatusSummary } from './task-summary.js'

import type {
  HistoryMessage,
  Task,
  TaskResult,
  TellerDigest,
  TokenUsage,
  UserInput,
} from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type TellerUserResponse = {
  text: string
  usage?: TokenUsage
  elapsedMs?: number
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
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  history: HistoryMessage[]
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
}): Promise<TellerDigest> => {
  const prompt = await buildTellerDigestPrompt({
    workDir: params.workDir,
    inputs: params.inputs,
    tasks: params.tasks,
    results: params.results,
    history: params.history,
  })
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
    summary = extractTellerDigestSummary(response.output)
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
}): Promise<TellerUserResponse> => {
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
      const finalText = text || fallback()
      return {
        text: finalText,
        ...(response.usage ? { usage: response.usage } : {}),
        elapsedMs: response.elapsedMs,
      }
    } catch {
      return { text: fallback() }
    }
  })()
}
