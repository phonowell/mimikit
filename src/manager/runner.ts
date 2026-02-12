import { buildManagerPrompt } from '../prompts/build-prompts.js'
import { runWithProvider } from '../providers/run.js'
import {
  buildLlmArchiveLookupKey,
  type LlmArchiveLookup,
} from '../storage/llm-archive.js'

import {
  archiveManagerResult,
  DEFAULT_MANAGER_FALLBACK_MODEL,
  normalizeOptional,
  toError,
  withSampling,
} from './archive-helpers.js'
import { resolveManagerTimeoutMs } from './timeout.js'

import type {
  HistoryMessage,
  ManagerEnv,
  Task,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export const runManager = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  history: HistoryMessage[]
  env?: ManagerEnv
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  seed?: number
  temperature?: number
  fallbackModel?: string
}): Promise<{
  output: string
  elapsedMs: number
  fallbackUsed: boolean
  usage?: TokenUsage
}> => {
  const prompt = await buildManagerPrompt({
    stateDir: params.stateDir,
    workDir: params.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
    history: params.history,
    ...(params.env ? { env: params.env } : {}),
  })
  const model = normalizeOptional(params.model)
  const lookup: LlmArchiveLookup = {
    role: 'manager',
    ...(model ? { model } : {}),
    prompt,
    messages: [{ role: 'user', content: prompt }],
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
    ...(params.temperature !== undefined
      ? { temperature: params.temperature }
      : {}),
  }
  const requestKey = buildLlmArchiveLookupKey(lookup)
  const base = { role: 'manager' as const, ...(model ? { model } : {}) }
  const fallbackModel = normalizeOptional(
    params.fallbackModel ?? DEFAULT_MANAGER_FALLBACK_MODEL,
  )
  const timeoutMs = resolveManagerTimeoutMs(prompt)
  const fallbackRequestKey = fallbackModel
    ? buildLlmArchiveLookupKey({
        ...lookup,
        model: fallbackModel,
        attempt: 'fallback',
      })
    : undefined
  try {
    const r = await runWithProvider({
      provider: 'openai-chat',
      prompt,
      timeoutMs,
      ...(model ? { model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
      ...(params.seed !== undefined ? { seed: params.seed } : {}),
      ...(params.temperature !== undefined
        ? { temperature: params.temperature }
        : {}),
    })
    await archiveManagerResult(
      params.stateDir,
      {
        ...base,
        attempt: 'primary',
        requestKey,
        ...withSampling(params),
      },
      prompt,
      {
        ...r,
        ok: true,
      },
    )
    return {
      output: r.output,
      elapsedMs: r.elapsedMs,
      fallbackUsed: false,
      ...(r.usage ? { usage: r.usage } : {}),
    }
  } catch (error) {
    const err = toError(error)
    await archiveManagerResult(
      params.stateDir,
      {
        ...base,
        attempt: 'primary',
        requestKey,
        ...withSampling(params),
      },
      prompt,
      {
        output: '',
        ok: false,
        error: err.message,
        errorName: err.name,
      },
    )
    if (!fallbackModel) throw error
    try {
      const r = await runWithProvider({
        provider: 'openai-chat',
        prompt,
        timeoutMs,
        model: fallbackModel,
        ...(params.modelReasoningEffort
          ? { modelReasoningEffort: params.modelReasoningEffort }
          : {}),
        ...(params.seed !== undefined ? { seed: params.seed } : {}),
        ...(params.temperature !== undefined
          ? { temperature: params.temperature }
          : {}),
      })
      await archiveManagerResult(
        params.stateDir,
        {
          role: 'manager',
          model: fallbackModel,
          attempt: 'fallback',
          ...(fallbackRequestKey ? { requestKey: fallbackRequestKey } : {}),
          ...withSampling(params),
        },
        prompt,
        { ...r, ok: true },
      )
      return {
        output: r.output,
        elapsedMs: r.elapsedMs,
        fallbackUsed: true,
        ...(r.usage ? { usage: r.usage } : {}),
      }
    } catch (fallbackError) {
      const fallbackErr = toError(fallbackError)
      await archiveManagerResult(
        params.stateDir,
        {
          role: 'manager',
          model: fallbackModel,
          attempt: 'fallback',
          ...(fallbackRequestKey ? { requestKey: fallbackRequestKey } : {}),
          ...withSampling(params),
        },
        prompt,
        {
          output: '',
          ok: false,
          error: fallbackErr.message,
          errorName: fallbackErr.name,
        },
      )
      throw fallbackError
    }
  }
}
