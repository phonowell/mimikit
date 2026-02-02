import { runTellerApi } from '../llm/api-runner.js'
import { runCodexSdk } from '../llm/sdk-runner.js'

import {
  buildTellerPrompt,
  buildThinkerPrompt,
  buildWorkerPrompt,
} from './prompt.js'

import type { TellerEnv } from './prompt.js'
import type { HistoryMessage } from '../types/history.js'
import type { Task, TaskResult } from '../types/tasks.js'
import type { TellerNotice } from '../types/teller-notice.js'
import type { ThinkerState } from '../types/thinker-state.js'
import type { TokenUsage } from '../types/usage.js'
import type { UserInput } from '../types/user-input.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const readEnvOptional = (key: string): string | undefined => {
  const raw = process.env[key]
  const trimmed = raw?.trim()
  if (trimmed && trimmed.length > 0) return trimmed
  return undefined
}

const normalizeOptional = (value?: string | null): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const DEFAULT_TELLER_FALLBACK_MODEL = readEnvOptional(
  'MIMIKIT_TELLER_FALLBACK_MODEL',
)

export const runTeller = async (params: {
  workDir: string
  inputs: string[]
  notices: TellerNotice[]
  history: HistoryMessage[]
  env?: TellerEnv
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  fallbackModel?: string
}): Promise<{
  output: string
  elapsedMs: number
  fallbackUsed: boolean
  usage?: TokenUsage
}> => {
  const prompt = await buildTellerPrompt({
    workDir: params.workDir,
    inputs: params.inputs,
    notices: params.notices,
    history: params.history,
    ...(params.env ? { env: params.env } : {}),
  })
  try {
    const model = normalizeOptional(params.model)
    const result = await runTellerApi({
      prompt,
      timeoutMs: params.timeoutMs,
      ...(model ? { model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
    })
    return {
      output: result.output,
      elapsedMs: result.elapsedMs,
      fallbackUsed: false,
      ...(result.usage ? { usage: result.usage } : {}),
    }
  } catch (error) {
    const fallbackModel = normalizeOptional(
      params.fallbackModel ?? DEFAULT_TELLER_FALLBACK_MODEL,
    )
    if (!fallbackModel) throw error
    const llmResult = await runTellerApi({
      prompt,
      timeoutMs: params.timeoutMs,
      model: fallbackModel,
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
    })
    return {
      output: llmResult.output,
      elapsedMs: llmResult.elapsedMs,
      fallbackUsed: true,
      ...(llmResult.usage ? { usage: llmResult.usage } : {}),
    }
  }
}

export const runThinker = async (params: {
  workDir: string
  state: ThinkerState
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  timeoutMs: number
  threadId?: string | null
  model?: string
}): Promise<{
  output: string
  elapsedMs: number
  threadId: string | null
  usage?: TokenUsage
}> => {
  const prompt = await buildThinkerPrompt({
    workDir: params.workDir,
    state: params.state,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
  })
  const llmResult = await runCodexSdk({
    role: 'thinker',
    prompt,
    workDir: params.workDir,
    timeoutMs: params.timeoutMs,
    threadId: params.threadId ?? null,
    ...(params.model ? { model: params.model } : {}),
  })
  return {
    output: llmResult.output,
    elapsedMs: llmResult.elapsedMs,
    ...(llmResult.usage ? { usage: llmResult.usage } : {}),
    threadId: llmResult.threadId ?? null,
  }
}

export const runWorker = async (params: {
  workDir: string
  task: Task
  timeoutMs: number
  model?: string
}): Promise<{ output: string; elapsedMs: number; usage?: TokenUsage }> => {
  const prompt = await buildWorkerPrompt({
    workDir: params.workDir,
    task: params.task,
  })
  const llmResult = await runCodexSdk({
    role: 'worker',
    prompt,
    workDir: params.workDir,
    timeoutMs: params.timeoutMs,
    ...(params.model ? { model: params.model } : {}),
  })
  return {
    output: llmResult.output,
    elapsedMs: llmResult.elapsedMs,
    ...(llmResult.usage ? { usage: llmResult.usage } : {}),
  }
}
