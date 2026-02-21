import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import { loadPromptFile } from '../prompts/prompt-loader.js'

import {
  appendWorkerProgress,
  archiveWorkerResult,
  buildRunModel,
} from './profiled-runner-helpers.js'
import {
  buildContinuePrompt,
  DONE_MARKER,
  hasDoneMarker,
  MAX_RUN_ROUNDS,
  mergeUsage,
  stripDoneMarker,
} from './profiled-runner-utils.js'

import type { LlmResult, ProviderResult } from './profiled-runner-helpers.js'
import type { Task, TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

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

  await appendWorkerProgress({
    stateDir: params.stateDir,
    taskId: params.task.id,
    phase: 'start',
    payload: {},
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
          totalUsage = mergeUsage(totalUsage, usage)
          if (!totalUsage) return
          params.task.usage = totalUsage
          params.onUsage?.(totalUsage)
        },
      })
      latestResult = result
      totalElapsedMs += result.elapsedMs
      threadId = result.threadId ?? threadId ?? null
      totalUsage = mergeUsage(totalUsage, result.usage)
      if (totalUsage) {
        params.task.usage = totalUsage
        params.onUsage?.(totalUsage)
      }

      const output = result.output.trim()
      if (hasDoneMarker(output)) {
        const finalOutput = stripDoneMarker(output)
        await appendWorkerProgress({
          stateDir: params.stateDir,
          taskId: params.task.id,
          phase: 'done',
          payload: { elapsedMs: totalElapsedMs, rounds: round },
        })
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
    await archiveWorkerResult(
      params.stateDir,
      { ...archiveBase, ...(threadId !== undefined ? { threadId } : {}) },
      prompt,
      { output: '', ok: false, error: err.message, errorName: err.name },
    )
    throw error
  }
}
