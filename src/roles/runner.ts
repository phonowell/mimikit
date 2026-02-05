import { runManagerApi } from '../llm/api-runner.js'
import { runCodexSdk } from '../llm/sdk-runner.js'
import {
  appendLlmArchive,
  type LlmArchiveEntry,
} from '../storage/llm-archive.js'

import { buildManagerPrompt, buildWorkerPrompt } from './prompt.js'

import type { ManagerEnv } from './prompt.js'
import type {
  HistoryMessage,
  Task,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type LlmResult = { output: string; elapsedMs: number; usage?: TokenUsage }

const readEnvOptional = (key: string): string | undefined => {
  const raw = process.env[key]
  const trimmed = raw?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const normalizeOptional = (value?: string | null): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const archive = (
  stateDir: string,
  base: Omit<LlmArchiveEntry, 'prompt' | 'output' | 'ok'>,
  prompt: string,
  result: {
    output: string
    ok: boolean
    elapsedMs?: number
    usage?: TokenUsage
    error?: string
    errorName?: string
  },
) =>
  appendLlmArchive(stateDir, {
    ...base,
    prompt,
    output: result.output,
    ok: result.ok,
    ...(result.elapsedMs !== undefined ? { elapsedMs: result.elapsedMs } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.errorName ? { errorName: result.errorName } : {}),
  })

const toError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(String(err))

const DEFAULT_MANAGER_FALLBACK_MODEL = readEnvOptional('MIMIKIT_FALLBACK_MODEL')

export const runManager = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
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
  const base = { role: 'manager' as const, ...(model ? { model } : {}) }
  const effort = params.modelReasoningEffort
    ? { modelReasoningEffort: params.modelReasoningEffort }
    : {}
  try {
    const r = await runManagerApi({
      prompt,
      timeoutMs: params.timeoutMs,
      ...(model ? { model } : {}),
      ...effort,
    })
    await archive(params.stateDir, { ...base, attempt: 'primary' }, prompt, {
      ...r,
      ok: true,
    })
    return {
      output: r.output,
      elapsedMs: r.elapsedMs,
      fallbackUsed: false,
      ...(r.usage ? { usage: r.usage } : {}),
    }
  } catch (error) {
    const err = toError(error)
    await archive(params.stateDir, { ...base, attempt: 'primary' }, prompt, {
      output: '',
      ok: false,
      error: err.message,
      errorName: err.name,
    })
    const fallbackModel = normalizeOptional(
      params.fallbackModel ?? DEFAULT_MANAGER_FALLBACK_MODEL,
    )
    if (!fallbackModel) throw error
    try {
      const r = await runManagerApi({
        prompt,
        timeoutMs: params.timeoutMs,
        model: fallbackModel,
        ...effort,
      })
      await archive(
        params.stateDir,
        { role: 'manager', model: fallbackModel, attempt: 'fallback' },
        prompt,
        { ...r, ok: true },
      )
      return {
        output: r.output,
        elapsedMs: r.elapsedMs,
        fallbackUsed: true,
        ...(r.usage ? { usage: r.usage } : {}),
      }
    } catch (fbError) {
      const fbErr = toError(fbError)
      await archive(
        params.stateDir,
        { role: 'manager', model: fallbackModel, attempt: 'fallback' },
        prompt,
        { output: '', ok: false, error: fbErr.message, errorName: fbErr.name },
      )
      throw fbError
    }
  }
}

export const runWorker = async (params: {
  stateDir: string
  workDir: string
  task: Task
  timeoutMs: number
  model?: string
  abortSignal?: AbortSignal
}): Promise<LlmResult> => {
  const prompt = await buildWorkerPrompt({
    workDir: params.workDir,
    task: params.task,
  })
  const base = {
    role: 'worker' as const,
    taskId: params.task.id,
    ...(params.model ? { model: params.model } : {}),
  }
  try {
    const r = await runCodexSdk({
      role: 'worker',
      prompt,
      workDir: params.workDir,
      timeoutMs: params.timeoutMs,
      ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
      ...(params.model ? { model: params.model } : {}),
    })
    await archive(
      params.stateDir,
      {
        ...base,
        ...(r.threadId !== undefined ? { threadId: r.threadId } : {}),
      },
      prompt,
      { ...r, ok: true },
    )
    return {
      output: r.output,
      elapsedMs: r.elapsedMs,
      ...(r.usage ? { usage: r.usage } : {}),
    }
  } catch (error) {
    const err = toError(error)
    await archive(params.stateDir, base, prompt, {
      output: '',
      ok: false,
      error: err.message,
      errorName: err.name,
    })
    throw error
  }
}
