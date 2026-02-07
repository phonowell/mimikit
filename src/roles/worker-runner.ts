import { runCodexSdk } from '../llm/sdk-runner.js'
import {
  appendLlmArchive,
  type LlmArchiveEntry,
} from '../storage/llm-archive.js'

import { buildWorkerPrompt } from './prompt.js'

import type { Task, TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type LlmResult = { output: string; elapsedMs: number; usage?: TokenUsage }

const archiveEntry = (
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

export const runWorker = async (params: {
  stateDir: string
  workDir: string
  task: Task
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
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
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
    })
    await archiveEntry(
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
    const err = error instanceof Error ? error : new Error(String(error))
    await archiveEntry(params.stateDir, base, prompt, {
      output: '',
      ok: false,
      error: err.message,
      errorName: err.name,
    })
    throw error
  }
}
