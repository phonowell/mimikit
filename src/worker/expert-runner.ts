import { runCodexSdk } from '../llm/sdk-runner.js'
import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import {
  appendLlmArchiveResult,
  type LlmArchiveEntry,
  type LlmArchiveResult,
} from '../storage/llm-archive.js'

import type { Task, TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type LlmResult = { output: string; elapsedMs: number; usage?: TokenUsage }

const archiveWorkerResult = (
  stateDir: string,
  base: Omit<LlmArchiveEntry, 'prompt' | 'output' | 'ok'>,
  prompt: string,
  result: LlmArchiveResult,
) => appendLlmArchiveResult(stateDir, base, prompt, result)

export const runExpertWorker = async (params: {
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
    await archiveWorkerResult(
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
    await archiveWorkerResult(params.stateDir, base, prompt, {
      output: '',
      ok: false,
      error: err.message,
      errorName: err.name,
    })
    throw error
  }
}
