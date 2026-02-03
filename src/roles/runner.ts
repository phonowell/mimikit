import { runManagerApi } from '../llm/api-runner.js'
import { runCodexSdk } from '../llm/sdk-runner.js'
import { appendLlmArchive } from '../storage/llm-archive.js'

import { buildManagerPrompt, buildWorkerPrompt } from './prompt.js'

import type { ManagerEnv } from './prompt.js'
import type { TokenUsage } from '../types/common.js'
import type { HistoryMessage } from '../types/history.js'
import type { Task, TaskResult } from '../types/tasks.js'
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

const DEFAULT_MANAGER_FALLBACK_MODEL = readEnvOptional('MIMIKIT_FALLBACK_MODEL')

export const runManager = async (params: {
  stateDir: string
  workDir: string
  inputs: string[]
  results: TaskResult[]
  tasks: Task[]
  history: HistoryMessage[]
  env?: ManagerEnv
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
  const prompt = await buildManagerPrompt({
    workDir: params.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
    history: params.history,
    ...(params.env ? { env: params.env } : {}),
  })
  const model = normalizeOptional(params.model)
  try {
    const result = await runManagerApi({
      prompt,
      timeoutMs: params.timeoutMs,
      ...(model ? { model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
    })
    await appendLlmArchive(params.stateDir, {
      role: 'manager',
      attempt: 'primary',
      prompt,
      output: result.output,
      ok: true,
      elapsedMs: result.elapsedMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(model ? { model } : {}),
    })
    return {
      output: result.output,
      elapsedMs: result.elapsedMs,
      fallbackUsed: false,
      ...(result.usage ? { usage: result.usage } : {}),
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    await appendLlmArchive(params.stateDir, {
      role: 'manager',
      attempt: 'primary',
      prompt,
      output: '',
      ok: false,
      error: err.message,
      ...(err.name ? { errorName: err.name } : {}),
      ...(model ? { model } : {}),
    })
    const fallbackModel = normalizeOptional(
      params.fallbackModel ?? DEFAULT_MANAGER_FALLBACK_MODEL,
    )
    if (!fallbackModel) throw error
    try {
      const llmResult = await runManagerApi({
        prompt,
        timeoutMs: params.timeoutMs,
        model: fallbackModel,
        ...(params.modelReasoningEffort
          ? { modelReasoningEffort: params.modelReasoningEffort }
          : {}),
      })
      await appendLlmArchive(params.stateDir, {
        role: 'manager',
        attempt: 'fallback',
        prompt,
        output: llmResult.output,
        ok: true,
        elapsedMs: llmResult.elapsedMs,
        ...(llmResult.usage ? { usage: llmResult.usage } : {}),
        model: fallbackModel,
      })
      return {
        output: llmResult.output,
        elapsedMs: llmResult.elapsedMs,
        fallbackUsed: true,
        ...(llmResult.usage ? { usage: llmResult.usage } : {}),
      }
    } catch (fallbackError) {
      const err =
        fallbackError instanceof Error
          ? fallbackError
          : new Error(String(fallbackError))
      await appendLlmArchive(params.stateDir, {
        role: 'manager',
        attempt: 'fallback',
        prompt,
        output: '',
        ok: false,
        error: err.message,
        ...(err.name ? { errorName: err.name } : {}),
        model: fallbackModel,
      })
      throw fallbackError
    }
  }
}

export const runWorker = async (params: {
  stateDir: string
  workDir: string
  task: Task
  timeoutMs: number
  model?: string
}): Promise<{ output: string; elapsedMs: number; usage?: TokenUsage }> => {
  const prompt = await buildWorkerPrompt({
    workDir: params.workDir,
    task: params.task,
  })
  try {
    const llmResult = await runCodexSdk({
      role: 'worker',
      prompt,
      workDir: params.workDir,
      timeoutMs: params.timeoutMs,
      ...(params.model ? { model: params.model } : {}),
    })
    await appendLlmArchive(params.stateDir, {
      role: 'worker',
      prompt,
      output: llmResult.output,
      ok: true,
      elapsedMs: llmResult.elapsedMs,
      ...(llmResult.usage ? { usage: llmResult.usage } : {}),
      ...(params.model ? { model: params.model } : {}),
      ...(llmResult.threadId !== undefined
        ? { threadId: llmResult.threadId }
        : {}),
      taskId: params.task.id,
    })
    return {
      output: llmResult.output,
      elapsedMs: llmResult.elapsedMs,
      ...(llmResult.usage ? { usage: llmResult.usage } : {}),
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    await appendLlmArchive(params.stateDir, {
      role: 'worker',
      prompt,
      output: '',
      ok: false,
      error: err.message,
      ...(err.name ? { errorName: err.name } : {}),
      ...(params.model ? { model: params.model } : {}),
      taskId: params.task.id,
    })
    throw error
  }
}
