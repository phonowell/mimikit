import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import { renderPromptTemplate } from '../prompts/format.js'
import { loadPromptFile } from '../prompts/prompt-loader.js'

import {
  appendProfileProgress,
  archiveWorkerResult,
  buildRunModel,
} from './profiled-runner-helpers.js'

import type {
  LlmResult,
  ProviderResult,
  WorkerProfile,
  WorkerProvider,
} from './profiled-runner-helpers.js'
import type { Task, TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'
const DONE_MARKER = '<M:TASK_DONE/>'
const MAX_RUN_ROUNDS = 3

const hasDoneMarker = (output: string): boolean => output.includes(DONE_MARKER)

const stripDoneMarker = (output: string): string =>
  output.replaceAll(DONE_MARKER, '').trim()

const mergeUsage = (
  current: TokenUsage | undefined,
  next: TokenUsage | undefined,
): TokenUsage | undefined => {
  if (!next) return current
  const input =
    next.input !== undefined
      ? (current?.input ?? 0) + next.input
      : current?.input
  const output =
    next.output !== undefined
      ? (current?.output ?? 0) + next.output
      : current?.output
  const total =
    next.total !== undefined
      ? (current?.total ?? 0) + next.total
      : current?.total
  if (input === undefined && output === undefined && total === undefined)
    return undefined
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(total !== undefined ? { total } : {}),
  }
}

const isSameUsage = (
  left: TokenUsage | undefined,
  right: TokenUsage | undefined,
): boolean =>
  left?.input === right?.input &&
  left?.output === right?.output &&
  left?.total === right?.total

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

export const runStandardWorker = (params: {
  stateDir: string
  workDir: string
  task: Task
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
  onUsage?: (usage: TokenUsage) => void
}): Promise<LlmResult> =>
  runProfiledWorker({
    ...params,
    provider: 'opencode',
    profile: 'standard',
  })

export const runSpecialistWorker = (params: {
  stateDir: string
  workDir: string
  task: Task
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
  onUsage?: (usage: TokenUsage) => void
}): Promise<LlmResult> =>
  runProfiledWorker({
    ...params,
    provider: 'codex-sdk',
    profile: 'specialist',
  })

export const runProfiledWorker = async (params: {
  stateDir: string
  workDir: string
  task: Task
  timeoutMs: number
  provider: WorkerProvider
  profile: WorkerProfile
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
  onUsage?: (usage: TokenUsage) => void
}): Promise<LlmResult> => {
  const prompt = await buildWorkerPrompt({
    workDir: params.workDir,
    task: params.task,
  })
  const continueTemplate = await loadPromptFile('worker', 'continue-until-done')
  const base = {
    role: 'worker' as const,
    taskId: params.task.id,
    ...(params.model ? { model: params.model } : {}),
  }
  const runModel = buildRunModel(params)
  await appendProfileProgress({
    stateDir: params.stateDir,
    taskId: params.task.id,
    profile: params.profile,
    phase: 'start',
    payload: {},
  })

  let threadId: string | null | undefined
  try {
    let totalUsage: TokenUsage | undefined
    let totalElapsedMs = 0
    let rounds = 0
    let latestResult: ProviderResult | undefined
    let nextPrompt = prompt

    for (let round = 1; round <= MAX_RUN_ROUNDS; round += 1) {
      const usageBeforeRound = totalUsage
      let callbackRoundUsage: TokenUsage | undefined
      let callbackReportedUsage: TokenUsage | undefined
      rounds = round
      const result = await runModel({
        prompt: nextPrompt,
        ...(threadId !== undefined ? { threadId } : {}),
        onUsage: (usage) => {
          callbackRoundUsage = usage
          const previewUsage = mergeUsage(usageBeforeRound, usage)
          if (!previewUsage) return
          totalUsage = previewUsage
          params.task.usage = previewUsage
          callbackReportedUsage = previewUsage
          params.onUsage?.(previewUsage)
        },
      })
      latestResult = result
      totalElapsedMs += result.elapsedMs
      threadId = result.threadId ?? threadId ?? null
      const roundUsage = callbackRoundUsage ?? result.usage
      const hasRoundUsage = roundUsage !== undefined
      const mergedUsage = mergeUsage(usageBeforeRound, roundUsage)
      totalUsage = mergedUsage ?? usageBeforeRound
      if (totalUsage) {
        params.task.usage = totalUsage
        const shouldReportAfterRound =
          hasRoundUsage && !isSameUsage(callbackReportedUsage, totalUsage)
        if (shouldReportAfterRound) params.onUsage?.(totalUsage)
      }

      const output = result.output.trim()
      if (hasDoneMarker(output)) {
        const finalOutput = stripDoneMarker(output)
        await appendProfileProgress({
          stateDir: params.stateDir,
          taskId: params.task.id,
          profile: params.profile,
          phase: 'done',
          payload: { elapsedMs: totalElapsedMs, rounds },
        })
        await archiveWorkerResult(
          params.stateDir,
          {
            ...base,
            threadId,
          },
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

      if (round === MAX_RUN_ROUNDS) break
      nextPrompt = buildContinuePrompt(continueTemplate, output, round + 1)
    }

    const detail = latestResult?.output.trim() ?? 'empty_output'
    throw new Error(
      `[worker:${params.profile}] task incomplete after ${MAX_RUN_ROUNDS} rounds: missing ${DONE_MARKER}; last_output=${JSON.stringify(detail)}`,
    )
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    await archiveWorkerResult(
      params.stateDir,
      {
        ...base,
        ...(threadId !== undefined ? { threadId } : {}),
      },
      prompt,
      {
        output: '',
        ok: false,
        error: err.message,
        errorName: err.name,
      },
    )
    throw error
  }
}
