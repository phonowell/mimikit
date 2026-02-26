import { runWithProvider } from '../providers/registry.js'
import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import { loadPromptFile } from '../prompts/prompt-loader.js'
import { renderPromptTemplate } from '../prompts/format.js'
import { mergeUsageAdditive } from '../shared/token-usage.js'
import { appendTaskProgress } from '../storage/task-progress.js'
import {
  appendTraceArchiveResult,
  type TraceArchiveEntry,
  type TraceArchiveResult,
} from '../storage/traces-archive.js'

import type { Task, TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type LlmResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
}

type ProviderResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
  threadId?: string | null
}

type RunModelInput = {
  prompt: string
  threadId?: string | null
  onUsage?: (usage: TokenUsage) => void
}

type BuildRunModelParams = {
  workDir: string
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
}

const archiveWorkerResult = (
  stateDir: string,
  base: Omit<TraceArchiveEntry, 'prompt' | 'output' | 'ok'>,
  prompt: string,
  result: TraceArchiveResult,
) => appendTraceArchiveResult(stateDir, base, prompt, result)

const buildRunModel =
  (params: BuildRunModelParams) =>
  (input: RunModelInput): Promise<ProviderResult> =>
    runWithProvider({
      provider: 'codex-sdk',
      role: 'worker',
      prompt: input.prompt,
      workDir: params.workDir,
      timeoutMs: params.timeoutMs,
      ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
      ...(params.model ? { model: params.model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
      ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
      ...(input.onUsage ? { onUsage: input.onUsage } : {}),
    })

const DONE_MARKER = '<M:task_done/>'
const MAX_RUN_ROUNDS = 3
const hasDoneMarker = (output: string): boolean =>
  output.includes(DONE_MARKER)

const stripDoneMarker = (output: string): string =>
  output.replaceAll(DONE_MARKER, '').trim()

const isAbortLikeError = (error: Error): boolean =>
  error.name === 'AbortError' || /aborted|canceled/i.test(error.message)

const buildContinuePrompt = (
  template: string,
  latestOutput: string,
  nextRound: number,
): string =>
  renderPromptTemplate(template, {
    done_marker: DONE_MARKER,
    latest_output: latestOutput.trim(),
    next_round: String(nextRound),
    max_rounds: String(MAX_RUN_ROUNDS),
  })

type WorkerRunnerParams = {
  stateDir: string
  workDir: string
  task: Task
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
  onUsage?: (usage: TokenUsage) => void
}

export const runWorker = async (
  params: WorkerRunnerParams,
): Promise<LlmResult> => {
  const prompt = await buildWorkerPrompt({
    workDir: params.workDir,
    task: params.task,
  })
  const continueTemplate = await loadPromptFile('worker', 'continue-until-done')
  const runModel = buildRunModel(params)
  const archiveBase = {
    role: 'worker' as const,
    taskId: params.task.id,
    ...(params.model ? { model: params.model } : {}),
  }

  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.task.id,
    type: 'worker_start',
  })

  let threadId: string | null | undefined
  let totalUsage: TokenUsage | undefined
  let totalElapsedMs = 0
  let latestResult: ProviderResult | undefined
  let nextPrompt = prompt

  try {
    for (let round = 1; round <= MAX_RUN_ROUNDS; round += 1) {
      const result = await runModel({
        prompt: nextPrompt,
        ...(threadId !== undefined ? { threadId } : {}),
        onUsage: (usage) => {
          totalUsage = mergeUsageAdditive(totalUsage, usage)
          if (!totalUsage) return
          params.task.usage = totalUsage
          params.onUsage?.(totalUsage)
        },
      })
      latestResult = result
      totalElapsedMs += result.elapsedMs
      threadId = result.threadId ?? threadId ?? null
      totalUsage = mergeUsageAdditive(totalUsage, result.usage)
      if (totalUsage) {
        params.task.usage = totalUsage
        params.onUsage?.(totalUsage)
      }

      const output = result.output.trim()
      if (hasDoneMarker(output)) {
        const finalOutput = stripDoneMarker(output)
        await archiveWorkerResult(
          params.stateDir,
          { ...archiveBase, threadId },
          prompt,
          {
            output: finalOutput,
            ok: true,
            elapsedMs: totalElapsedMs,
            ...(totalUsage ? { usage: totalUsage } : {}),
          },
        )
        return {
          output: finalOutput,
          elapsedMs: totalElapsedMs,
          ...(totalUsage ? { usage: totalUsage } : {}),
        }
      }

      if (round < MAX_RUN_ROUNDS)
        nextPrompt = buildContinuePrompt(continueTemplate, output, round + 1)
    }

    throw new Error(
      `[worker] task incomplete after ${MAX_RUN_ROUNDS} rounds: missing ${DONE_MARKER}; last_output=${JSON.stringify(latestResult?.output.trim() ?? 'empty_output')}`,
    )
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const canceled =
      Boolean(params.abortSignal?.aborted) && isAbortLikeError(err)
    await archiveWorkerResult(
      params.stateDir,
      { ...archiveBase, ...(threadId !== undefined ? { threadId } : {}) },
      prompt,
      {
        output: '',
        ok: false,
        error: canceled ? 'Task canceled' : err.message,
        errorName: canceled ? 'TaskCanceledError' : err.name,
      },
    )
    throw error
  }
}
