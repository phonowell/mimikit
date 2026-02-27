import { mergeUsageAdditive } from '../shared/token-usage.js'
import { appendTraceArchiveResult } from '../storage/traces-archive.js'
import { renderPromptTemplate } from '../prompts/format.js'
import { isAbortLikeError } from './error-utils.js'

import type { Task, TokenUsage } from '../types/index.js'
import type { TraceArchiveEntry, TraceArchiveResult } from '../storage/traces-archive.js'

export const SKILL_USAGE_DONE_TAG_PATTERN =
  '<M:skill_usage status="done">{skill-a,skill-b}</M:skill_usage>'
export const MAX_RUN_ROUNDS = 3
export const MAX_CONTINUE_LATEST_OUTPUT_CHARS = 1_600

const SKILL_USAGE_DONE_TEST_RE = /<M:skill_usage\b[^>]*\bstatus\s*=\s*(['"])done\1[^>]*>[\s\S]*?<\/M:skill_usage>/i
const SKILL_USAGE_DONE_STRIP_RE = /<M:skill_usage\b[^>]*\bstatus\s*=\s*(['"])done\1[^>]*>[\s\S]*?<\/M:skill_usage>/gi

export const hasDoneMarker = (output: string): boolean =>
  SKILL_USAGE_DONE_TEST_RE.test(output)

export const stripDoneMarker = (output: string): string =>
  output.replace(SKILL_USAGE_DONE_STRIP_RE, '').trim()

const clipLatestOutput = (value: string): string => {
  const normalized = value.trim()
  if (normalized.length <= MAX_CONTINUE_LATEST_OUTPUT_CHARS) return normalized
  return `${normalized
    .slice(0, MAX_CONTINUE_LATEST_OUTPUT_CHARS - 3)
    .trimEnd()}...`
}

export const buildContinuePrompt = (
  template: string,
  templatePath: string,
  latestOutput: string,
  nextRound: number,
): string =>
  renderPromptTemplate(
    template,
    {
      done_tag_pattern: SKILL_USAGE_DONE_TAG_PATTERN,
      latest_output: clipLatestOutput(latestOutput),
      next_round: String(nextRound),
      max_rounds: String(MAX_RUN_ROUNDS),
    },
    templatePath,
  )

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

export type RunLoopParams = {
  stateDir: string
  task: Task
  prompt: string
  continueTemplate: string
  continueTemplatePath: string
  archiveBase: Omit<TraceArchiveEntry, 'prompt' | 'output' | 'ok'>
  runModel: (input: RunModelInput) => Promise<ProviderResult>
  onUsage?: (usage: TokenUsage) => void
  abortSignal?: AbortSignal
}

export const runWorkerLoop = async (params: RunLoopParams): Promise<{
  output: string
  elapsedMs: number
  usage?: TokenUsage
}> => {
  const { stateDir, task, prompt } = params
  let threadId: string | null | undefined
  let totalUsage: TokenUsage | undefined
  let totalElapsedMs = 0
  let latestResult: ProviderResult | undefined
  let nextPrompt = prompt

  const archiveResult = (
    base: Omit<TraceArchiveEntry, 'prompt' | 'output' | 'ok'>,
    result: TraceArchiveResult,
  ) => appendTraceArchiveResult(stateDir, base, prompt, result)

  try {
    for (let round = 1; round <= MAX_RUN_ROUNDS; round += 1) {
      const result = await params.runModel({
        prompt: nextPrompt,
        ...(threadId !== undefined ? { threadId } : {}),
        onUsage: (usage) => {
          totalUsage = mergeUsageAdditive(totalUsage, usage)
          if (!totalUsage) return
          task.usage = totalUsage
          params.onUsage?.(totalUsage)
        },
      })
      latestResult = result
      totalElapsedMs += result.elapsedMs
      threadId = result.threadId ?? threadId ?? null
      totalUsage = mergeUsageAdditive(totalUsage, result.usage)
      if (totalUsage) {
        task.usage = totalUsage
        params.onUsage?.(totalUsage)
      }

      const output = result.output.trim()
      if (hasDoneMarker(output)) {
        const finalOutput = stripDoneMarker(output)
        await archiveResult(
          { ...params.archiveBase, threadId },
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
        nextPrompt = buildContinuePrompt(
          params.continueTemplate,
          params.continueTemplatePath,
          output,
          round + 1,
        )
    }

    throw new Error(
      `[worker] task incomplete after ${MAX_RUN_ROUNDS} rounds: missing M:skill_usage status="done"; last_output=${JSON.stringify(latestResult?.output.trim() ?? 'empty_output')}`,
    )
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const canceled =
      Boolean(params.abortSignal?.aborted) && isAbortLikeError(err)
    await archiveResult(
      {
        ...params.archiveBase,
        ...(threadId !== undefined ? { threadId } : {}),
      },
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
