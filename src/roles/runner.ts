import { runOllama } from '../llm/ollama.js'
import { runCodexSdk } from '../llm/sdk-runner.js'

import {
  buildTellerPrompt,
  buildThinkerPrompt,
  buildWorkerPrompt,
} from './prompt.js'

import type { Task, TaskResult } from '../types/tasks.js'
import type { TellerNotice } from '../types/teller-notice.js'
import type { ThinkerState } from '../types/thinker-state.js'
import type { UserInput } from '../types/user-input.js'

const readEnvModel = (key: string, fallback: string): string => {
  const raw = process.env[key]
  const trimmed = raw?.trim()
  if (trimmed && trimmed.length > 0) return trimmed
  return fallback
}

const DEFAULT_TELLER_MODEL = readEnvModel('MIMIKIT_TELLER_MODEL', 'qwen2.5:7b')
const DEFAULT_TELLER_FALLBACK_MODEL = readEnvModel(
  'MIMIKIT_TELLER_FALLBACK_MODEL',
  '',
)

export const runTeller = async (params: {
  workDir: string
  inputs: string[]
  notices: TellerNotice[]
  timeoutMs: number
  model?: string
  fallbackModel?: string
}): Promise<{ output: string; elapsedMs: number; fallbackUsed: boolean }> => {
  const prompt = await buildTellerPrompt({
    workDir: params.workDir,
    inputs: params.inputs,
    notices: params.notices,
  })
  try {
    const result = await runOllama({
      model: params.model ?? DEFAULT_TELLER_MODEL,
      prompt,
      timeoutMs: params.timeoutMs,
    })
    return {
      output: result.output,
      elapsedMs: result.elapsedMs,
      fallbackUsed: false,
    }
  } catch (error) {
    const fallbackModel = params.fallbackModel ?? DEFAULT_TELLER_FALLBACK_MODEL
    if (!fallbackModel) throw error
    const llmResult = await runCodexSdk({
      role: 'teller',
      prompt,
      workDir: params.workDir,
      timeoutMs: params.timeoutMs,
      model: fallbackModel,
    })
    return {
      output: llmResult.output,
      elapsedMs: llmResult.elapsedMs,
      fallbackUsed: true,
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
}): Promise<{ output: string; elapsedMs: number; threadId: string | null }> => {
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
    threadId: llmResult.threadId ?? null,
  }
}

export const runWorker = async (params: {
  workDir: string
  task: Task
  timeoutMs: number
  model?: string
}): Promise<{ output: string; elapsedMs: number }> => {
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
  return { output: llmResult.output, elapsedMs: llmResult.elapsedMs }
}
