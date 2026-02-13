import { buildManagerPrompt } from '../prompts/build-prompts.js'
import { runWithProvider } from '../providers/registry.js'
import {
  appendLlmArchiveResult,
  buildLlmArchiveLookupKey,
  type LlmArchiveEntry,
  type LlmArchiveLookup,
  type LlmArchiveResult,
} from '../storage/llm-archive.js'

import type {
  CronJob,
  HistoryMessage,
  ManagerEnv,
  Task,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const normalizeOptional = (value?: string | null): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

const DEFAULT_FALLBACK_MODEL = normalizeOptional(
  process.env['MIMIKIT_FALLBACK_MODEL'],
)

const toError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(String(err))

const BYTE_STEP = 1_024
const TIMEOUT_STEP_MS = 2_500
export const MIN_MANAGER_TIMEOUT_MS = 60_000
export const MAX_MANAGER_TIMEOUT_MS = 120_000

export const resolveManagerTimeoutMs = (prompt: string): number => {
  const promptBytes = Buffer.byteLength(prompt, 'utf8')
  const stepCount = Math.ceil(promptBytes / BYTE_STEP)
  const computed = MIN_MANAGER_TIMEOUT_MS + stepCount * TIMEOUT_STEP_MS
  return Math.max(MIN_MANAGER_TIMEOUT_MS, Math.min(MAX_MANAGER_TIMEOUT_MS, computed))
}

export const runManager = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  cronJobs?: CronJob[]
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
    ...(params.cronJobs ? { cronJobs: params.cronJobs } : {}),
    history: params.history,
    ...(params.env ? { env: params.env } : {}),
  })
  const model = normalizeOptional(params.model)
  const sampling = {
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
    ...(params.temperature !== undefined
      ? { temperature: params.temperature }
      : {}),
  }
  const lookup: LlmArchiveLookup = {
    role: 'manager',
    ...(model ? { model } : {}),
    prompt,
    messages: [{ role: 'user', content: prompt }],
    ...sampling,
  }
  const requestKey = buildLlmArchiveLookupKey(lookup)
  const fallbackModel = normalizeOptional(
    params.fallbackModel ?? DEFAULT_FALLBACK_MODEL,
  )
  const timeoutMs = resolveManagerTimeoutMs(prompt)
  const fallbackRequestKey = fallbackModel
    ? buildLlmArchiveLookupKey({
        ...lookup,
        model: fallbackModel,
        attempt: 'fallback',
      })
    : undefined

  type ArchiveBase = Omit<LlmArchiveEntry, 'prompt' | 'output' | 'ok'>
  const archive = (base: ArchiveBase, result: LlmArchiveResult) =>
    appendLlmArchiveResult(params.stateDir, base, prompt, result)

  const archiveBase = (
    callModel: string | undefined,
    label: 'primary' | 'fallback',
    key: string | undefined,
  ): ArchiveBase => ({
    role: 'manager',
    ...(callModel ? { model: callModel } : {}),
    attempt: label,
    ...(key ? { requestKey: key } : {}),
    ...sampling,
  })

  const callProvider = async (callModel: string | undefined) =>
    runWithProvider({
      provider: 'openai-chat',
      prompt,
      timeoutMs,
      ...(callModel ? { model: callModel } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
      ...sampling,
    })

  const toResult = (
    r: { output: string; elapsedMs: number; usage?: TokenUsage },
    fallbackUsed: boolean,
  ) => ({
    output: r.output,
    elapsedMs: r.elapsedMs,
    fallbackUsed,
    ...(r.usage ? { usage: r.usage } : {}),
  })

  try {
    const r = await callProvider(model)
    await archive(archiveBase(model, 'primary', requestKey), { ...r, ok: true })
    return toResult(r, false)
  } catch (error) {
    const err = toError(error)
    await archive(archiveBase(model, 'primary', requestKey), {
      output: '',
      ok: false,
      error: err.message,
      errorName: err.name,
    })
    if (!fallbackModel) throw error
    try {
      const r = await callProvider(fallbackModel)
      await archive(
        archiveBase(fallbackModel, 'fallback', fallbackRequestKey),
        { ...r, ok: true },
      )
      return toResult(r, true)
    } catch (fallbackError) {
      const fbErr = toError(fallbackError)
      await archive(
        archiveBase(fallbackModel, 'fallback', fallbackRequestKey),
        { output: '', ok: false, error: fbErr.message, errorName: fbErr.name },
      )
      throw fallbackError
    }
  }
}
