import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import { runWithProvider } from '../providers/run.js'
import {
  appendLlmArchiveResult,
  type LlmArchiveEntry,
  type LlmArchiveResult,
} from '../storage/llm-archive.js'
import { appendTaskProgress } from '../storage/task-progress.js'

import {
  buildFinalOutputRepairHint,
  validateWorkerFinalOutput,
} from './final-output.js'
import { mergeUsage } from './task-usage.js'

import type { Task, TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type LlmResult = { output: string; elapsedMs: number; usage?: TokenUsage }
type ProviderResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
  threadId?: string | null
}

const archiveWorkerResult = (
  stateDir: string,
  base: Omit<LlmArchiveEntry, 'prompt' | 'output' | 'ok'>,
  prompt: string,
  result: LlmArchiveResult,
) => appendLlmArchiveResult(stateDir, base, prompt, result)

export const runSpecialistWorker = async (params: {
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
  const runModel = (workerPrompt: string): Promise<ProviderResult> =>
    runWithProvider({
      provider: 'codex-sdk',
      role: 'worker',
      prompt: workerPrompt,
      workDir: params.workDir,
      timeoutMs: params.timeoutMs,
      ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
      ...(params.model ? { model: params.model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
    })

  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.task.id,
    type: 'specialist_start',
    payload: {},
  })

  try {
    const first = await runModel(prompt)
    if (first.usage) params.task.usage = first.usage
    const firstValidation = validateWorkerFinalOutput({
      raw: first.output,
      profile: 'specialist',
    })
    if (firstValidation.ok) {
      await appendTaskProgress({
        stateDir: params.stateDir,
        taskId: params.task.id,
        type: 'specialist_final_validated',
        payload: {
          repaired: false,
          blockerCount: firstValidation.data.execution_insights.blockers.length,
        },
      })
      await appendTaskProgress({
        stateDir: params.stateDir,
        taskId: params.task.id,
        type: 'specialist_done',
        payload: { repaired: false },
      })
      await archiveWorkerResult(
        params.stateDir,
        {
          ...base,
          ...(first.threadId !== undefined ? { threadId: first.threadId } : {}),
        },
        prompt,
        { ...first, output: firstValidation.serialized, ok: true },
      )
      return {
        output: firstValidation.serialized,
        elapsedMs: first.elapsedMs,
        ...(first.usage ? { usage: first.usage } : {}),
      }
    }

    await appendTaskProgress({
      stateDir: params.stateDir,
      taskId: params.task.id,
      type: 'specialist_final_rejected',
      payload: { repaired: false, errors: firstValidation.errors },
    })
    await appendTaskProgress({
      stateDir: params.stateDir,
      taskId: params.task.id,
      type: 'specialist_self_repair',
      payload: { errors: firstValidation.errors },
    })
    const repairPrompt = [
      prompt,
      '',
      '<MIMIKIT:repair_hint>',
      buildFinalOutputRepairHint(firstValidation.errors),
      '</MIMIKIT:repair_hint>',
      '',
      '<MIMIKIT:previous_output>',
      first.output,
      '</MIMIKIT:previous_output>',
    ].join('\n')
    const repaired = await runModel(repairPrompt)
    const repairedValidation = validateWorkerFinalOutput({
      raw: repaired.output,
      profile: 'specialist',
    })
    if (!repairedValidation.ok) {
      await appendTaskProgress({
        stateDir: params.stateDir,
        taskId: params.task.id,
        type: 'specialist_final_rejected',
        payload: { repaired: true, errors: repairedValidation.errors },
      })
      throw new Error(
        `specialist_final_output_invalid:${repairedValidation.errors.join('|')}`,
      )
    }

    await appendTaskProgress({
      stateDir: params.stateDir,
      taskId: params.task.id,
      type: 'specialist_final_validated',
      payload: {
        repaired: true,
        blockerCount:
          repairedValidation.data.execution_insights.blockers.length,
      },
    })
    await appendTaskProgress({
      stateDir: params.stateDir,
      taskId: params.task.id,
      type: 'specialist_done',
      payload: { repaired: true },
    })
    await archiveWorkerResult(
      params.stateDir,
      {
        ...base,
        ...(repaired.threadId !== undefined
          ? { threadId: repaired.threadId }
          : {}),
      },
      repairPrompt,
      { ...repaired, output: repairedValidation.serialized, ok: true },
    )
    const usage = mergeUsage(first.usage, repaired.usage)
    if (usage) params.task.usage = usage
    return {
      output: repairedValidation.serialized,
      elapsedMs: first.elapsedMs + repaired.elapsedMs,
      ...(usage ? { usage } : {}),
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
